import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "../types.js";
import { env } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (env.DEV_AUTH_BYPASS) {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const uid = token.length > 0 ? token : env.DEV_AUTH_UID;
    const username = `dev_${uid.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)}`;

    request.authUser = {
      uid,
      email: env.DEV_AUTH_EMAIL,
      name: "Local Dev User",
      picture: undefined
    };

    await request.server.prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email: env.DEV_AUTH_EMAIL,
        displayName: "Local Dev User"
      },
      create: {
        firebaseUid: uid,
        username,
        displayName: "Local Dev User",
        email: env.DEV_AUTH_EMAIL
      }
    });

    return;
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing bearer token", code: "UNAUTHORIZED" });
  }

  const token = authHeader.slice("Bearer ".length);

  if (!request.server.firebaseAdmin) {
    return reply.code(500).send({ error: "Auth provider is not configured", code: "AUTH_PROVIDER_NOT_CONFIGURED" });
  }

  try {
    const decoded = await request.server.firebaseAdmin.auth().verifyIdToken(token);
    request.authUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture
    };
  } catch {
    return reply.code(401).send({ error: "Invalid auth token", code: "UNAUTHORIZED" });
  }
}
