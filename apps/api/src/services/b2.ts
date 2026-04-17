import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config.js";

const DEFAULT_MEDIA_PREFIXES = ["video", "videos", "thumbnails", "hls", "mp4"];

function normalizePrefix(prefix: string) {
  return prefix.trim().replace(/^\/+|\/+$/g, "");
}

const b2Client = new S3Client({
  region: env.B2_REGION,
  endpoint: env.B2_ENDPOINT,
  credentials: {
    accessKeyId: env.B2_ACCESS_KEY_ID,
    secretAccessKey: env.B2_SECRET_ACCESS_KEY
  }
});

export async function createRawUploadUrl(fileKey: string, expiresInSec = 3600) {
  const command = new PutObjectCommand({
    Bucket: env.B2_BUCKET,
    Key: fileKey,
    ContentType: "video/mp4"
  });

  const uploadUrl = await getSignedUrl(b2Client, command, { expiresIn: expiresInSec });
  return { uploadUrl, fileKey };
}

export async function uploadObjectToB2(fileKey: string, body: Buffer, contentType: string, timeoutMs = 25000) {
  const command = new PutObjectCommand({
    Bucket: env.B2_BUCKET,
    Key: fileKey,
    Body: body,
    ContentType: contentType
  });

  // Create an abort controller with timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await b2Client.send(command, { abortSignal: controller.signal });
    clearTimeout(timeoutHandle);
    return {
      key: fileKey,
      publicUrl: `${env.B2_PUBLIC_BASE.replace(/\/$/, "")}/${fileKey}`
    };
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
}

export async function createDownloadUrl(fileKey: string, expiresInSec = 1800) {
  const command = new GetObjectCommand({
    Bucket: env.B2_BUCKET,
    Key: fileKey
  });

  return getSignedUrl(b2Client, command, { expiresIn: expiresInSec });
}

export async function ensureB2MediaPrefixes(prefixes: string[] = DEFAULT_MEDIA_PREFIXES) {
  const normalized = Array.from(new Set(prefixes.map(normalizePrefix).filter(Boolean)));

  if (normalized.length === 0) {
    return [] as string[];
  }

  const createdKeys: string[] = [];

  for (const prefix of normalized) {
    const key = `${prefix}/.keep`;
    const command = new PutObjectCommand({
      Bucket: env.B2_BUCKET,
      Key: key,
      Body: "",
      ContentType: "text/plain"
    });

    await b2Client.send(command);
    createdKeys.push(key);
  }

  return createdKeys;
}
