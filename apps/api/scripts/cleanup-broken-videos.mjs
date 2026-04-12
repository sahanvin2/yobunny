import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function removeVideoWithRelations(videoId) {
  const commentIds = (await prisma.comment.findMany({
    where: { videoId },
    select: { id: true }
  })).map((c) => c.id);

  if (commentIds.length > 0) {
    await prisma.reply.deleteMany({ where: { commentId: { in: commentIds } } });
  }

  await prisma.videoLike.deleteMany({ where: { videoId } });
  await prisma.savedVideo.deleteMany({ where: { videoId } });
  await prisma.watchHistory.deleteMany({ where: { videoId } });
  await prisma.comment.deleteMany({ where: { videoId } });
  await prisma.videoQuality.deleteMany({ where: { videoId } });
  await prisma.video.delete({ where: { id: videoId } });
}

async function main() {
  const broken = await prisma.video.findMany({
    where: {
      status: "READY",
      OR: [
        { duration: null },
        { duration: { lte: 0 } },
        { hlsBaseUrl: null }
      ]
    },
    select: {
      id: true,
      title: true,
      duration: true,
      hlsBaseUrl: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  console.log(`Broken READY videos found: ${broken.length}`);
  for (const item of broken.slice(0, 30)) {
    console.log(`- ${item.id} | ${item.title} | duration=${item.duration ?? "null"} | hls=${item.hlsBaseUrl ? "ok" : "null"} | ${item.user?.displayName || item.user?.username || "unknown"}`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to delete these videos.");
    return;
  }

  let deleted = 0;
  for (const item of broken) {
    await removeVideoWithRelations(item.id);
    deleted += 1;
  }

  console.log(`Deleted videos: ${deleted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
