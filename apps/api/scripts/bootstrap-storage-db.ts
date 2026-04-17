import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const REQUIRED_MEDIA_PREFIXES = ["video", "videos", "thumbnails"];

function normalizePrefix(prefix: string) {
  return prefix.trim().replace(/^\/+|\/+$/g, "");
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function ensureB2MediaPrefixes() {
  const endpoint = getRequiredEnv("B2_ENDPOINT");
  const region = getRequiredEnv("B2_REGION");
  const bucket = getRequiredEnv("B2_BUCKET");
  const accessKeyId = getRequiredEnv("B2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("B2_SECRET_ACCESS_KEY");

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey }
  });

  const createdKeys: string[] = [];
  for (const prefix of REQUIRED_MEDIA_PREFIXES.map(normalizePrefix).filter(Boolean)) {
    const key = `${prefix}/.keep`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "",
        ContentType: "text/plain"
      })
    );
    createdKeys.push(key);
  }

  return createdKeys;
}

async function verifyPostgres() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    const [users, videos, posts] = await Promise.all([
      prisma.user.count(),
      prisma.video.count(),
      prisma.post.count()
    ]);
    return { users, videos, posts };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbInfo = await verifyPostgres();
  console.log("PostgreSQL OK", dbInfo);

  const b2Keys = await ensureB2MediaPrefixes();
  console.log("B2 prefixes ensured", b2Keys);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Bootstrap failed:", message);
  process.exit(1);
});
