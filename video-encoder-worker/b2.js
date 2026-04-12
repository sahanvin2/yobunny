import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs-extra";
import path from "node:path";

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".m3u8") return "application/vnd.apple.mpegurl";
  if (ext === ".ts") return "video/mp2t";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

export function createB2Client(env) {
  return new S3Client({
    region: env.B2_REGION,
    endpoint: env.B2_ENDPOINT,
    credentials: {
      accessKeyId: env.B2_ACCESS_KEY_ID,
      secretAccessKey: env.B2_SECRET_ACCESS_KEY
    }
  });
}

export async function uploadFile(client, env, localPath, remoteKey) {
  const stat = await fs.stat(localPath);
  const contentType = contentTypeForFile(localPath);

  if (stat.size >= 64 * 1024 * 1024) {
    await new Upload({
      client,
      params: {
        Bucket: env.B2_BUCKET,
        Key: remoteKey,
        Body: fs.createReadStream(localPath),
        ContentType: contentType
      },
      queueSize: 4,
      partSize: 64 * 1024 * 1024,
      leavePartsOnError: false
    }).done();
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: env.B2_BUCKET,
        Key: remoteKey,
        Body: fs.createReadStream(localPath),
        ContentType: contentType
      })
    );
  }
  return `${env.B2_PUBLIC_BASE.replace(/\/$/, "")}/${remoteKey}`;
}

export async function uploadDirectory(client, env, localRoot, remoteRoot) {
  const files = await fs.readdir(localRoot, { recursive: true });
  const uploaded = [];
  const fileEntries = [];

  for (const entry of files) {
    const localPath = path.join(localRoot, entry.toString());
    const stat = await fs.stat(localPath);
    if (!stat.isFile()) continue;
    const rel = path.relative(localRoot, localPath).replace(/\\/g, "/");
    const key = `${remoteRoot.replace(/\/$/, "")}/${rel}`;
    fileEntries.push({ localPath, rel, key, size: stat.size });
  }

  const concurrency = 8;
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, fileEntries.length) }, async () => {
      while (cursor < fileEntries.length) {
        const index = cursor;
        cursor += 1;
        const item = fileEntries[index];
        const publicUrl = await uploadFile(client, env, item.localPath, item.key);
        uploaded.push({ ...item, publicUrl });
      }
    })
  );

  return uploaded;
}
