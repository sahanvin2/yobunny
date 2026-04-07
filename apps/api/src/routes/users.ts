import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { hasLocalObject, resolveLocalObjectPath, writeLocalObject } from "../services/localStorage.js";

const profileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  bio: z.string().max(250).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  profileImageUrl: z.string().url().optional()
});

const PROFILE_MEDIA_EXTENSIONS = ["avif", "webp", "png", "jpg", "jpeg", "gif"] as const;
const IMAGE_EXTENSION_BY_MIMETYPE: Record<string, string> = {
  "image/avif": "avif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif"
};

function getRequestOrigin(request: Pick<FastifyRequest, "protocol" | "headers">) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string"
    ? forwardedHost.split(",")[0].trim()
    : typeof request.headers.host === "string"
      ? request.headers.host
      : "localhost:4000";
  const protocol = typeof forwardedProto === "string"
    ? forwardedProto.split(",")[0].trim()
    : request.protocol || "http";

  return `${protocol}://${host}`;
}

function profileMediaKey(userId: string, kind: "avatar" | "banner", ext: string) {
  return `profiles/${userId}/${kind}.${ext}`;
}

function profileMediaPublicUrl(request: Pick<FastifyRequest, "protocol" | "headers">, userId: string, kind: "avatar" | "banner") {
  return `${getRequestOrigin(request)}/api/users/media/${userId}/${kind}`;
}

function imageExtensionForUpload(filename: string, mimetype: string) {
  const normalizedMimeType = mimetype.toLowerCase();
  const byMimeType = IMAGE_EXTENSION_BY_MIMETYPE[normalizedMimeType];
  if (byMimeType) {
    return byMimeType;
  }

  const fallbackExt = filename.split(".").pop()?.toLowerCase() || "png";
  return PROFILE_MEDIA_EXTENSIONS.includes(fallbackExt as (typeof PROFILE_MEDIA_EXTENSIONS)[number]) ? fallbackExt : "png";
}

async function clearExistingProfileMedia(userId: string, kind: "avatar" | "banner") {
  for (const ext of PROFILE_MEDIA_EXTENSIONS) {
    const key = profileMediaKey(userId, kind, ext);
    if (await hasLocalObject(key)) {
      await fs.unlink(resolveLocalObjectPath(key)).catch(() => undefined);
    }
  }
}

