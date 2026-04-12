import type { FastifyPluginAsync } from "fastify";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { createDownloadUrl, createRawUploadUrl, uploadObjectToB2 } from "../services/b2.js";
import { getRecommendedVideoIds } from "../services/recommendation.js";
import { hasLocalObject, localPlaybackUrl, localThumbnailUrl, readLocalObject, resolveLocalObjectPath, writeLocalObject } from "../services/localStorage.js";
import { extractVideoDuration } from "../services/videoMetadata.js";

const CATEGORY_VALUES = [
  "ENTERTAINMENT",
  "MUSIC",
  "GAMING",
  "EDUCATION",
  "TECHNOLOGY",
  "SPORTS",
  "NEWS",
  "TRAVEL",
  "FOOD",
  "FASHION",
  "HEALTH",
  "COMEDY",
  "FILM",
  "CARS",
  "PETS",
  "DIY",
  "SCIENCE",
  "POLITICS",
  "CULTURE",
  "VLOGS"
] as const;

const VISIBILITY_VALUES = ["PUBLIC", "PRIVATE", "UNLISTED"] as const;
const AUTO_CLIP_TAG = "__AUTO_CLIP__";
const UPLOAD_SESSION_TAG_PREFIX = "__UPLOAD_SESSION__:";
const PLAYABLE_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const TRANSCODED_KEY_PREFIX = "local/transcoded";
const THUMB_WIDTHS = new Set([320, 640, 960, 1280]);
const transcodeLocks = new Map<string, Promise<void>>();

function extFromKey(key: string) {
  return (key.split(".").pop() || "").toLowerCase();
}

