import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const TARGET_UID = process.env.AUTH_UID || process.env.DEV_AUTH_UID || "dev-user-1";
const CHANNEL_ID = String(process.env.CHANNEL_ID || "").trim();
const SOURCE_DIR = String(process.env.SOURCE_DIR || "").trim();
const STRIP_COPY_SUFFIX = ["1", "true", "yes"].includes(String(process.env.DEDUPE_STRIP_COPY_SUFFIX || "").toLowerCase());
const STORAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../storage");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

const B2_PUBLIC_BASE = String(process.env.B2_PUBLIC_BASE || "").replace(/\/$/, "");

const b2 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY
  }
});

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

function canonicalTitleForDedupe(title) {
  if (!STRIP_COPY_SUFFIX) {
    return title;
  }

  return String(title || "").replace(/\s*\((\d+)\)\s*$/u, "").trim();
}

function toCleanTitle(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  let title = withoutExt.replace(/^\[[^\]]+\]\s*/i, "");
  title = title.replace(/^[A-Z0-9.-]+\s*-\s*/i, "");
  title = title.replace(/\s*[\[(]\s*\d{3,4}\s*p?\s*[\])]\s*$/i, "");
  title = title
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title || "Untitled Video";
}

async function collectSourceTitleKeys(sourceDir) {
  if (!sourceDir) {
    return null;
  }

  const absoluteDir = path.resolve(sourceDir);
  const out = new Set();

  async function walk(current) {
    const items = await fs.readdir(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (item.isFile() && VIDEO_EXTENSIONS.has(path.extname(item.name).toLowerCase())) {
        out.add(normalizeTitle(toCleanTitle(item.name)));
      }
    }
  }

  await walk(absoluteDir);
  return out;
}

function extractB2KeyFromUrl(url) {
  if (!url || !B2_PUBLIC_BASE) return null;
  const withoutQuery = String(url).split("?")[0];
  const prefix = `${B2_PUBLIC_BASE}/`;
  if (!withoutQuery.startsWith(prefix)) return null;
  return withoutQuery.slice(prefix.length);
}

