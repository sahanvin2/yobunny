import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const env = {
  B2_ENDPOINT: process.env.B2_ENDPOINT,
  B2_ACCESS_KEY_ID: process.env.B2_ACCESS_KEY_ID,
  B2_SECRET_ACCESS_KEY: process.env.B2_SECRET_ACCESS_KEY,
  B2_BUCKET: process.env.B2_BUCKET,
  B2_REGION: process.env.B2_REGION,
  B2_PUBLIC_BASE: process.env.B2_PUBLIC_BASE
};

const hasB2 = Boolean(
  env.B2_ENDPOINT &&
  env.B2_ACCESS_KEY_ID &&
  env.B2_SECRET_ACCESS_KEY &&
  env.B2_BUCKET &&
  env.B2_REGION
);

const b2 = hasB2
  ? new S3Client({
      region: env.B2_REGION,
      endpoint: env.B2_ENDPOINT,
      credentials: {
        accessKeyId: env.B2_ACCESS_KEY_ID,
        secretAccessKey: env.B2_SECRET_ACCESS_KEY
      }
    })
  : null;

async function listKeysByPrefix(prefix) {
  if (!b2) return [];
  let token;
  const out = [];

  do {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await b2
      .send(
        new ListObjectsV2Command({
          Bucket: env.B2_BUCKET,
          Prefix: prefix,
          ContinuationToken: token
        }),
        { abortSignal: controller.signal }
      )
      .finally(() => clearTimeout(timer));

    for (const item of res.Contents || []) {
      if (item.Key) out.push(item.Key);
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

async function deleteKeys(keys) {
  if (!b2 || keys.length === 0) return;
  const chunkSize = 1000;

  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    await b2
      .send(
        new DeleteObjectsCommand({
          Bucket: env.B2_BUCKET,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true
          }
        }),
        { abortSignal: controller.signal }
      )
      .finally(() => clearTimeout(timer));
  }
}

async function cleanLocalStorage() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../storage/local");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function main() {
  const videos = await prisma.video.findMany({
    select: {
      id: true,
      userId: true,
      rawFileKey: true,
      qualities: {
        select: {
          fileKey: true
        }
      }
    }
  });

  const videoIds = videos.map((v) => v.id);

  await prisma.$transaction([
    prisma.reply.deleteMany({ where: { comment: { videoId: { in: videoIds } } } }),
    prisma.comment.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.videoLike.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.savedVideo.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.watchHistory.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.videoQuality.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.video.deleteMany({ where: { id: { in: videoIds } } })
  ]);

  const localRoot = await cleanLocalStorage();
  let deletedB2Keys = 0;

  if (b2) {
    try {
      const prefixes = ["raw/", "hls/", "thumbnails/", "videos/"];
      const allKeys = [];
      for (const prefix of prefixes) {
        const keys = await listKeysByPrefix(prefix);
        allKeys.push(...keys);
      }

      const uniqueKeys = Array.from(new Set(allKeys));
      await deleteKeys(uniqueKeys);
      deletedB2Keys = uniqueKeys.length;
    } catch (error) {
      console.warn("[purge] warning: B2 cleanup skipped due to timeout/error", String(error));
    }
  }

  console.log(`[purge] deleted videos: ${videoIds.length}`);
  console.log(`[purge] deleted b2 keys: ${deletedB2Keys}`);
  console.log(`[purge] cleaned local storage: ${localRoot}`);
}

main()
  .catch((error) => {
    console.error("[purge] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
