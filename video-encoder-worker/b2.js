import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
  const body = fs.createReadStream(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: env.B2_BUCKET,
      Key: remoteKey,
      Body: body,
      ContentType: contentTypeForFile(localPath)
    })
  );
  return `${env.B2_PUBLIC_BASE.replace(/\/$/, "")}/${remoteKey}`;
}

export async function uploadDirectory(client, env, localRoot, remoteRoot) {
  const files = await fs.readdir(localRoot, { recursive: true });
  const uploaded = [];

  for (const entry of files) {
    const localPath = path.join(localRoot, entry.toString());
    const stat = await fs.stat(localPath);
    if (!stat.isFile()) continue;
    const rel = path.relative(localRoot, localPath).replace(/\\/g, "/");
    const key = `${remoteRoot.replace(/\/$/, "")}/${rel}`;
    const publicUrl = await uploadFile(client, env, localPath, key);
    uploaded.push({ localPath, rel, key, publicUrl, size: stat.size });
  }

  return uploaded;
}