function choosePrimaryVideo(videos) {
  return [...videos].sort((a, b) => {
    if (a.viewCount !== b.viewCount) return b.viewCount - a.viewCount;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

function toSafeLocalPath(key) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(STORAGE_ROOT, normalized);
  const relative = path.relative(STORAGE_ROOT, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid local storage key: ${key}`);
  }
  return full;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { firebaseUid: TARGET_UID } });
  if (!user) {
    console.error(`No user found for firebase uid: ${TARGET_UID}`);
    process.exit(1);
  }

  const sourceTitleKeys = await collectSourceTitleKeys(SOURCE_DIR);
  const channelTag = CHANNEL_ID ? `__CHANNEL__:${CHANNEL_ID}` : "";

  const videos = await prisma.video.findMany({
    where: {
      userId: user.id,
      ...(channelTag ? { tags: { has: channelTag } } : {})
    },
    include: { qualities: true },
    orderBy: { createdAt: "asc" }
  });

  const considered = sourceTitleKeys
    ? videos.filter((video) => sourceTitleKeys.has(normalizeTitle(video.title)))
    : videos;

  const titleGroups = new Map();
  for (const video of considered) {
    const key = normalizeTitle(canonicalTitleForDedupe(video.title));
    if (!key) continue;
    const arr = titleGroups.get(key) || [];
    arr.push(video);
    titleGroups.set(key, arr);
  }

  const toDelete = new Map();

  for (const group of titleGroups.values()) {
    if (group.length <= 1) continue;
    const keep = choosePrimaryVideo(group);
    for (const video of group) {
      if (video.id !== keep.id) {
        toDelete.set(video.id, video);
      }
    }
  }

  const rawKeyGroups = new Map();
  for (const video of considered) {
    const key = video.rawFileKey || "";
    if (!key) continue;
    const arr = rawKeyGroups.get(key) || [];
    arr.push(video);
    rawKeyGroups.set(key, arr);
  }

  for (const group of rawKeyGroups.values()) {
    if (group.length <= 1) continue;
    const keep = choosePrimaryVideo(group);
    for (const video of group) {
      if (video.id !== keep.id) {
        toDelete.set(video.id, video);
      }
    }
  }

  const deleteList = [...toDelete.values()];

  const b2KeysToDelete = new Set();
  const localKeysToDelete = new Set();
  for (const video of deleteList) {
    if (video.rawFileKey && !video.rawFileKey.startsWith("local/")) {
      b2KeysToDelete.add(video.rawFileKey);
    } else if (video.rawFileKey?.startsWith("local/")) {
      localKeysToDelete.add(video.rawFileKey);
    }

    const thumbKey = extractB2KeyFromUrl(video.thumbnailUrl);
    if (thumbKey) {
      b2KeysToDelete.add(thumbKey);
    }

    for (const q of video.qualities || []) {
      if (q.fileKey && !q.fileKey.startsWith("local/")) {
        b2KeysToDelete.add(q.fileKey);
      } else if (q.fileKey?.startsWith("local/")) {
        localKeysToDelete.add(q.fileKey);
      }
    }

    localKeysToDelete.add(`local/transcoded/${video.id}.mp4`);
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      localKeysToDelete.add(`local/${video.userId}/${video.id}/thumb.${ext}`);
    }
  }

  console.log(`User: ${user.username} (${user.id})`);
  console.log(`Channel filter: ${CHANNEL_ID || "(none)"}`);
  console.log(`Source filter: ${SOURCE_DIR || "(none)"}`);
  console.log(`Strip copy suffix mode: ${STRIP_COPY_SUFFIX ? "enabled" : "disabled"}`);
  console.log(`Total videos scanned (user/channel): ${videos.length}`);
  console.log(`Videos considered for dedupe: ${considered.length}`);
  console.log(`Duplicate videos found: ${deleteList.length}`);
  console.log(`B2 objects to delete: ${b2KeysToDelete.size}`);
  console.log(`Local objects to delete: ${localKeysToDelete.size}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  if (!APPLY) {
    const preview = deleteList.slice(0, 10).map((v) => `${v.id} | ${v.title}`);
    if (preview.length > 0) {
      console.log("Sample duplicates:");
      for (const item of preview) {
        console.log(`- ${item}`);
      }
    }
    return;
  }

  let deletedRows = 0;

  for (const video of deleteList) {
    const commentIds = (await prisma.comment.findMany({
      where: { videoId: video.id },
      select: { id: true }
    })).map((c) => c.id);

    if (commentIds.length > 0) {
      await prisma.reply.deleteMany({ where: { commentId: { in: commentIds } } });
    }

    await prisma.videoLike.deleteMany({ where: { videoId: video.id } });
    await prisma.savedVideo.deleteMany({ where: { videoId: video.id } });
    await prisma.watchHistory.deleteMany({ where: { videoId: video.id } });
    await prisma.comment.deleteMany({ where: { videoId: video.id } });
    await prisma.videoQuality.deleteMany({ where: { videoId: video.id } });
    await prisma.video.delete({ where: { id: video.id } });

    deletedRows += 1;
  }

  let b2Deleted = 0;
  for (const key of b2KeysToDelete) {
    try {
      await b2.send(new DeleteObjectCommand({
        Bucket: process.env.B2_BUCKET,
        Key: key
      }));
      b2Deleted += 1;
    } catch {
      // Ignore missing/not-found and continue cleanup.
    }
  }

  let localDeleted = 0;
  for (const key of localKeysToDelete) {
    try {
      const fullPath = toSafeLocalPath(key);
      await fs.rm(fullPath, { force: true });
      localDeleted += 1;
    } catch {
      // Ignore missing/invalid keys and continue cleanup.
    }
  }

  console.log(`Deleted duplicate DB videos: ${deletedRows}`);
  console.log(`Deleted B2 objects: ${b2Deleted}`);
  console.log(`Deleted local objects: ${localDeleted}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
