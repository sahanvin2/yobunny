import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";

const createStreamSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional()
});

const updateStreamStatusSchema = z.object({
  status: z.enum(["LIVE", "OFFLINE", "ENDED"])
});

const streamsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    const items = await fastify.prisma.livestream.findMany({
      where: { status: "LIVE" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            subscriberCount: true
          }
        }
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: 100
    });

    return { items };
  });

  fastify.get("/all", async () => {
    const items = await fastify.prisma.livestream.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            subscriberCount: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 200
    });

    return { items };
  });

  fastify.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.livestream.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return { items };
  });

  fastify.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createStreamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const stream = await fastify.prisma.livestream.create({
      data: {
        userId: dbUser.id,
        title: parsed.data.title,
        description: parsed.data.description,
        roomId: `room-${randomUUID()}`,
        status: "OFFLINE"
      }
    });

    return { item: stream };
  });

  fastify.patch("/:id/status", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateStreamStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const existing = await fastify.prisma.livestream.findUnique({ where: { id } });
    if (!existing || existing.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const now = new Date();
    const item = await fastify.prisma.livestream.update({
      where: { id },
      data: {
        status: parsed.data.status,
        startedAt: parsed.data.status === "LIVE" ? now : existing.startedAt,
        endedAt: parsed.data.status === "ENDED" ? now : existing.endedAt
      }
    });

    return { item };
  });
};

export default streamsRoutes;
