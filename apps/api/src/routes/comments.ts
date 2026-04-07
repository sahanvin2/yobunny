import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";

const commentSchema = z.object({ body: z.string().min(1).max(5000) });

const commentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/videos/:id/comments", async (request) => {
    const id = (request.params as { id: string }).id;
    const comments = await fastify.prisma.comment.findMany({
      where: { videoId: id },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        replies: { include: { user: { select: { username: true, displayName: true, avatarUrl: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });

    return { items: comments };
  });

  fastify.post("/videos/:id/comments", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const comment = await fastify.prisma.comment.create({
      data: {
        body: parsed.data.body,
        userId: dbUser.id,
        videoId: id
      }
    });

    await fastify.prisma.video.update({
      where: { id },
      data: { commentCount: { increment: 1 } }
    });

    return { item: comment };
  });

  fastify.patch("/comments/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const comment = await fastify.prisma.comment.findUnique({ where: { id } });
    if (!comment || comment.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const updated = await fastify.prisma.comment.update({ where: { id }, data: { body: parsed.data.body } });
    return { item: updated };
  });

  fastify.delete("/comments/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const comment = await fastify.prisma.comment.findUnique({ where: { id } });
    if (!comment || comment.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    await fastify.prisma.comment.delete({ where: { id } });
    return { deleted: true };
  });

  fastify.post("/comments/:id/replies", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const replyItem = await fastify.prisma.reply.create({
      data: {
        body: parsed.data.body,
        userId: dbUser.id,
        commentId: id
      }
    });

    return { item: replyItem };
  });

  fastify.get("/comments/:id/replies", async (request) => {
    const id = (request.params as { id: string }).id;
    const replies = await fastify.prisma.reply.findMany({
      where: { commentId: id },
      include: { user: { select: { username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" }
    });

    return { items: replies };
  });
};

export default commentRoutes;
