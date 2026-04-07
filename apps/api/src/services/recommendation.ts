import type { FastifyInstance } from "fastify";

export async function getRecommendedVideoIds(fastify: FastifyInstance, userId: string): Promise<string[]> {
  const cacheKey = `recs:${userId}`;
  const cached = await fastify.redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached) as string[];
  }

  const watched = await fastify.prisma.watchHistory.findMany({
    where: { userId },
    orderBy: { watchedAt: "desc" },
    take: 50,
    include: { video: true }
  });

  const categoryScore = new Map<string, number>();
  const tagScore = new Map<string, number>();
  const watchedSet = new Set<string>();

  for (const row of watched) {
    watchedSet.add(row.videoId);

    if (row.watchPercent > 0.5) {
      categoryScore.set(row.video.category, (categoryScore.get(row.video.category) ?? 0) + 1);
      for (const tag of row.video.tags) {
        tagScore.set(tag, (tagScore.get(tag) ?? 0) + 1);
      }
    }
  }

  const candidates = await fastify.prisma.video.findMany({
    where: {
      status: "READY",
      visibility: "PUBLIC"
    },
    take: 300,
    orderBy: { createdAt: "desc" }
  });

  const scored = candidates
    .map((video: { id: string; category: string; tags: string[]; viewCount: number }) => {
      let score = 0;
      score += (categoryScore.get(video.category) ?? 0) * 0.4;

      let overlap = 0;
      for (const tag of video.tags) {
        overlap += tagScore.get(tag) ?? 0;
      }

      score += overlap * 0.3;
      score += video.viewCount * 0.00015;

      if (watchedSet.has(video.id)) {
        score -= 999;
      }

      return { id: video.id, score };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 40)
    .map((item: { id: string }) => item.id);

  await fastify.redis.set(cacheKey, JSON.stringify(scored), "EX", 3600);
  return scored;
}
