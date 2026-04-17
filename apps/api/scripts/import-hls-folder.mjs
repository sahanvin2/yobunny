import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const SOURCE_ROOT = process.argv[2] || "E:\\HLS";
const LIMIT = Number.parseInt(process.argv[3] || "0", 10) || 0;
const MODEL_NAME = process.env.MODEL_NAME || "Cherry Moon";
const FIREBASE_UID = process.env.AUTH_UID || "dev-user-1";
const DRY_RUN = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.IMPORT_CONCURRENCY || "6", 10) || 6);

function normalizeModelSlug(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toModelTag(name) {
  const slug = normalizeModelSlug(name);
  return `__MODEL__:${slug}`;
}

function normalizeUserKey(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromDirName(dir) {
  const base = path.basename(dir);
  const cleaned = base.replace(/[_-]+/g, " ").trim();
  return cleaned || "Untitled HLS";
}

function contentTypeForFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".m3u8") return "application/vnd.apple.mpegurl";
  if (ext === ".ts") return "video/mp2t";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".vtt") return "text/vtt";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function pickManifest(files) {
  const m3u8 = files.filter((f) => path.extname(f).toLowerCase() === ".m3u8");
  if (m3u8.length === 0) return "";

  const byPriority = [
    m3u8.find((f) => /master\.m3u8$/i.test(f)),
    m3u8.find((f) => /index\.m3u8$/i.test(f)),
    m3u8.find((f) => /playlist/i.test(path.basename(f))),
    m3u8[0]
  ].filter(Boolean);

  return byPriority[0] || "";
}

async function listFilesRecursive(dir) {
  const out = [];
  const items = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (item.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function findHlsAssetRoots(root) {
  const roots = [];

  function isQualityDirName(name) {
    return /^(\d{3,4}p|\d+k|sd|hd|fhd|uhd)$/i.test(String(name || "").trim());
  }

  async function hasHlsFiles(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const hasM3u8 = entries.some((it) => it.isFile() && path.extname(it.name).toLowerCase() === ".m3u8");
    const hasTs = entries.some((it) => it.isFile() && path.extname(it.name).toLowerCase() === ".ts");
    return hasM3u8 && hasTs;
  }

  async function walk(dir) {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    const m3u8Here = items.some((it) => it.isFile() && path.extname(it.name).toLowerCase() === ".m3u8");
    const tsHere = items.some((it) => it.isFile() && path.extname(it.name).toLowerCase() === ".ts");

    const childDirs = items.filter((it) => it.isDirectory()).map((it) => path.join(dir, it.name));
    const qualityChildren = childDirs.filter((child) => isQualityDirName(path.basename(child)));

    if (qualityChildren.length >= 2) {
      let qualityHlsCount = 0;
      for (const child of qualityChildren) {
        if (await hasHlsFiles(child)) {
          qualityHlsCount += 1;
        }
      }

      // Parent folder is the logical asset root when it contains multiple HLS quality variants.
      if (qualityHlsCount >= 2) {
        roots.push(dir);
        return;
      }
    }

    if (m3u8Here && tsHere) {
      // Skip leaf quality folders when we can infer they are variant-only directories.
      if (!isQualityDirName(path.basename(dir))) {
        roots.push(dir);
      }
      return;
    }

    for (const item of items) {
      if (!item.isDirectory()) continue;
      await walk(path.join(dir, item.name));
    }
  }

  await walk(root);
  return roots;
}

function getS3Client() {
  if (!process.env.B2_BUCKET || !process.env.B2_ENDPOINT || !process.env.B2_REGION || !process.env.B2_ACCESS_KEY_ID || !process.env.B2_SECRET_ACCESS_KEY) {
    throw new Error("Missing B2 environment variables for HLS import");
  }

  return new S3Client({
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY
    }
  });
}

async function uploadFile(s3, bucket, key, filePath) {
  const body = await fs.promises.readFile(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentTypeForFile(filePath)
  });
  await s3.send(command);
}

