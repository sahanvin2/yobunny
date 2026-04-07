import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().min(1),
  type: z.enum(["videos", "users", "tags"]).default("videos"),
  sort: z.enum(["relevance", "views", "date"]).default("relevance"),
  page: z.coerce.number().int().min(1).default(1)
});

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", code: "VALIDATION_ERROR" });
    }

    const { q, type, sort, page } = parsed.data;
    const take = 20;
    const skip = (page - 1) * take;

    if (type === "users") {
      const users = await fastify.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } }
          ]
        },
        skip,
        take,
        orderBy: { subscriberCount: sort === "views" ? "desc" : "asc" }
      });

      return { items: users };
    }

    const orderBy = sort === "views" ? { viewCount: "desc" as const } : { publishedAt: "desc" as const };
    const videos = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { tags: { hasSome: [q] } }
        ]
      },
      orderBy,
      skip,
      take,
      include: { user: { select: { username: true, displayName: true } } }
    });

    return { items: videos };
  });
};

export default searchRoutes;
