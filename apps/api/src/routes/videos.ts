import type { FastifyPluginAsync } from "fastify";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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
const USER_UPLOAD_EXTENSIONS = new Set(["mp4"]);
const THUMB_WIDTHS = new Set([320, 640, 960, 1280]);
const MODEL_TAG_PREFIX = "__MODEL__:";
const MODEL_BROWSE_SCAN_LIMIT = 1600;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MODEL_METADATA_AGE_PREFIX = "__AGE__:";
const MODEL_METADATA_MEASUREMENTS_PREFIX = "__MEASUREMENTS__:";
const MODEL_METADATA_HEIGHT_PREFIX = "__HEIGHT__:";

function normalizeModelSlug(input: string) {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized === "cherry-moon") {
    return "leia-von";
  }

  return normalized;
}

function titleCaseFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toModelTag(slug: string) {
  return `${MODEL_TAG_PREFIX}${slug}`;
}

function parseAgeValue(raw: string) {
  const match = String(raw || "").match(/\b(1[89]|[2-6][0-9])\b/);
  return match ? Number(match[1]) : null;
}

function parseMeasurementsValue(raw: string) {
  const normalized = String(raw || "").trim();
  const match = normalized.match(/\b(\d{2,3})\s*[-x/]\s*(\d{2,3})\s*[-x/]\s*(\d{2,3})\b/i);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseHeightValue(raw: string) {
  const normalized = String(raw || "").trim();
  const feetInches = normalized.match(/\b([4-7])\s*['’]\s*(\d{1,2})\b/);
  if (feetInches) return `${feetInches[1]}'${feetInches[2]}"`;

  const centimeters = normalized.match(/\b(1\d{2}|2[0-2]\d)\s*cm\b/i);
  if (centimeters) return `${centimeters[1]} cm`;

  return null;
}

function extractModelMetadata(tags: string[], bio?: string | null) {
  let age: number | null = null;
  let bodyMeasurements: string | null = null;
  let height: string | null = null;

  for (const rawTag of tags || []) {
    const tag = String(rawTag || "").trim();
    if (!tag) continue;

    if (!age && tag.startsWith(MODEL_METADATA_AGE_PREFIX)) {
      age = parseAgeValue(tag.slice(MODEL_METADATA_AGE_PREFIX.length));
      continue;
    }

    if (!bodyMeasurements && tag.startsWith(MODEL_METADATA_MEASUREMENTS_PREFIX)) {
      bodyMeasurements = parseMeasurementsValue(tag.slice(MODEL_METADATA_MEASUREMENTS_PREFIX.length));
      continue;
    }

    if (!height && tag.startsWith(MODEL_METADATA_HEIGHT_PREFIX)) {
      height = parseHeightValue(tag.slice(MODEL_METADATA_HEIGHT_PREFIX.length));
    }
  }

  const bioText = String(bio || "");
  if (!age) {
    const ageMatch = bioText.match(/(?:age|years?\s*old)\D{0,8}(1[89]|[2-6][0-9])\b/i);
    age = ageMatch ? Number(ageMatch[1]) : null;
  }

  if (!bodyMeasurements) {
    bodyMeasurements = parseMeasurementsValue(bioText);
  }

  if (!height) {
    const heightMatch = bioText.match(/(?:height|ht)\D{0,8}([4-7]\s*['’]\s*\d{1,2}|1\d{2}\s*cm|2[0-2]\d\s*cm)/i);
    height = heightMatch ? parseHeightValue(heightMatch[1]) : null;
  }

  return {
    age,
    bodyMeasurements,
    height,
    profileBio: bioText.trim() || null
  };
}

function extractModelSlugs(tags: string[]) {
  const out = new Set<string>();
  for (const raw of tags) {
    if (!raw.startsWith(MODEL_TAG_PREFIX)) continue;
    const slug = normalizeModelSlug(raw.slice(MODEL_TAG_PREFIX.length));
    if (slug) out.add(slug);
  }
  return [...out];
}

function hasModelTags(tags: string[]) {
  return extractModelSlugs(tags).length > 0;
}

function extFromKey(key: string) {
  return (key.split(".").pop() || "").toLowerCase();
}

function mimeTypeFromExt(ext: string) {
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
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
  modelNames: z.array(z.string().min(1).max(80)).max(12).default([]),
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

  fastify.get("/models", async (request, reply) => {
    const q = String((request.query as { q?: string }).q || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number((request.query as { limit?: string | number }).limit || 40), 1), 80);
    const offset = Math.max(Number((request.query as { offset?: string | number }).offset || 0), 0);

    const items = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC"
      },
      select: {
        id: true,
        tags: true,
        viewCount: true,
        thumbnailUrl: true,
        publishedAt: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            username: true,
            bio: true
          }
        }
      },
      orderBy: { publishedAt: "desc" },
      take: MODEL_BROWSE_SCAN_LIMIT
    });

    const index = new Map<string, {
      slug: string;
      name: string;
      videoCount: number;
      totalViews: number;
      thumbnailUrl: string | null;
      latestAt: number;
      creatorIds: Set<string>;
      primaryAccountUsername: string | null;
      age: number | null;
      bodyMeasurements: string | null;
      height: string | null;
      profileBio: string | null;
    }>();
    for (const item of items) {
      const slugs = extractModelSlugs(item.tags);
      const metadata = extractModelMetadata(item.tags, item.user?.bio || null);
      for (const slug of slugs) {
        const existing = index.get(slug);
        const publishedAt = new Date(item.publishedAt || item.createdAt).getTime();
        if (!existing) {
          index.set(slug, {
            slug,
            name: titleCaseFromSlug(slug),
            videoCount: 1,
            totalViews: item.viewCount,
            thumbnailUrl: item.thumbnailUrl || null,
            latestAt: publishedAt,
            creatorIds: new Set([item.userId]),
            primaryAccountUsername: item.user?.username || null,
            age: metadata.age,
            bodyMeasurements: metadata.bodyMeasurements,
            height: metadata.height,
            profileBio: metadata.profileBio
          });
          continue;
        }

        existing.videoCount += 1;
        existing.totalViews += item.viewCount;
        existing.creatorIds.add(item.userId);
        if (!existing.thumbnailUrl && item.thumbnailUrl) {
          existing.thumbnailUrl = item.thumbnailUrl;
        }
        if (!existing.primaryAccountUsername && item.user?.username) {
          existing.primaryAccountUsername = item.user.username;
        }
        if (existing.age == null && metadata.age != null) {
          existing.age = metadata.age;
        }
        if (!existing.bodyMeasurements && metadata.bodyMeasurements) {
          existing.bodyMeasurements = metadata.bodyMeasurements;
        }
        if (!existing.height && metadata.height) {
          existing.height = metadata.height;
        }
        if (!existing.profileBio && metadata.profileBio) {
          existing.profileBio = metadata.profileBio;
        }
        existing.latestAt = Math.max(existing.latestAt, publishedAt);
      }
    }

    const filtered = [...index.values()]
      .filter((entry) => {
        if (!q) return true;
        return entry.slug.includes(q.replace(/\s+/g, "-")) || entry.name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.videoCount - a.videoCount || b.totalViews - a.totalViews || b.latestAt - a.latestAt)
      .slice(offset, offset + limit)
      .map(({ latestAt, creatorIds, ...entry }) => ({
        ...entry,
        creatorCount: creatorIds.size
      }));

    const total = [...index.values()].filter((entry) => {
      if (!q) return true;
      return entry.slug.includes(q.replace(/\s+/g, "-")) || entry.name.toLowerCase().includes(q);
    }).length;

    reply.header("Cache-Control", "public, max-age=120");
    return { items: filtered, pagination: { offset, limit, total } };
  });

  fastify.get("/models/:slug", async (request, reply) => {
    const slug = normalizeModelSlug((request.params as { slug: string }).slug);
    if (!slug) {
      return reply.code(400).send({ error: "Invalid model slug", code: "VALIDATION_ERROR" });
    }

    const allVideos = await fastify.prisma.video.findMany({
      where: {
        status: "READY",
        visibility: "PUBLIC"
      },
      include: { user: { select: { username: true, displayName: true, avatarUrl: true, subscriberCount: true, isVerified: true, bio: true } } },
      orderBy: { publishedAt: "desc" },
      take: MODEL_BROWSE_SCAN_LIMIT
    });

    const modelVideos = allVideos.filter((video) => extractModelSlugs(video.tags).includes(slug));
    if (modelVideos.length === 0) {
      return reply.code(404).send({ error: "Model not found", code: "NOT_FOUND" });
    }

    const creatorIds = new Set(modelVideos.map((video) => video.userId));
    const totalViews = modelVideos.reduce((sum, video) => sum + video.viewCount, 0);
    const metadata = modelVideos
      .map((video) => extractModelMetadata(video.tags, video.user?.bio || null))
      .find((entry) => entry.age != null || entry.bodyMeasurements || entry.height || entry.profileBio) || {
      age: null,
      bodyMeasurements: null,
      height: null,
      profileBio: null
    };

    const primaryCreator = modelVideos
      .map((video) => video.user)
      .find((user): user is NonNullable<typeof user> => Boolean(user));

    return {
      model: {
        slug,
        name: titleCaseFromSlug(slug),
        videoCount: modelVideos.length,
        creatorCount: creatorIds.size,
        totalViews,
        thumbnailUrl: modelVideos.find((video) => video.thumbnailUrl)?.thumbnailUrl || null,
        primaryAccountUsername: primaryCreator?.username || null,
        age: metadata.age,
        bodyMeasurements: metadata.bodyMeasurements,
        height: metadata.height,
        profileBio: metadata.profileBio
      },
      items: modelVideos
    };
  });

  fastify.post("/:id/view", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const video = await fastify.prisma.video.findUnique({
      where: { id },
      select: { id: true, visibility: true, userId: true }
    });

    if (!video || video.visibility !== "PUBLIC") {
      return reply.code(404).send({ error: "Video not found", code: "NOT_FOUND" });
    }

    const ipAddress = request.ip || "unknown";
    const userAgent = String(request.headers["user-agent"] || "na");
    const dedupeHash = createHash("sha1").update(`${id}:${ipAddress}:${userAgent}`).digest("hex");
    const dedupeKey = `viewdedupe:${id}:${dedupeHash}`;
    const dedupe = await fastify.redis.set(dedupeKey, "1", "EX", 30 * 60, "NX");

    if (!dedupe) {
      return { counted: false };
    }

    await fastify.prisma.video.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    await fastify.prisma.user.update({ where: { id: video.userId }, data: { totalViews: { increment: 1 } } }).catch(() => undefined);
    return { counted: true };
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

    const inputModelNames = parsed.data.modelNames;
    const fallbackModelName = (dbUser.displayName || "").trim();
    const effectiveModelNames = inputModelNames.length > 0
      ? inputModelNames
      : (fallbackModelName ? [fallbackModelName] : []);

    const modelTags = Array.from(
      new Set(effectiveModelNames.map((name) => normalizeModelSlug(name)).filter(Boolean).map((slug) => toModelTag(slug)))
    );
    if (modelTags.length === 0) {
      return reply.code(400).send({ error: "Please add at least one model tag", code: "MODEL_REQUIRED" });
    }

    const channelTag = `__CHANNEL__:${creatorChannelId}`;
    const tags = [channelTag, ...modelTags].slice(0, 30);

    const video = await fastify.prisma.video.create({
      data: {
        title: parsed.data.title,
        rawFileKey: "pending",
        status: "UPLOADING",
        category: parsed.data.category,
        tags,
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

    const userUploadExt = (videoUpload.filename.split(".").pop() || "mp4").toLowerCase();
    if (!USER_UPLOAD_EXTENSIONS.has(userUploadExt)) {
      return reply.code(400).send({ error: "Only MP4 uploads are allowed", code: "INVALID_UPLOAD_FORMAT" });
    }

    if (videoUpload.buffer.length > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: "Video exceeds 100MB upload limit", code: "FILE_TOO_LARGE" });
    }

    const title = String(fields.title || videoUpload.filename).trim();
    const categoryRaw = String(fields.category || "ENTERTAINMENT").toUpperCase();
    const visibilityRaw = String(fields.visibility || "PUBLIC").toUpperCase();
    const description = String(fields.description || "").trim() || undefined;
    const tagsRaw = String(fields.tags || "");
    const modelNamesRaw = String(fields.modelNames || "");
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
        .filter((tag) => !tag.startsWith(MODEL_TAG_PREFIX))
        .filter((tag) => !tag.startsWith("__UPLOAD_SESSION__:"))
        .filter(Boolean)
        .slice(0, 30);

      const parsedModelTags = Array.from(
        new Set(
          modelNamesRaw
            .split(",")
            .map((name) => normalizeModelSlug(name))
            .filter(Boolean)
            .map((slug) => toModelTag(slug))
        )
      );

      if (parsedModelTags.length === 0) {
        const fallbackModelSlug = normalizeModelSlug(dbUser.displayName || "");
        if (fallbackModelSlug) {
          parsedModelTags.push(toModelTag(fallbackModelSlug));
        }
      }

      if (parsedModelTags.length === 0) {
        return reply.code(400).send({ error: "Please add at least one model tag", code: "MODEL_REQUIRED" });
      }

      const channelTag = creatorChannelId ? `__CHANNEL__:${creatorChannelId}` : "";
      const baseTags = [...parsedModelTags, ...parsedTags].slice(0, 30);
      const tagsWithChannel = channelTag && !baseTags.includes(channelTag) ? [channelTag, ...baseTags] : baseTags;
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
      const videoKey = `mp4/${video.id}/original.${ext}`;
      const b2VideoUploaded = await uploadObjectToB2(videoKey, buffer, videoUpload.mimetype || `video/${ext}`, 300000); // 5 mins timeout
      storedRawFileKey = b2VideoUploaded.key;
      playbackUrl = b2VideoUploaded.publicUrl;
      fastify.log.info({ playbackUrl }, "Video saved to B2");

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

          const thumbUploaded = await uploadObjectToB2(thumbKey, thumbBuffer, thumbMime, 15000);
          thumbnailUrl = thumbUploaded.publicUrl;
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

            const uploaded = await uploadObjectToB2(thumbKey, generatedThumbBuffer, "image/webp", 15000);
            thumbnailUrl = uploaded.publicUrl;
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

    const url = await createDownloadUrl(video.rawFileKey, 1800);
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

    if (await hasLocalObject(video.rawFileKey)) {
      const ext = extFromKey(video.rawFileKey);
      if (!PLAYABLE_EXTENSIONS.has(ext)) {
        return reply.code(415).send({ error: "Video format is not playable", code: "UNSUPPORTED_MEDIA" });
      }

      reply.header("Content-Type", mimeTypeFromExt(ext));
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(createReadStream(resolveLocalObjectPath(video.rawFileKey)));
    }

    const signedSourceUrl = await createDownloadUrl(video.rawFileKey, 900);
    return reply.redirect(signedSourceUrl);
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
        status: "READY",
        publishedAt: new Date()
      }
    });

    return { queued: false, message: "Upload is complete and available without encoding." };
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

    if (parsed.data.tags && !hasModelTags(parsed.data.tags)) {
      return reply.code(400).send({ error: "At least one model tag is required", code: "MODEL_REQUIRED" });
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
