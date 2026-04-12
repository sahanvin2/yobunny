import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createDownloadUrl, uploadObjectToB2 } from "../services/b2.js";
import { requireAuth } from "../middleware/requireAuth.js";

const visibilitySchema = z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(80).default(20),
  sort: z.enum(["latest", "views"]).default("latest")
});

const postCommentSchema = z.object({
  body: z.string().min(1).max(2000)
});

function serializePostFileSize<T extends { fileSize: bigint | number | string }>(post: T): Omit<T, "fileSize"> & { fileSize: string | number } {
  return {
    ...post,
    fileSize: typeof post.fileSize === "bigint" ? post.fileSize.toString() : post.fileSize
  };
}

const postsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", code: "VALIDATION_ERROR" });
    }

    const { page, limit, sort } = parsed.data;
    const orderBy = sort === "views" ? { viewCount: "desc" as const } : { publishedAt: "desc" as const };

    const where = {
      status: "PUBLISHED" as const,
      visibility: "PUBLIC" as const
    };

    const [items, total] = await Promise.all([
      fastify.prisma.post.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true
            }
          }
        }
      }),
      fastify.prisma.post.count({ where })
    ]);

    reply.header("Cache-Control", "public, max-age=120");
    return { items: items.map(serializePostFileSize), pagination: { page, limit, total } };
  });

  fastify.get("/my", { preHandler: requireAuth }, async (request) => {
    const dbUser = await fastify.prisma.user.findUnique({
      where: { firebaseUid: request.authUser!.uid }
    });

    if (!dbUser) {
      return { items: [] };
    }

    const items = await fastify.prisma.post.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" }
    });

    return { items: items.map(serializePostFileSize) };
  });

  fastify.get("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const item = await fastify.prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true
          }
        }
      }
    });

    if (!item || item.status !== "PUBLISHED" || item.visibility === "PRIVATE") {
      return reply.code(404).send({ error: "Post not found", code: "NOT_FOUND" });
    }

    await fastify.prisma.post.update({
      where: { id: item.id },
      data: { viewCount: { increment: 1 } }
    }).catch(() => undefined);

    return { item: serializePostFileSize(item) };
  });

  fastify.get("/:id/comments", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const item = await fastify.prisma.post.findUnique({ where: { id }, select: { id: true } });
    if (!item) {
      return reply.code(404).send({ error: "Post not found", code: "NOT_FOUND" });
    }

    const items = await fastify.prisma.postComment.findMany({
      where: { postId: id },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return { items };
  });

  fastify.post("/:id/comments", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = postCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid comment", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }

    const post = await fastify.prisma.post.findUnique({ where: { id } });
    if (!post || post.status !== "PUBLISHED") {
      return reply.code(404).send({ error: "Post not found", code: "NOT_FOUND" });
    }

    const item = await fastify.prisma.postComment.create({
      data: {
        body: parsed.data.body,
        postId: id,
        userId: dbUser.id
      },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });

    await fastify.prisma.post.update({
      where: { id },
      data: { commentCount: { increment: 1 } }
    }).catch(() => undefined);

    return { item };
  });

  fastify.post("/:id/like", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }

    const post = await fastify.prisma.post.findUnique({ where: { id } });
    if (!post || post.status !== "PUBLISHED") {
      return reply.code(404).send({ error: "Post not found", code: "NOT_FOUND" });
    }

    const existing = await fastify.prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: dbUser.id,
          postId: id
        }
      }
    });

    if (existing) {
      await fastify.prisma.postLike.delete({
        where: {
          userId_postId: {
            userId: dbUser.id,
            postId: id
          }
        }
      });

      await fastify.prisma.post.update({
        where: { id },
        data: { likeCount: { decrement: 1 } }
      }).catch(() => undefined);

      return { liked: false };
    }

    await fastify.prisma.postLike.create({
      data: {
        userId: dbUser.id,
        postId: id
      }
    });

    await fastify.prisma.post.update({
      where: { id },
      data: { likeCount: { increment: 1 } }
    }).catch(() => undefined);

    return { liked: true };
  });

  fastify.get("/:id/download-url", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const item = await fastify.prisma.post.findUnique({ where: { id } });

    if (!item || item.status !== "PUBLISHED" || item.visibility === "PRIVATE") {
      return reply.code(404).send({ error: "Post not found", code: "NOT_FOUND" });
    }

    if (item.fileKey.startsWith("local/")) {
      return { url: item.fileUrl };
    }

    const url = await createDownloadUrl(item.fileKey, 1800);
    return { url };
  });

  fastify.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }

    const parts = request.parts();
    let title = "";
    let content = "";
    let visibility: "PUBLIC" | "PRIVATE" | "UNLISTED" = "PUBLIC";
    let uploadPart: { buffer: Buffer; filename: string; mimetype: string } | null = null;

    for await (const part of parts) {
      if (part.type === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.from(chunk));
        }

        uploadPart = {
          buffer: Buffer.concat(chunks),
          filename: part.filename || "attachment.bin",
          mimetype: part.mimetype || "application/octet-stream"
        };
        continue;
      }

      if (part.fieldname === "title") {
        title = String(part.value || "").trim();
      } else if (part.fieldname === "content") {
        content = String(part.value || "").trim();
      } else if (part.fieldname === "visibility") {
        const parsedVisibility = visibilitySchema.safeParse(String(part.value || "").trim().toUpperCase());
        if (parsedVisibility.success) {
          visibility = parsedVisibility.data;
        }
      }
    }

    if (!title || !content || !uploadPart) {
      return reply.code(400).send({ error: "title, content and file are required", code: "VALIDATION_ERROR" });
    }

    const ext = (uploadPart.filename.split(".").pop() || "bin").toLowerCase();

    const created = await fastify.prisma.post.create({
      data: {
        title,
        content,
        fileKey: "pending",
        fileUrl: "pending",
        fileName: uploadPart.filename,
        mimeType: uploadPart.mimetype,
        fileSize: BigInt(uploadPart.buffer.length),
        visibility,
        status: "DRAFT",
        userId: dbUser.id
      }
    });

    try {
      const fileKey = `posts/${dbUser.id}/${created.id}/asset.${ext}`;
      const uploaded = await uploadObjectToB2(fileKey, uploadPart.buffer, uploadPart.mimetype, 120000);

      const item = await fastify.prisma.post.update({
        where: { id: created.id },
        data: {
          fileKey,
          fileUrl: uploaded.publicUrl,
          status: "PUBLISHED",
          publishedAt: new Date()
        },
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true
            }
          }
        }
      });

      return { item: serializePostFileSize(item) };
    } catch (error) {
      await fastify.prisma.post.update({
        where: { id: created.id },
        data: { status: "FAILED" }
      }).catch(() => undefined);

      request.log.error({ err: error }, "Post upload failed");
      return reply.code(500).send({ error: "Failed to upload post asset", code: "UPLOAD_FAILED" });
    }
  });
};

export default postsRoutes;
