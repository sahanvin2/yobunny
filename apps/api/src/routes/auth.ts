import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(2).max(80)
});

const checkUsernameSchema = z.object({
  username: z.string().min(3).max(30)
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/register", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", code: "VALIDATION_ERROR" });
    }

    const auth = request.authUser!;
    const { username, displayName } = parsed.data;

    const exists = await fastify.prisma.user.findUnique({ where: { username } });
    if (exists && exists.firebaseUid !== auth.uid) {
      return reply.code(409).send({ error: "Username already taken", code: "USERNAME_TAKEN" });
    }

    const user = await fastify.prisma.user.upsert({
      where: { firebaseUid: auth.uid },
      update: {
        username,
        displayName,
        avatarUrl: auth.picture ?? undefined,
        email: auth.email ?? ""
      },
      create: {
        firebaseUid: auth.uid,
        username,
        displayName,
        email: auth.email ?? `${auth.uid}@local.dev`,
        avatarUrl: auth.picture
      }
    });

    return { user };
  });

  fastify.post("/check-username", async (request, reply) => {
    const parsed = checkUsernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", code: "VALIDATION_ERROR" });
    }

    const user = await fastify.prisma.user.findUnique({ where: { username: parsed.data.username } });
    return { available: !user };
  });

  fastify.get("/me", { preHandler: requireAuth }, async (request) => {
    const auth = request.authUser!;
    const user = await fastify.prisma.user.findUnique({ where: { firebaseUid: auth.uid } });
    return { user };
  });
};

export default authRoutes;
