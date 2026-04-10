import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import firebasePlugin from "./plugins/firebase.js";
import requestContextPlugin from "./plugins/requestContext.js";
import authRoutes from "./routes/auth.js";
import videosRoutes from "./routes/videos.js";
import commentRoutes from "./routes/comments.js";
import userRoutes from "./routes/users.js";
import searchRoutes from "./routes/search.js";
import streamsRoutes from "./routes/streams.js";
import { env } from "./config.js";

function buildAllowedOrigins() {
  return env.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]) {
  // Non-browser requests often omit origin (curl, server-to-server).
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function buildServer() {
  const app = Fastify({ logger: true });
  const allowedOrigins = buildAllowedOrigins();
  const rateLimitMax = env.NODE_ENV === "production" ? 100 : 2000;

  await app.register(cors, {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"), false);
    },
    credentials: true
  });

  await app.register(helmet, {
    // Frontend runs on a different origin in development (localhost:8080)
    // and needs to render media files served by the API (localhost:4000).
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: "1 minute"
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024
    }
  });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(firebasePlugin);
  await app.register(requestContextPlugin);

  app.get("/health", async () => ({ ok: true }));

  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: "/auth" });
    await api.register(videosRoutes, { prefix: "/videos" });
    await api.register(commentRoutes);
    await api.register(userRoutes, { prefix: "/users" });
    await api.register(searchRoutes, { prefix: "/search" });
    await api.register(streamsRoutes, { prefix: "/streams" });
  }, { prefix: "/api" });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "Unhandled API error");

    if (!reply.sent) {
      reply.code(500).send({
        error: "Internal server error",
        code: "INTERNAL_ERROR"
      });
    }
  });

  return app;
}

const app = await buildServer();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
