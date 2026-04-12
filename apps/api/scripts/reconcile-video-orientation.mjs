import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { imageSize } from "image-size";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.RECONCILE_LIMIT || "0");
const FETCH_THUMB_DIMENSIONS = ["1", "true", "yes"].includes(String(process.env.RECONCILE_FETCH_THUMB_DIMENSIONS || "0").toLowerCase());
const STORAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../storage");
const AUTO_CLIP_TAG = "__AUTO_CLIP__";
const PORTRAIT_TAG = "__portrait__";

const B2_PUBLIC_BASE = String(process.env.B2_PUBLIC_BASE || "").replace(/\/$/, "");

const b2Client = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY
  }
});

function extractB2KeyFromUrl(url) {
  if (!url || !B2_PUBLIC_BASE) return null;
  const cleanUrl = String(url).split("?")[0];
  const prefix = `${B2_PUBLIC_BASE}/`;
  if (!cleanUrl.startsWith(prefix)) return null;
  return cleanUrl.slice(prefix.length);
}

function normalizeLocalPath(key) {
  const normalized = String(key || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.resolve(STORAGE_ROOT, normalized);
  const relative = path.relative(STORAGE_ROOT, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid local storage path: ${key}`);
  }
  return absolute;
}

async function doesB2ObjectExist(key) {
  if (!key || String(key).startsWith("local/")) return false;
  const controller = new AbortController();
  let timeoutHandle;

  try {
    const request = b2Client.send(new HeadObjectCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key
    }), { abortSignal: controller.signal });

    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error("B2 head timeout"));
      }, 3000);
    });

    await Promise.race([
      request,
      timeout
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function doesLocalObjectExist(key) {
  if (!key || !String(key).startsWith("local/")) return false;
  try {
    const full = normalizeLocalPath(key);
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

async function fetchImageDimensions(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const size = imageSize(buffer);
    if (!size.width || !size.height) return null;
    return { width: size.width, height: size.height };
  } catch {
    return null;
  }
}

function inferPortraitFromTags(tags) {
  const lower = (tags || []).map((tag) => String(tag).toLowerCase());
  return lower.includes(PORTRAIT_TAG) || lower.includes("portrait") || lower.includes(AUTO_CLIP_TAG.toLowerCase());
}

function reconcileTags(tags, { isPortrait, duration }) {
  const current = new Set((tags || []).map((tag) => String(tag)));

  current.delete(PORTRAIT_TAG);
  current.delete("portrait");
  current.delete(AUTO_CLIP_TAG);

  if (isPortrait) {
    current.add(PORTRAIT_TAG);
    if (Number(duration || 0) > 0 && Number(duration || 0) <= 60) {
      current.add(AUTO_CLIP_TAG);
    }
  }

  return [...current];
}

async function main() {
  const where = {
    status: "READY",
    visibility: "PUBLIC"
  };

  const videos = await prisma.video.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
    select: {
      id: true,
      title: true,
      rawFileKey: true,
      hlsBaseUrl: true,
      thumbnailUrl: true,
      duration: true,
      tags: true
    }
  });

  console.log(`Videos scanned: ${videos.length}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Thumbnail dimension checks: ${FETCH_THUMB_DIMENSIONS ? "enabled" : "disabled"}`);

  let checkedB2 = 0;
  let checkedLocal = 0;
  let missingStorage = 0;
  let portraitCount = 0;
  let landscapeCount = 0;
  let updated = 0;

  const sampleMissing = [];

  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];

    if ((index + 1) % 200 === 0) {
      console.log(`Progress: ${index + 1}/${videos.length}`);
    }

    const rawKey = video.rawFileKey || "";
    let hasStorageAsset = false;

    if (rawKey.startsWith("local/")) {
      checkedLocal += 1;
      hasStorageAsset = await doesLocalObjectExist(rawKey);
    } else if (rawKey) {
      checkedB2 += 1;
      hasStorageAsset = await doesB2ObjectExist(rawKey);
    }

    const thumbKey = extractB2KeyFromUrl(video.thumbnailUrl);
    if (!hasStorageAsset && thumbKey) {
      checkedB2 += 1;
      hasStorageAsset = await doesB2ObjectExist(thumbKey);
    }

    if (!hasStorageAsset || !video.hlsBaseUrl) {
      missingStorage += 1;
      if (sampleMissing.length < 20) {
        sampleMissing.push({
          id: video.id,
          title: video.title,
          hasHls: Boolean(video.hlsBaseUrl),
          rawFileKey: video.rawFileKey
        });
      }
      continue;
    }

    const dimensions = FETCH_THUMB_DIMENSIONS ? await fetchImageDimensions(video.thumbnailUrl) : null;
    const inferredFromTags = inferPortraitFromTags(video.tags);
    const isPortrait = dimensions
      ? dimensions.height > dimensions.width
      : inferredFromTags;

    if (isPortrait) {
      portraitCount += 1;
    } else {
      landscapeCount += 1;
    }

    const nextTags = reconcileTags(video.tags, {
      isPortrait,
      duration: video.duration
    });

    const before = JSON.stringify(video.tags || []);
    const after = JSON.stringify(nextTags);
    if (before !== after) {
      updated += 1;
      if (APPLY) {
        await Promise.race([
          prisma.video.update({
            where: { id: video.id },
            data: { tags: nextTags }
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Prisma update timeout")), 3000);
          })
        ]).catch(() => undefined);
      }
    }
  }

  console.log(`B2 objects checked: ${checkedB2}`);
  console.log(`Local objects checked: ${checkedLocal}`);
  console.log(`Missing/unhealthy storage records: ${missingStorage}`);
  console.log(`Portrait detected: ${portraitCount}`);
  console.log(`Landscape detected: ${landscapeCount}`);
  console.log(`Tag updates ${APPLY ? "applied" : "planned"}: ${updated}`);

  if (sampleMissing.length > 0) {
    console.log("Sample missing/unhealthy videos:");
    for (const item of sampleMissing) {
      console.log(`- ${item.id} | ${item.title} | hls=${item.hasHls ? "ok" : "missing"} | key=${item.rawFileKey || "none"}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
