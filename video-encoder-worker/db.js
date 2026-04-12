import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const prisma = new PrismaClient();

export async function resolveUploaderUserId(configUserId) {
  if (configUserId) {
    const user = await prisma.user.findUnique({ where: { id: configUserId } });
    if (user) return user.id;
  }

  const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!first) {
    throw new Error("No users found in database. Create a user first or set UPLOADER_USER_ID.");
  }
  return first.id;
}

export async function createVideoWithQualities({
  title,
  userId,
  rawFileKey,
  hlsBaseUrl,
  thumbnailUrl,
  duration,
  category,
  visibility,
  qualities
}) {
  return prisma.video.create({
    data: {
      title,
      description: "",
      rawFileKey,
      hlsBaseUrl,
      thumbnailUrl,
      duration,
      status: "READY",
      visibility,
      category,
      tags: [],
      publishedAt: new Date(),
      userId,
      qualities: {
        create: qualities.map((item) => ({
          resolution: item.resolution,
          hlsUrl: item.hlsUrl,
          fileKey: item.fileKey,
          fileSize: BigInt(item.fileSize),
          bitrate: item.bitrate
        }))
      }
    }
  });
}

export async function shutdownDb() {
  await prisma.$disconnect();
}