async function readMultipartImage(request: FastifyRequest) {
  let upload: { filename: string; mimetype: string; buffer: Buffer } | null = null;

  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      if (part.fieldname !== "file") {
        await part.toBuffer();
        continue;
      }

      const buffer = await part.toBuffer();
      upload = {
        filename: part.filename,
        mimetype: part.mimetype,
        buffer
      };
      continue;
    }

    void part.value;
  }

  return upload;
}

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/media/:userId/:kind", async (request, reply) => {
    const { userId, kind } = request.params as { userId: string; kind: string };

    if (kind !== "avatar" && kind !== "banner") {
      return reply.code(400).send({ error: "Invalid media kind", code: "VALIDATION_ERROR" });
    }

    for (const ext of PROFILE_MEDIA_EXTENSIONS) {
      const key = profileMediaKey(userId, kind, ext);
      if (await hasLocalObject(key)) {
        const contentType = ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "png"
            ? "image/png"
            : ext === "gif"
              ? "image/gif"
              : ext === "avif"
                ? "image/avif"
                : "image/webp";

        reply.header("Content-Type", contentType);
        reply.header("Cache-Control", "public, max-age=60");
        return reply.send(createReadStream(resolveLocalObjectPath(key)));
      }
    }

    return reply.code(404).send({ error: "Media not found", code: "NOT_FOUND" });
  });

  fastify.get("/:username", async (request, reply) => {
    const username = (request.params as { username: string }).username;
    const user = await fastify.prisma.user.findUnique({ where: { username } });

    if (!user) {
      return reply.code(404).send({ error: "User not found", code: "NOT_FOUND" });
    }

    return { item: user };
  });

  fastify.get("/:username/videos", async (request) => {
    const username = (request.params as { username: string }).username;
    const user = await fastify.prisma.user.findUnique({ where: { username } });
    if (!user) {
      return { items: [] };
    }

    const items = await fastify.prisma.video.findMany({
      where: { userId: user.id, status: "READY", visibility: "PUBLIC" },
      orderBy: { publishedAt: "desc" }
    });

    return { items };
  });

  fastify.post("/:id/subscribe", { preHandler: requireAuth }, async (request, reply) => {
    const channelId = (request.params as { id: string }).id;
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });

    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    if (dbUser.id === channelId) {
      return reply.code(400).send({ error: "Cannot subscribe to yourself", code: "BAD_REQUEST" });
    }

    const existing = await fastify.prisma.subscription.findUnique({
      where: { subscriberId_channelId: { subscriberId: dbUser.id, channelId } }
    });

    if (existing) {
      await fastify.prisma.subscription.delete({
        where: { subscriberId_channelId: { subscriberId: dbUser.id, channelId } }
      });

      await fastify.prisma.user.update({ where: { id: channelId }, data: { subscriberCount: { decrement: 1 } } });
      return { subscribed: false };
    }

    await fastify.prisma.subscription.create({
      data: { subscriberId: dbUser.id, channelId }
    });

    await fastify.prisma.user.update({ where: { id: channelId }, data: { subscriberCount: { increment: 1 } } });
    return { subscribed: true };
  });

  fastify.patch("/me", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    if (parsed.data.username && parsed.data.username !== dbUser.username) {
      const existing = await fastify.prisma.user.findUnique({ where: { username: parsed.data.username } });
      if (existing && existing.id !== dbUser.id) {
        return reply.code(409).send({ error: "Username already taken", code: "USERNAME_TAKEN" });
      }
    }

    const user = await fastify.prisma.user.update({
      where: { id: dbUser.id },
      data: parsed.data
    });

    return { item: user };
  });

  fastify.post("/me/avatar", { preHandler: requireAuth }, async (request, reply) => {
    request.socket.setTimeout(120000);

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const upload = await readMultipartImage(request);
    if (!upload) {
      return reply.code(400).send({ error: "Missing image file", code: "VALIDATION_ERROR" });
    }

    if (!upload.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "Invalid image format", code: "VALIDATION_ERROR" });
    }

    const ext = imageExtensionForUpload(upload.filename, upload.mimetype);
    const fileKey = profileMediaKey(dbUser.id, "avatar", ext);
    const version = Date.now();

    await clearExistingProfileMedia(dbUser.id, "avatar");
    await writeLocalObject(fileKey, upload.buffer);

    const updated = await fastify.prisma.user.update({
      where: { id: dbUser.id },
      data: { avatarUrl: `${profileMediaPublicUrl(request, dbUser.id, "avatar")}?v=${version}` }
    });

    return { item: updated };
  });

  fastify.post("/me/banner", { preHandler: requireAuth }, async (request, reply) => {
    request.socket.setTimeout(120000);

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const upload = await readMultipartImage(request);
    if (!upload) {
      return reply.code(400).send({ error: "Missing image file", code: "VALIDATION_ERROR" });
    }

    if (!upload.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "Invalid image format", code: "VALIDATION_ERROR" });
    }

    const ext = imageExtensionForUpload(upload.filename, upload.mimetype);
    const fileKey = profileMediaKey(dbUser.id, "banner", ext);
    const version = Date.now();

    await clearExistingProfileMedia(dbUser.id, "banner");
    await writeLocalObject(fileKey, upload.buffer);

    const updated = await fastify.prisma.user.update({
      where: { id: dbUser.id },
      data: { bannerUrl: `${profileMediaPublicUrl(request, dbUser.id, "banner")}?v=${version}` }
    });

    return { item: updated };
  });

  fastify.get("/me/history", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.watchHistory.findMany({
      where: { userId: dbUser.id },
      include: { video: { include: { user: { select: { username: true, displayName: true, avatarUrl: true, subscriberCount: true, isVerified: true } } } } },
      orderBy: { watchedAt: "desc" },
      take: 200
    });

    return { items };
  });

  fastify.get("/me/saved", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.savedVideo.findMany({
      where: { userId: dbUser.id },
      include: { video: { include: { user: { select: { username: true, displayName: true, avatarUrl: true, subscriberCount: true, isVerified: true } } } } },
      orderBy: { savedAt: "desc" }
    });

    return { items };
  });

  fastify.get("/me/liked", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.videoLike.findMany({
      where: { userId: dbUser.id },
      include: {
        video: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatarUrl: true,
                subscriberCount: true,
                isVerified: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return { items };
  });

  fastify.get("/me/dashboard", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const [videoCount, videos] = await Promise.all([
      fastify.prisma.video.count({ where: { userId: dbUser.id, status: "READY" } }),
      fastify.prisma.video.findMany({ where: { userId: dbUser.id, status: "READY" }, select: { viewCount: true } })
    ]);

    const totalViews = videos.reduce((acc: number, item: { viewCount: number }) => acc + item.viewCount, 0);

    return {
      item: {
        totalViews,
        subscribers: dbUser.subscriberCount,
        videoCount
      }
    };
  });

  fastify.get("/me/videos", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.video.findMany({
      where: { userId: dbUser.id },
      orderBy: [{ createdAt: "desc" }]
    });

    return { items };
  });

  fastify.get("/me/notifications", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const items = await fastify.prisma.notification.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return { items };
  });

  fastify.patch("/me/notifications/read-all", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    await fastify.prisma.notification.updateMany({
      where: { userId: dbUser.id, isRead: false },
      data: { isRead: true }
    });

    return { ok: true };
  });
};

export default userRoutes;