async function uploadWithConcurrency(items, limit, worker) {
  if (items.length === 0) return;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

function resolveModelNameForRoot(sourceRoot, rootDir) {
  const relative = path.relative(sourceRoot, rootDir);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length >= 2) {
    return parts[0];
  }
  return MODEL_NAME;
}

async function main() {
  if (!fs.existsSync(SOURCE_ROOT)) {
    throw new Error(`Source folder not found: ${SOURCE_ROOT}`);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ firebaseUid: FIREBASE_UID }, { username: "dev_dev_user_1" }]
    }
  });

  if (!user) {
    throw new Error("Could not resolve uploader user for HLS import");
  }

  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      firebaseUid: true
    }
  });

  const userByKey = new Map();
  for (const entry of allUsers) {
    const usernameKey = normalizeUserKey(entry.username);
    const displayKey = normalizeUserKey(entry.displayName);
    if (usernameKey) userByKey.set(usernameKey, entry);
    if (displayKey) userByKey.set(displayKey, entry);
  }

  const roots = await findHlsAssetRoots(SOURCE_ROOT);
  const selectedRoots = LIMIT > 0 ? roots.slice(0, LIMIT) : roots;

  console.log(`Found ${roots.length} HLS roots. Processing ${selectedRoots.length}.`);
  console.log(`Default model tag: ${toModelTag(MODEL_NAME)}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);

  const s3 = DRY_RUN ? null : getS3Client();
  const bucket = process.env.B2_BUCKET;
  const publicBase = String(process.env.B2_PUBLIC_BASE || "").replace(/\/$/, "");

  let imported = 0;
  let skipped = 0;

  for (const rootDir of selectedRoots) {
    const modelName = resolveModelNameForRoot(SOURCE_ROOT, rootDir);
    const modelSlug = normalizeModelSlug(modelName);
    const modelTag = toModelTag(modelName);
    const modelUser = userByKey.get(normalizeUserKey(modelName)) || user;
    const channelTag = `__CHANNEL__:primary-${modelUser.id}`;

    const allFiles = await listFilesRecursive(rootDir);
    const manifest = pickManifest(allFiles);
    if (!manifest) {
      skipped += 1;
      console.log(`Skipped (no manifest): ${rootDir}`);
      continue;
    }

    const title = titleFromDirName(rootDir);
    const relManifest = path.relative(rootDir, manifest).replace(/\\/g, "/");

    const existing = await prisma.video.findFirst({
      where: {
        title,
        tags: { has: modelTag },
        status: "READY"
      }
    });

    if (existing) {
      skipped += 1;
      console.log(`Skipped (exists): ${title}`);
      continue;
    }

    if (DRY_RUN) {
      imported += 1;
      console.log(`Dry-run import: ${title} [${modelSlug}] -> ${modelUser.username}`);
      continue;
    }

    const video = await prisma.video.create({
      data: {
        title,
        description: `${title} imported from server-side HLS library`,
        rawFileKey: "pending",
        hlsBaseUrl: "pending",
        status: "UPLOADING",
        visibility: "PUBLIC",
        category: "ENTERTAINMENT",
        tags: [modelTag, channelTag],
        userId: modelUser.id
      }
    });

    const filesToUpload = allFiles.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".m3u8", ".ts", ".aac", ".vtt", ".jpg", ".jpeg", ".png", ".webp"].includes(ext);
    });

    await uploadWithConcurrency(filesToUpload, IMPORT_CONCURRENCY, async (filePath) => {
      const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
      const key = `hls/${video.id}/${rel}`;
      await uploadFile(s3, bucket, key, filePath);
    });

    const manifestKey = `hls/${video.id}/${relManifest}`;
    const manifestUrl = `${publicBase}/${manifestKey}`;

    await prisma.video.update({
      where: { id: video.id },
      data: {
        rawFileKey: manifestKey,
        hlsBaseUrl: manifestUrl,
        status: "READY",
        publishedAt: new Date()
      }
    });

    imported += 1;
    console.log(`Imported HLS: ${title} [${modelSlug}] -> ${manifestUrl}`);
  }

  console.log(`Done. Imported=${imported}, Skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
