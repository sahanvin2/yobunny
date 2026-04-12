import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().min(1),
  type: z.enum(["videos", "users", "tags"]).default("videos"),
  sort: z.enum(["relevance", "views", "date"]).default("relevance"),
  page: z.coerce.number().int().min(1).default(1)
});

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  return normalize(input).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function fuzzyScore(query: string, candidate: string) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;

  let score = 0;
  if (c === q) score += 300;
  if (c.startsWith(q)) score += 180;
  if (c.includes(q)) score += 120;

  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);

  let tokenHits = 0;
  for (const token of qTokens) {
    if (cTokens.some((item) => item.includes(token))) tokenHits += 1;
  }
  score += tokenHits * 28;

  const qWord = qTokens.join(" ");
  const compactCandidate = cTokens.join(" ");
  const maxLen = Math.max(qWord.length, compactCandidate.length);
  if (maxLen > 0) {
    const distance = levenshtein(qWord, compactCandidate.slice(0, Math.max(qWord.length + 8, qWord.length)));
    const similarity = 1 - distance / maxLen;
    if (similarity > 0.55) {
      score += Math.round(similarity * 110);
    }
  }

  return score;
}

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", code: "VALIDATION_ERROR" });
    }

    const { q, type, sort, page } = parsed.data;
    const take = 20;
    const skip = (page - 1) * take;
    const queryTokens = tokenize(q);

    if (type === "users") {
      const candidates = await fastify.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            ...queryTokens.map((token) => ({ username: { contains: token, mode: "insensitive" as const } })),
            ...queryTokens.map((token) => ({ displayName: { contains: token, mode: "insensitive" as const } }))
          ]
        },
        take: 300,
        orderBy: [{ subscriberCount: "desc" }, { createdAt: "desc" }]
      });

      const ranked = candidates
        .map((user) => {
          const nameScore = fuzzyScore(q, user.displayName || "") * 1.1;
          const userScore = fuzzyScore(q, user.username || "") * 1.35;
          const popularityBoost = Math.log10((user.subscriberCount || 0) + 1) * (sort === "views" ? 20 : 8);
          return {
            user,
            score: nameScore + userScore + popularityBoost
          };
        })
        .filter((item) => item.score > 20)
        .sort((a, b) => b.score - a.score || b.user.subscriberCount - a.user.subscriberCount)
        .slice(skip, skip + take)
        .map((item) => item.user);

      return { items: ranked };
    }

    const baseCandidates = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { tags: { hasSome: [q] } },
          ...queryTokens.map((token) => ({ title: { contains: token, mode: "insensitive" as const } })),
          ...queryTokens.map((token) => ({ description: { contains: token, mode: "insensitive" as const } })),
          ...queryTokens.map((token) => ({ tags: { hasSome: [token] as string[] } }))
        ]
      },
      orderBy: [{ publishedAt: "desc" }, { viewCount: "desc" }],
      take: 350,
      include: { user: { select: { username: true, displayName: true } } }
    });

    let candidates = baseCandidates;
    if (candidates.length < 60) {
      const fallback = await fastify.prisma.video.findMany({
        where: {
          status: "READY",
          visibility: "PUBLIC"
        },
        orderBy: [{ publishedAt: "desc" }, { viewCount: "desc" }],
        take: 350,
        include: { user: { select: { username: true, displayName: true } } }
      });

      const seen = new Set(candidates.map((item) => item.id));
      for (const item of fallback) {
        if (seen.has(item.id)) continue;
        candidates.push(item);
        seen.add(item.id);
      }
    }

    const ranked = candidates
      .map((video) => {
        const titleScore = fuzzyScore(q, video.title || "") * 1.6;
        const descriptionScore = fuzzyScore(q, video.description || "") * 0.65;
        const tagScore = Math.max(0, ...video.tags.map((tag) => fuzzyScore(q, tag))) * 1.25;
        const channelScore = fuzzyScore(q, video.user?.displayName || "") * 0.45;
        const popularityBoost = Math.log10((video.viewCount || 0) + 1) * (sort === "views" ? 18 : 7);
        const recencyBoost = sort === "date"
          ? Math.max(0, 25 - Math.floor((Date.now() - new Date(video.publishedAt || video.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        return {
          video,
          score: titleScore + descriptionScore + tagScore + channelScore + popularityBoost + recencyBoost
        };
      })
      .filter((item) => item.score > 18)
      .sort((a, b) => {
        if (sort === "views") {
          return b.video.viewCount - a.video.viewCount || b.score - a.score;
        }

        if (sort === "date") {
          return new Date(b.video.publishedAt || b.video.createdAt).getTime() - new Date(a.video.publishedAt || a.video.createdAt).getTime() || b.score - a.score;
        }

        return b.score - a.score || b.video.viewCount - a.video.viewCount;
      })
      .slice(skip, skip + take)
      .map((item) => item.video);

    return { items: ranked };
  });
};

export default searchRoutes;