function mimeTypeFromExt(ext: string) {
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

async function withTranscodeLock(lockKey: string, work: () => Promise<void>) {
  const existing = transcodeLocks.get(lockKey);
  if (existing) {
    await existing;
    return;
  }

  const current = work().finally(() => {
    transcodeLocks.delete(lockKey);
  });

  transcodeLocks.set(lockKey, current);
  await current;
}

async function transcodeToMp4(inputPath: string, outputPath: string) {
  const ffmpegBinary = ffmpegPath as unknown as string | null;
  if (!ffmpegBinary) {
    throw new Error("FFmpeg binary is not available");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-y",
      "-i",
      inputPath,
      "-movflags",
      "+faststart",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-300)}`));
    });
  });
}

async function createThumbnailFromVideoBuffer(videoBuffer: Buffer) {
  const ffmpegBinary = ffmpegPath as unknown as string | null;
  if (!ffmpegBinary) {
    return null;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yobunny-thumb-"));
  const inputPath = path.join(tempDir, "input-video");
  const outputPath = path.join(tempDir, "thumb.webp");

  try {
    await fs.writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegBinary, [
        "-y",
        "-ss",
        "1",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(960,iw)':-2",
        "-c:v",
        "libwebp",
        "-q:v",
        "68",
        outputPath
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`FFmpeg thumbnail generation failed (${code}): ${stderr.slice(-300)}`));
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function compressImageToWebp(imageBuffer: Buffer) {
  const ffmpegBinary = ffmpegPath as unknown as string | null;
  if (!ffmpegBinary) {
    return null;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yobunny-img-webp-"));
  const inputPath = path.join(tempDir, "input-image");
  const outputPath = path.join(tempDir, "thumb.webp");

  try {
    await fs.writeFile(inputPath, imageBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegBinary, [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale='min(960,iw)':-2",
        "-c:v",
        "libwebp",
        "-q:v",
        "68",
        outputPath
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`FFmpeg image conversion failed (${code}): ${stderr.slice(-300)}`));
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function createResponsiveThumbnail(imageBuffer: Buffer, width: number) {
  return sharp(imageBuffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
}

async function downloadToFile(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download source video for transcoding");
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, content);
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(40),
  category: z.enum(CATEGORY_VALUES).optional(),
  sort: z.enum(["latest", "views"]).default("latest")
});

const uploadUrlSchema = z.object({
  title: z.string().min(1).max(150),
  category: z.enum(CATEGORY_VALUES),
  fileExt: z.string().min(2).max(10).default("mp4"),
  creatorChannelId: z.string().min(2).max(120)
});

const updateVideoSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(30).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  thumbnailUrl: z.string().url().optional()
});

const videosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", code: "VALIDATION_ERROR" });
    }

    const { page, limit, category, sort } = parsed.data;
    const orderBy = sort === "views" ? { viewCount: "desc" as const } : { publishedAt: "desc" as const };

    const where = {
      status: "READY" as const,
      visibility: "PUBLIC" as const,
      ...(category ? { category } : {})
    };

    const [items, total] = await Promise.all([
      fastify.prisma.video.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { username: true, displayName: true, avatarUrl: true } } }
      }),
      fastify.prisma.video.count({ where })
    ]);

    reply.header("Cache-Control", "public, max-age=60");
    return { items, pagination: { page, limit, total } };
  });

  fastify.get("/trending", async (_request, reply) => {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const items = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC",
        publishedAt: { gte: since }
      },
      orderBy: { viewCount: "desc" },
      take: 30
    });

    reply.header("Cache-Control", "public, max-age=300");
    return { items };
  });

  fastify.get("/recommended", { preHandler: requireAuth }, async (request) => {
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return { items: [] };
    }

    const ids = await getRecommendedVideoIds(fastify, dbUser.id);
    const videos = await fastify.prisma.video.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { username: true, displayName: true, avatarUrl: true } } }
    });

    const sorted = ids
      .map((id) => videos.find((v: { id: string }) => v.id === id))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
    return { items: sorted };
  });

  fastify.get("/search", async (request, reply) => {
    const q = z.string().min(1).max(120).safeParse((request.query as Record<string, string>).q ?? "");
    if (!q.success) {
      return reply.code(400).send({ error: "Missing search query", code: "VALIDATION_ERROR" });
    }

    const items = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC",
        OR: [
          { title: { contains: q.data, mode: "insensitive" } },
          { description: { contains: q.data, mode: "insensitive" } },
          { tags: { has: q.data } }
        ]
      },
      take: 40,
      orderBy: { viewCount: "desc" }
    });

    return { items };
  });

  fastify.get("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({
      where: { id },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true, subscriberCount: true } },
        qualities: true
      }
    });

    if (!video || video.visibility !== "PUBLIC") {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    fastify.prisma.video.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
    return { item: video };
  });

  fastify.get("/:id/manage", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    return { item: video };
  });

  fastify.post("/upload-url", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = uploadUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const creatorChannelId = parsed.data.creatorChannelId.trim();
    if (!creatorChannelId) {
      return reply.code(400).send({ error: "Please choose a channel before uploading", code: "CHANNEL_REQUIRED" });
    }

    const video = await fastify.prisma.video.create({
      data: {
        title: parsed.data.title,
        rawFileKey: "pending",
        status: "UPLOADING",
        category: parsed.data.category,
        tags: [`__CHANNEL__:${creatorChannelId}`],
        userId: dbUser.id
      }
    });

    const fileKey = `raw/${dbUser.id}/${video.id}/original.${parsed.data.fileExt}`;
    const { uploadUrl } = await createRawUploadUrl(fileKey, 3600);

    await fastify.prisma.video.update({
      where: { id: video.id },
      data: { rawFileKey: fileKey }
    });

    return { uploadUrl, videoId: video.id, fileKey };
  });

  fastify.post("/upload-file", { preHandler: requireAuth }, async (request, reply) => {
    // Increase socket timeout for file upload
    request.socket.setTimeout(300000);  // 5 minute timeout

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    fastify.log.info("Starting upload for user: " + dbUser.id);

    let videoUpload: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    let thumbnailUpload: { filename: string; mimetype: string; buffer: Buffer } | null = null;
    const fields: Record<string, string> = {};

    try {
      const parts = request.parts();
      for await (const part of parts) {
        try {
          if (part.type === "file") {
            if (part.fieldname === "file") {
              const buffer = await part.toBuffer();
              videoUpload = {
                filename: part.filename,
                mimetype: part.mimetype,
                buffer
              };
            } else if (part.fieldname === "thumbnail") {
              const buffer = await part.toBuffer();
              thumbnailUpload = {
                filename: part.filename,
                mimetype: part.mimetype,
                buffer
              };
            } else {
              await part.toBuffer();
            }
          } else {
            fields[part.fieldname] = String(part.value ?? "");
          }
        } catch (partError) {
          fastify.log.error({ error: String(partError), fieldname: part.fieldname }, "Error processing part");
          throw partError;
        }
      }
    } catch (parseError) {
      fastify.log.error({ error: String(parseError) }, "Error parsing multipart form");
      return reply.code(400).send({ error: "Failed to parse upload", code: "PARSE_ERROR" });
    }

    if (!videoUpload) {
      return reply.code(400).send({ error: "Missing video file", code: "VALIDATION_ERROR" });
    }

    if (!(videoUpload.mimetype || "").startsWith("video/")) {
      return reply.code(400).send({ error: "Invalid video format", code: "VALIDATION_ERROR" });
    }

    const title = String(fields.title || videoUpload.filename).trim();
    const categoryRaw = String(fields.category || "ENTERTAINMENT").toUpperCase();
    const visibilityRaw = String(fields.visibility || "PUBLIC").toUpperCase();
    const description = String(fields.description || "").trim() || undefined;
    const tagsRaw = String(fields.tags || "");
    const creatorChannelId = String(fields.creatorChannelId || "").trim();
    const uploadSessionId = String(request.headers["x-upload-session-id"] ?? fields.uploadSessionId ?? "").trim();
    const videoWidth = Number.parseInt(String(fields.videoWidth || "0"), 10) || 0;
    const videoHeight = Number.parseInt(String(fields.videoHeight || "0"), 10) || 0;
    const clientDuration = Number.parseInt(String(fields.videoDuration || "0"), 10) || 0;

    const category = z.enum(CATEGORY_VALUES).safeParse(categoryRaw);
    const visibility = z.enum(VISIBILITY_VALUES).safeParse(visibilityRaw);

    if (!category.success || !visibility.success || !title) {
      return reply.code(400).send({ error: "Invalid upload metadata", code: "VALIDATION_ERROR" });
    }

    if (!creatorChannelId) {
      return reply.code(400).send({ error: "Please choose a channel before uploading", code: "CHANNEL_REQUIRED" });
    }

    if (!/^[a-zA-Z0-9_-]{2,120}$/.test(creatorChannelId)) {
      return reply.code(400).send({ error: "Invalid channel selection", code: "VALIDATION_ERROR" });
    }

    if (uploadSessionId && !/^[a-zA-Z0-9_-]{8,120}$/.test(uploadSessionId)) {
      return reply.code(400).send({ error: "Invalid upload session id", code: "VALIDATION_ERROR" });
    }

    const uploadSessionTag = uploadSessionId ? `${UPLOAD_SESSION_TAG_PREFIX}${uploadSessionId}` : "";
    if (uploadSessionTag) {
      const existing = await fastify.prisma.video.findFirst({
        where: {
          userId: dbUser.id,
          tags: { has: uploadSessionTag }
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing && existing.status !== "FAILED") {
        fastify.log.info({ videoId: existing.id, uploadSessionId }, "Duplicate upload request detected, returning existing video");
        return { item: existing };
      }
    }

    const ext = (videoUpload.filename.split(".").pop() || "mp4").toLowerCase();
    let videoId = "";

    try {
      fastify.log.info({ videoTitle: title, videoExt: ext }, "Creating video record");

      const parsedTags = tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => !tag.startsWith("__UPLOAD_SESSION__:"))
        .filter(Boolean)
        .slice(0, 30);

      const channelTag = creatorChannelId ? `__CHANNEL__:${creatorChannelId}` : "";
      const tagsWithChannel = channelTag && !parsedTags.includes(channelTag) ? [channelTag, ...parsedTags] : parsedTags;
      const tagsWithSession = uploadSessionTag && !tagsWithChannel.includes(uploadSessionTag)
        ? [uploadSessionTag, ...tagsWithChannel]
        : tagsWithChannel;

      const video = await fastify.prisma.video.create({
        data: {
          title,
          description,
          rawFileKey: "pending",
          status: "UPLOADING",
          category: category.data,
          visibility: visibility.data,
          tags: tagsWithSession,
          userId: dbUser.id
        }
      });

      videoId = video.id;
      fastify.log.info({ videoId: video.id }, "Video record created");

      const fileKey = `raw/${dbUser.id}/${video.id}/original.${ext}`;
      const buffer = videoUpload.buffer;
      let playbackUrl: string;
      let storedRawFileKey = fileKey;

      // Extract video duration
      fastify.log.info({ fileSize: buffer.length }, "Extracting video duration");
      const videoDuration = await extractVideoDuration(buffer);
      const effectiveDuration = videoDuration > 0 ? videoDuration : clientDuration;
      const isPortrait = videoWidth > 0 && videoHeight > 0 && videoHeight > videoWidth;
      const shouldAutoClip = effectiveDuration > 0 && effectiveDuration <= 60 && isPortrait;
      const finalTags = shouldAutoClip && !tagsWithSession.includes(AUTO_CLIP_TAG)
        ? [...tagsWithSession, AUTO_CLIP_TAG]
        : tagsWithSession;
      fastify.log.info({ videoDuration: effectiveDuration, isPortrait, shouldAutoClip }, "Video metadata extracted");

      // Upload to B2
      fastify.log.info({ fileSize: buffer.length }, "Saving to B2 storage");
      const videoKey = `videos/${video.id}/original.${ext}`;
      try {
        const b2VideoUploaded = await uploadObjectToB2(videoKey, buffer, videoUpload.mimetype || `video/${ext}`, 300000); // 5 mins timeout
        storedRawFileKey = b2VideoUploaded.key;
        playbackUrl = b2VideoUploaded.publicUrl;
        fastify.log.info({ playbackUrl }, "Video saved to B2");
      } catch (b2Error) {
        fastify.log.error({ error: String(b2Error) }, "B2 upload failed, falling back to local");
        const localKey = `local/${dbUser.id}/${video.id}/original.${ext}`;
        await writeLocalObject(localKey, buffer);
        storedRawFileKey = localKey;
        playbackUrl = `http://localhost:4000/api/videos/${video.id}/stream`;
      }

      let thumbnailUrl: string | undefined;
      if (thumbnailUpload) {
        try {
          const webpBuffer = await compressImageToWebp(thumbnailUpload.buffer).catch(() => null);
          const thumbExt = webpBuffer ? "webp" : (thumbnailUpload.filename.split(".").pop() || "jpg").toLowerCase();
          const thumbVersion = Date.now();
          const thumbKey = `thumbnails/${video.id}/thumb-${thumbVersion}.${thumbExt}`;
          const thumbBuffer = webpBuffer || thumbnailUpload.buffer;
          const thumbMime = webpBuffer ? "image/webp" : (thumbnailUpload.mimetype || "image/jpeg");

          fastify.log.info({ thumbKey }, "Processing thumbnail");

          // Try B2 thumbnail upload
          try {
            const thumbUploaded = await uploadObjectToB2(thumbKey, thumbBuffer, thumbMime, 15000);
            thumbnailUrl = thumbUploaded.publicUrl;
          } catch {
            // Fall back to local for thumbnail
            const localThumbKey = `local/${dbUser.id}/${video.id}/thumb.${thumbExt}`;
            await writeLocalObject(localThumbKey, thumbBuffer);
            thumbnailUrl = `http://localhost:4000/api/videos/${video.id}/thumbnail`;
          }
        } catch {
          fastify.log.warn("Thumbnail processing failed");
        }
      } else {
        try {
          const generatedThumbBuffer = await createThumbnailFromVideoBuffer(buffer);
          if (generatedThumbBuffer) {
            const thumbExt = "webp";
            const thumbVersion = Date.now();
            const thumbKey = `thumbnails/${video.id}/thumb-${thumbVersion}.${thumbExt}`;

            try {
              const uploaded = await uploadObjectToB2(thumbKey, generatedThumbBuffer, "image/webp", 15000);
              thumbnailUrl = uploaded.publicUrl;
            } catch {
              const localThumbKey = `local/${dbUser.id}/${video.id}/thumb.${thumbExt}`;
              await writeLocalObject(localThumbKey, generatedThumbBuffer);
              thumbnailUrl = `http://localhost:4000/api/videos/${video.id}/thumbnail`;
            }
          }
        } catch (thumbError) {
          fastify.log.warn({ error: String(thumbError), videoId: video.id }, "Auto thumbnail generation failed");
        }
      }

      fastify.log.info({ videoId: video.id }, "Updating video record with final URLs");

      const updated = await fastify.prisma.video.update({
        where: { id: video.id },
        data: {
          rawFileKey: storedRawFileKey,
          hlsBaseUrl: playbackUrl,
          thumbnailUrl,
          duration: effectiveDuration > 0 ? effectiveDuration : undefined,
          tags: finalTags,
          status: "READY",
          publishedAt: new Date()
        }
      });

      fastify.log.info({ videoId: video.id }, "Upload complete");

      return { item: updated };
    } catch (uploadError) {
      fastify.log.error({ error: String(uploadError), videoId }, "Video upload failed");
      if (videoId) {
        await fastify.prisma.video.update({
          where: { id: videoId },
          data: { status: "FAILED" }
        }).catch(() => undefined);
      }

      return reply.code(500).send({ error: "Upload failed", code: "UPLOAD_FAILED" });
    }
  });

  fastify.get("/:id/download-url", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({ where: { id } });

    if (!video || video.visibility === "PRIVATE") {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    let url: string;

    if (video.hlsBaseUrl?.includes(`/api/videos/${video.id}/stream`)) {
      url = `http://localhost:4000/api/videos/${video.id}/download`;
    } else {
      url = await createDownloadUrl(video.rawFileKey, 1800);
    }

    return { url };
  });

  fastify.get("/:id/stream", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({ where: { id } });

    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const rawKey = video.rawFileKey;

    if (await hasLocalObject(rawKey)) {
      const ext = extFromKey(rawKey);
      reply.header("Content-Type", PLAYABLE_EXTENSIONS.has(ext) ? mimeTypeFromExt(ext) : "video/mp4");
      reply.header("Cache-Control", "public, max-age=31536000");
      return reply.send(createReadStream(resolveLocalObjectPath(rawKey)));
    }

    const signedSourceUrl = await createDownloadUrl(rawKey, 900);
    return reply.redirect(signedSourceUrl);
  });

  fastify.get("/:id/playable", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({ where: { id } });

    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const transcodedKey = `${TRANSCODED_KEY_PREFIX}/${video.id}.mp4`;

    try {
      await withTranscodeLock(transcodedKey, async () => {
        if (await hasLocalObject(transcodedKey)) {
          return;
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `yobunny-playable-${video.id}-`));
        const inputPath = path.join(tempDir, `input-${video.id}`);
        const outputPath = path.join(tempDir, `output-${video.id}.mp4`);

        try {
          if (await hasLocalObject(video.rawFileKey)) {
            await fs.copyFile(resolveLocalObjectPath(video.rawFileKey), inputPath);
          } else {
            const signedSourceUrl = await createDownloadUrl(video.rawFileKey, 1800);
            await downloadToFile(signedSourceUrl, inputPath);
          }

          await transcodeToMp4(inputPath, outputPath);
          const transcodedBuffer = await fs.readFile(outputPath);
          await writeLocalObject(transcodedKey, transcodedBuffer);
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
      });
    } catch (error) {
      fastify.log.warn({ error: String(error), videoId: video.id }, "Playable transcode failed");
      return reply.code(415).send({ error: "Video format is not playable yet", code: "UNSUPPORTED_MEDIA" });
    }

    reply.header("Content-Type", "video/mp4");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(createReadStream(resolveLocalObjectPath(transcodedKey)));
  });

  fastify.get("/:id/thumbnail", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const widthParam = Number((request.query as { w?: string | number }).w || 0);
    const requestedWidth = Number.isFinite(widthParam) && THUMB_WIDTHS.has(widthParam) ? widthParam : 0;
    const video = await fastify.prisma.video.findUnique({ where: { id } });

    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const candidates = ["webp", "jpg", "jpeg", "png"];
    for (const ext of candidates) {
      const localThumbKey = `local/${video.userId}/${video.id}/thumb.${ext}`;
      if (await hasLocalObject(localThumbKey)) {
        const buffer = await readLocalObject(localThumbKey);
        if (requestedWidth > 0) {
          const resizedThumbKey = `local/${video.userId}/${video.id}/thumb-${requestedWidth}.webp`;
          if (await hasLocalObject(resizedThumbKey)) {
            const resized = await readLocalObject(resizedThumbKey);
            reply.header("Content-Type", "image/webp");
            reply.header("Cache-Control", "public, max-age=31536000, immutable, stale-while-revalidate=604800");
            reply.header("Vary", "Accept");
            return reply.send(resized);
          }

          const resized = await createResponsiveThumbnail(buffer, requestedWidth);
          await writeLocalObject(resizedThumbKey, resized);
          reply.header("Content-Type", "image/webp");
          reply.header("Cache-Control", "public, max-age=31536000, immutable, stale-while-revalidate=604800");
          reply.header("Vary", "Accept");
          return reply.send(resized);
        }

        reply.header("Content-Type", `image/${ext === "jpg" ? "jpeg" : ext}`);
        reply.header("Cache-Control", "public, max-age=31536000, immutable, stale-while-revalidate=604800");
        reply.header("Vary", "Accept");
        return reply.send(buffer);
      }
    }

    return reply.code(404).send({ error: "Thumbnail not found", code: "NOT_FOUND" });
  });

  fastify.get("/:id/interactions", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const [liked, saved] = await Promise.all([
      fastify.prisma.videoLike.findUnique({ where: { userId_videoId: { userId: dbUser.id, videoId: id } } }),
      fastify.prisma.savedVideo.findUnique({ where: { userId_videoId: { userId: dbUser.id, videoId: id } } })
    ]);

    return { liked: Boolean(liked), saved: Boolean(saved) };
  });

  fastify.post("/:id/thumbnail", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ error: "Missing thumbnail file", code: "VALIDATION_ERROR" });
    }

    if (!(part.mimetype || "").startsWith("image/")) {
      return reply.code(400).send({ error: "Invalid image format", code: "VALIDATION_ERROR" });
    }

    const ext = (part.filename.split(".").pop() || "jpg").toLowerCase();
    const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
    const safeExt = allowedExt.has(ext) ? ext : "jpg";
    const contentType = safeExt === "jpg" ? "image/jpeg" : `image/${safeExt}`;
    const originalBuffer = await part.toBuffer();
    const webpBuffer = await compressImageToWebp(originalBuffer).catch(() => null);
    const buffer = webpBuffer || originalBuffer;
    const outputExt = webpBuffer ? "webp" : safeExt;
    const outputType = webpBuffer ? "image/webp" : contentType;

    let thumbnailUrl: string;
    const thumbVersion = Date.now();
    const thumbKey = `thumbnails/${video.id}/thumb-${thumbVersion}.${outputExt}`;
    try {
      const uploaded = await uploadObjectToB2(thumbKey, buffer, outputType, 30000);
      thumbnailUrl = uploaded.publicUrl;
    } catch {
      const localThumbKey = `local/${dbUser.id}/${video.id}/thumb.${outputExt}`;
      await writeLocalObject(localThumbKey, buffer);
      thumbnailUrl = `http://localhost:4000/api/videos/${video.id}/thumbnail`;
    }

    const updated = await fastify.prisma.video.update({
      where: { id },
      data: { thumbnailUrl }
    });

    return { item: updated };
  });

  fastify.get("/:id/download", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({ where: { id } });

    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const transcodedKey = `${TRANSCODED_KEY_PREFIX}/${video.id}.mp4`;
    if (await hasLocalObject(transcodedKey)) {
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename=\"${video.title.replace(/\s+/g, "_")}.mp4\"`);
      return reply.send(createReadStream(resolveLocalObjectPath(transcodedKey)));
    }

    const ext = extFromKey(video.rawFileKey) || "mp4";
    if (await hasLocalObject(video.rawFileKey)) {
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename=\"${video.title.replace(/\s+/g, "_")}.${ext}\"`);
      return reply.send(createReadStream(resolveLocalObjectPath(video.rawFileKey)));
    }

    const signed = await createDownloadUrl(video.rawFileKey, 1800);
    return reply.redirect(signed);
  });

  fastify.post("/:id/upload-complete", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    await fastify.prisma.video.update({
      where: { id },
      data: {
        status: "PROCESSING",
        publishedAt: new Date()
      }
    });

    return { queued: true, message: "Transcoding worker scaffolding is ready. Queue integration is next." };
  });

  fastify.patch("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateVideoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", code: "VALIDATION_ERROR" });
    }

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const updated = await fastify.prisma.video.update({ where: { id }, data: parsed.data });
    return { item: updated };
  });

  fastify.post("/:id/retry-upload", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    if (video.status === "READY") {
      return { ok: true, item: video, message: "Video is already published" };
    }

    const hasRecoverableMedia = video.rawFileKey !== "pending" && Boolean(video.hlsBaseUrl);

    if (!hasRecoverableMedia) {
      return reply.code(400).send({ error: "Video source is missing. Please re-upload the video file.", code: "NOT_RECOVERABLE" });
    }

    const updated = await fastify.prisma.video.update({
      where: { id },
      data: {
        status: "READY",
        publishedAt: video.publishedAt ?? new Date()
      }
    });

    return { ok: true, item: updated };
  });

  fastify.delete("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== dbUser.id) {
      return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" });
    }

    await fastify.prisma.video.delete({ where: { id } });
    return { deleted: true };
  });

  fastify.post("/:id/like", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const existing = await fastify.prisma.videoLike.findUnique({
      where: { userId_videoId: { userId: dbUser.id, videoId: id } }
    });

    if (existing) {
      await fastify.prisma.videoLike.delete({ where: { userId_videoId: { userId: dbUser.id, videoId: id } } });
      await fastify.prisma.video.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
      await fastify.redis.del(`recs:${dbUser.id}`);
      return { liked: false };
    }

    await fastify.prisma.videoLike.create({ data: { userId: dbUser.id, videoId: id } });
    await fastify.prisma.video.update({ where: { id }, data: { likeCount: { increment: 1 } } });
    await fastify.redis.del(`recs:${dbUser.id}`);
    return { liked: true };
  });

  fastify.post("/:id/save", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const existing = await fastify.prisma.savedVideo.findUnique({
      where: { userId_videoId: { userId: dbUser.id, videoId: id } }
    });

    if (existing) {
      await fastify.prisma.savedVideo.delete({ where: { userId_videoId: { userId: dbUser.id, videoId: id } } });
      return { saved: false };
    }

    await fastify.prisma.savedVideo.create({ data: { userId: dbUser.id, videoId: id } });
    return { saved: true };
  });

  fastify.post("/:id/watch", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const percent = z.coerce.number().min(0).max(1).catch(0).parse((request.body as Record<string, unknown>)?.watchPercent);
    const dbUser = await fastify.prisma.user.findUnique({ where: { firebaseUid: request.authUser!.uid } });
    if (!dbUser) {
      return reply.code(404).send({ error: "User profile not found", code: "USER_NOT_FOUND" });
    }

    const video = await fastify.prisma.video.findUnique({ where: { id } });
    if (!video) {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const recent = await fastify.prisma.watchHistory.findFirst({
      where: { userId: dbUser.id, videoId: id },
      orderBy: { watchedAt: "desc" }
    });

    const now = Date.now();
    const recentMs = recent ? new Date(recent.watchedAt).getTime() : 0;
    const shouldUpdateRecent = recent && now - recentMs < 10 * 60 * 1000;

    if (shouldUpdateRecent) {
      await fastify.prisma.watchHistory.update({
        where: { id: recent.id },
        data: {
          watchedAt: new Date(now),
          watchPercent: Math.max(recent.watchPercent, percent)
        }
      });
    } else {
      await fastify.prisma.watchHistory.create({
        data: {
          userId: dbUser.id,
          videoId: id,
          watchPercent: percent
        }
      });
    }

    await fastify.redis.del(`recs:${dbUser.id}`);
    return { ok: true };
  });
};

export default videosRoutes;
