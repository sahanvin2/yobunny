import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const UPLOAD_URL = `${API_BASE}/api/videos/upload-file`;
const SEARCH_URL = `${API_BASE}/api/videos/search`;
const AUTH_ME_URL = `${API_BASE}/api/auth/me`;
const MY_VIDEOS_URL = `${API_BASE}/api/users/me/videos`;
const AUTH_UID = process.env.AUTH_UID ?? "dev-user-1";
const CHANNEL_ID = process.env.CHANNEL_ID ?? "";
const ASSETS_DIR = process.argv[2] ?? "..\\assets";
const CHECKPOINT_PATH = path.resolve(process.env.CHECKPOINT_PATH ?? ".upload-checkpoint.json");
const LOCK_PATH = path.resolve(".upload-running.lock");
const START_INDEX = Number.parseInt(process.env.START_INDEX ?? "1", 10) || 1;
const MAX_RETRIES = Number.parseInt(process.env.MAX_RETRIES ?? "3", 10) || 3;
const MAX_FILE_BYTES = Number.parseInt(process.env.MAX_FILE_BYTES ?? `${2 * 1024 * 1024 * 1024}`, 10);
const FORCE_UPLOAD = ["1", "true", "yes"].includes(String(process.env.FORCE_UPLOAD ?? "").toLowerCase());
const ACCOUNT_TITLE_DEDUPE = !["0", "false", "no"].includes(String(process.env.ACCOUNT_TITLE_DEDUPE ?? "true").toLowerCase());
const RETRY_SKIPPED = ["1", "true", "yes"].includes(String(process.env.RETRY_SKIPPED ?? "false").toLowerCase());
const ALLOW_DUPLICATE_TITLES = ["1", "true", "yes"].includes(String(process.env.ALLOW_DUPLICATE_TITLES ?? "false").toLowerCase());
const UPLOAD_CONCURRENCY = Math.min(Math.max(Number.parseInt(process.env.UPLOAD_CONCURRENCY ?? "4", 10) || 4, 1), 16);
const REMOTE_TITLE_CHECK = ["1", "true", "yes"].includes(String(process.env.REMOTE_TITLE_CHECK ?? "false").toLowerCase());
const SIGNATURE_MODE = String(process.env.SIGNATURE_MODE ?? "quick").toLowerCase() === "sha1" ? "sha1" : "quick";
const SKIP_AUTO_THUMBNAIL = ["1", "true", "yes"].includes(String(process.env.SKIP_AUTO_THUMBNAIL ?? "true").toLowerCase());
const SKIP_DURATION_PROBE = ["1", "true", "yes"].includes(String(process.env.SKIP_DURATION_PROBE ?? "true").toLowerCase());
const UPLOAD_TIMEOUT_MS = Math.min(Math.max(Number.parseInt(process.env.UPLOAD_TIMEOUT_MS ?? "600000", 10) || 600000, 30000), 3600000);
const RETRY_BASE_DELAY_MS = Math.min(Math.max(Number.parseInt(process.env.RETRY_BASE_DELAY_MS ?? "1500", 10) || 1500, 500), 10000);
const LOG_CHECKPOINT_SKIPS = ["1", "true", "yes"].includes(String(process.env.LOG_CHECKPOINT_SKIPS ?? "false").toLowerCase());
const LOG_DUPLICATE_SKIPS = ["1", "true", "yes"].includes(String(process.env.LOG_DUPLICATE_SKIPS ?? "false").toLowerCase());
const CHECKPOINT_FLUSH_EVERY = Math.min(Math.max(Number.parseInt(process.env.CHECKPOINT_FLUSH_EVERY ?? "12", 10) || 12, 1), 200);
const CLEAN_RESERVED_ON_START = !["0", "false", "no"].includes(String(process.env.CLEAN_RESERVED_ON_START ?? "true").toLowerCase());
const RESERVED_MAX_AGE_MINUTES = Math.min(Math.max(Number.parseInt(process.env.RESERVED_MAX_AGE_MINUTES ?? "30", 10) || 30, 1), 1440);
const PROGRESS_LOG_INTERVAL_MS = Math.min(Math.max(Number.parseInt(process.env.PROGRESS_LOG_INTERVAL_MS ?? "60000", 10) || 60000, 10000), 600000);
const MODEL_NAMES_RAW = String(process.env.MODEL_NAMES ?? "").trim();

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const TAG_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "you",
  "are",
  "was",
  "have",
  "has",
  "just",
  "full",
  "part",
  "episode",
  "official",
  "video"
]);

function toCleanTitle(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");

  // Remove a leading source tag like: [SiteName] Title
  let title = withoutExt.replace(/^\[[^\]]+\]\s*/i, "");

  // Fallback: remove leading prefix like SITE.COM -
  title = title.replace(/^[A-Z0-9.-]+\s*-\s*/i, "");

  // Remove trailing quality marker like (720), (1080p), [720p]
  title = title.replace(/\s*[\[(]\s*\d{3,4}\s*p?\s*[\])]\s*$/i, "");

  // Normalize separators
  title = title
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || "Untitled Video";
}

function toDescription(title) {
  return [
    title,
    "",
    `${title} is now available in high quality on YoBunny.`,
    "Watch now, share with your friends, and follow for more drops.",
    "",
    "#YoBunny #Entertainment #Video"
  ].join("\n");
}

function toTags(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !TAG_STOP_WORDS.has(word))
    .slice(0, 8);

  return Array.from(new Set(["featured", "entertainment", "trending", ...words])).slice(0, 10);
}

function resolveThumbnailPath(videoPath) {
  const candidates = [
    `${videoPath}_thumb.jpg`,
    `${videoPath}_thumb.jpeg`,
    `${videoPath}_thumb.png`,
    `${videoPath}_thumb.webp`
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildUploadSessionId(signature, filePath) {
  const pathSig = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12);
  return `bulk-${signature.slice(0, 16)}-${pathSig}`;
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

async function fileSha1(filePath) {
  const hash = crypto.createHash("sha1");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function buildFileSignature(filePath, stat) {
  if (SIGNATURE_MODE === "sha1") {
    return fileSha1(filePath);
  }

  return crypto
    .createHash("sha1")
    .update(`${stat.size}|${Math.trunc(stat.mtimeMs)}|${path.basename(filePath).toLowerCase()}`)
    .digest("hex");
}

async function createFileBlob(filePath, type) {
  if (typeof fs.openAsBlob === "function") {
    return fs.openAsBlob(filePath, { type });
  }

  const buffer = await fs.promises.readFile(filePath);
  return new Blob([buffer], { type });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs = 300000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return { uploaded: {}, uploadedSignatures: {}, uploadedTitles: {} };
  }

  try {
    const raw = await fs.promises.readFile(CHECKPOINT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const uploaded = parsed?.uploaded && typeof parsed.uploaded === "object" ? parsed.uploaded : {};
    const uploadedTitles = parsed?.uploadedTitles && typeof parsed.uploadedTitles === "object" ? parsed.uploadedTitles : {};

    // Backfill title index from legacy checkpoint format.
    if (Object.keys(uploadedTitles).length === 0) {
      for (const value of Object.values(uploaded)) {
        const title = value && typeof value === "object" ? value.title : "";
        const normalized = normalizeTitle(title);
        if (!normalized) continue;
        uploadedTitles[normalized] = {
          id: value?.id,
          title,
          skipped: Boolean(value?.skipped),
          at: value?.at || new Date().toISOString()
        };
      }
    }

    return {
      uploaded,
      uploadedSignatures: parsed?.uploadedSignatures && typeof parsed.uploadedSignatures === "object" ? parsed.uploadedSignatures : {},
      uploadedTitles
    };
  } catch {
    return { uploaded: {}, uploadedSignatures: {}, uploadedTitles: {} };
  }
}

async function saveCheckpoint(checkpoint) {
  checkpoint.__pendingWrites = (checkpoint.__pendingWrites || 0) + 1;
  if (checkpoint.__pendingWrites < CHECKPOINT_FLUSH_EVERY) {
    return;
  }

  checkpoint.__pendingWrites = 0;
  await fs.promises.writeFile(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

async function flushCheckpoint(checkpoint) {
  checkpoint.__pendingWrites = 0;
  await fs.promises.writeFile(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

function checkpointStatusCounts(checkpoint) {
  const counts = {};
  const uploaded = checkpoint?.uploaded && typeof checkpoint.uploaded === "object" ? checkpoint.uploaded : {};
  for (const value of Object.values(uploaded)) {
    const status = value && typeof value === "object" ? String(value.status || "UNKNOWN") : "UNKNOWN";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function cleanupStaleReservedEntries(checkpoint) {
  if (!CLEAN_RESERVED_ON_START) {
    return 0;
  }

  const uploaded = checkpoint?.uploaded && typeof checkpoint.uploaded === "object" ? checkpoint.uploaded : {};
  const now = Date.now();
  const maxAgeMs = RESERVED_MAX_AGE_MINUTES * 60 * 1000;
  let removed = 0;

  for (const [filePath, entry] of Object.entries(uploaded)) {
    if (!entry || entry.status !== "RESERVED") {
      continue;
    }

    const atMs = Date.parse(String(entry.at || ""));
    const isStale = Number.isNaN(atMs) || (now - atMs) > maxAgeMs;
    if (!isStale) {
      continue;
    }

    delete checkpoint.uploaded[filePath];
    if (entry.signature) {
      delete checkpoint.uploadedSignatures[entry.signature];
    }

    const normalizedTitle = normalizeTitle(entry.title);
    if (normalizedTitle) {
      delete checkpoint.uploadedTitles[normalizedTitle];
    }

    removed += 1;
  }

  return removed;
}

async function reserveFile(checkpoint, filePath, title, signature, normalizedTitle) {
  const now = new Date().toISOString();
  checkpoint.uploaded[filePath] = {
    status: "RESERVED",
    title,
    signature,
    at: now
  };
  checkpoint.uploadedSignatures[signature] = {
    status: "RESERVED",
    title,
    at: now
  };
  if (normalizedTitle && !ALLOW_DUPLICATE_TITLES) {
    checkpoint.uploadedTitles[normalizedTitle] = {
      status: "RESERVED",
      title,
      at: now
    };
  }
  await saveCheckpoint(checkpoint);
}

async function existsByTitle(title) {
  try {
    const response = await fetchWithTimeout(`${SEARCH_URL}?q=${encodeURIComponent(title)}`, {
      method: "GET"
    }, 30000);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const wanted = normalizeTitle(title);
    return items.some((item) => normalizeTitle(item?.title) === wanted);
  } catch {
    return false;
  }
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function loadExistingMyTitleSet() {
  const set = new Set();
  try {
    const response = await fetchWithTimeout(MY_VIDEOS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AUTH_UID}`
      }
    }, 60000);

    if (!response.ok) {
      return set;
    }

    const payload = await response.json().catch(() => ({ items: [] }));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      // Do not let failed/incomplete uploads block legitimate retries.
      if (typeof item?.status === "string" && item.status !== "READY") {
        continue;
      }

      const normalized = normalizeTitle(item?.title);
      if (normalized) {
        set.add(normalized);
      }
    }
  } catch {
    // Network hiccups should not crash the entire batch run.
    return set;
  }

  return set;
}

async function resolveCreatorChannelId() {
  if (CHANNEL_ID.trim()) {
    return CHANNEL_ID.trim();
  }

  const response = await fetchWithTimeout(AUTH_ME_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${AUTH_UID}`
    }
  }, 30000);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to resolve current user (${response.status}): ${text}`);
  }

  const payload = await response.json();
  const userId = payload?.user?.id;
  if (!userId) {
    throw new Error("Failed to resolve current user id for creator channel");
  }

  return `primary-${userId}`;
}

async function collectVideoFiles(dir) {
  const out = [];

  async function walk(current) {
    const items = await fs.promises.readdir(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (item.isFile() && VIDEO_EXTENSIONS.has(path.extname(item.name).toLowerCase())) {
        out.push(fullPath);
      }
    }
  }

  await walk(dir);
  return out.sort((a, b) => a.localeCompare(b));
}

function deriveModelNames(assetsDir) {
  if (MODEL_NAMES_RAW) {
    return MODEL_NAMES_RAW
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  const fallback = path.basename(path.resolve(assetsDir)).replace(/[_-]+/g, " ").trim();
  return fallback ? [fallback] : [];
}

async function uploadOne(filePath, index, total, creatorChannelId, signature, modelNames) {
  const fileName = path.basename(filePath);
  const title = toCleanTitle(fileName);
  const description = toDescription(title);
  const tags = toTags(title);
  const thumbnailPath = resolveThumbnailPath(filePath);
  const uploadSessionId = buildUploadSessionId(signature, filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mime = ext === ".webm" ? "video/webm" : "video/mp4";

  const form = new FormData();
  const fileBlob = await createFileBlob(filePath, mime);
  form.append("file", fileBlob, fileName);

  if (thumbnailPath) {
    const thumbnailName = path.basename(thumbnailPath);
    const thumbExt = path.extname(thumbnailName).toLowerCase();
    const thumbnailMime =
      thumbExt === ".png"
        ? "image/png"
        : thumbExt === ".webp"
          ? "image/webp"
          : "image/jpeg";
    const thumbnailBlob = await createFileBlob(thumbnailPath, thumbnailMime);
    form.append("thumbnail", thumbnailBlob, thumbnailName);
  }

  form.append("title", title);
  form.append("category", "ENTERTAINMENT");
  form.append("visibility", "PUBLIC");
  form.append("description", description);
  form.append("tags", tags.join(","));
  form.append("modelNames", modelNames.join(","));
  form.append("creatorChannelId", creatorChannelId);
  if (uploadSessionId) {
    form.append("uploadSessionId", uploadSessionId);
  }
  if (SKIP_AUTO_THUMBNAIL) {
    form.append("skipAutoThumbnail", "1");
  }
  if (SKIP_DURATION_PROBE) {
    form.append("skipDurationProbe", "1");
  }

  const response = await fetchWithTimeout(
    UPLOAD_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_UID}`,
        ...(uploadSessionId ? { "X-Upload-Session-Id": uploadSessionId } : {})
      },
      body: form
    },
    UPLOAD_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[${index}/${total}] ${fileName} failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const videoId = data?.item?.id ?? "unknown";
  const thumbStatus = thumbnailPath ? ` + thumb (${path.basename(thumbnailPath)})` : " + auto-thumb";
  console.log(`[${index}/${total}] Uploaded: ${fileName} -> ${title} (id: ${videoId})${thumbStatus}`);
  return { fileName, title, videoId };
}

async function main() {
  if (fs.existsSync(LOCK_PATH)) {
    const lockData = await fs.promises.readFile(LOCK_PATH, "utf8").catch(() => "");
    const lock = JSON.parse(lockData || "{}");
    const lockedPid = Number(lock?.pid || 0);
    const isStillAlive = lockedPid > 0 && GetProcessAlive(lockedPid);
    if (isStillAlive) {
      console.error(`Upload is already running (pid ${lockedPid}): ${LOCK_PATH}`);
      return 3;
    }

    await fs.promises.unlink(LOCK_PATH).catch(() => undefined);
  }

  await fs.promises.writeFile(LOCK_PATH, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");

  try {
  const absoluteAssetsDir = path.resolve(ASSETS_DIR);
  if (!fs.existsSync(absoluteAssetsDir)) {
    console.error(`Assets folder not found: ${absoluteAssetsDir}`);
    return 1;
  }

  const files = await collectVideoFiles(absoluteAssetsDir);
  if (files.length === 0) {
    console.log(`No video files found in: ${absoluteAssetsDir}`);
    return 0;
  }

  console.log(`Found ${files.length} video files in: ${absoluteAssetsDir}`);
  console.log(`Uploading to: ${UPLOAD_URL}`);
  console.log(`Checkpoint: ${CHECKPOINT_PATH}`);
  console.log(`Force upload: ${FORCE_UPLOAD ? "enabled" : "disabled"}`);
  console.log(`Account title dedupe: ${ACCOUNT_TITLE_DEDUPE ? "enabled" : "disabled"}`);
  console.log(`Allow duplicate titles: ${ALLOW_DUPLICATE_TITLES ? "enabled" : "disabled"}`);
  console.log(`Retry skipped checkpoint entries: ${RETRY_SKIPPED ? "enabled" : "disabled"}`);
  console.log(`Upload concurrency: ${UPLOAD_CONCURRENCY}`);
  console.log(`Signature mode: ${SIGNATURE_MODE}`);
  console.log(`Remote title check: ${REMOTE_TITLE_CHECK ? "enabled" : "disabled"}`);
  console.log(`Skip auto thumbnail: ${SKIP_AUTO_THUMBNAIL ? "enabled" : "disabled"}`);
  console.log(`Skip duration probe: ${SKIP_DURATION_PROBE ? "enabled" : "disabled"}`);
  console.log(`Upload timeout (ms): ${UPLOAD_TIMEOUT_MS}`);
  console.log(`Log checkpoint skips: ${LOG_CHECKPOINT_SKIPS ? "enabled" : "disabled"}`);
  console.log(`Log duplicate skips: ${LOG_DUPLICATE_SKIPS ? "enabled" : "disabled"}`);
  console.log(`Checkpoint flush every: ${CHECKPOINT_FLUSH_EVERY}`);
  console.log(`Clean stale reserved on start: ${CLEAN_RESERVED_ON_START ? "enabled" : "disabled"}`);
  console.log(`Reserved max age (minutes): ${RESERVED_MAX_AGE_MINUTES}`);
  console.log(`Progress log interval (ms): ${PROGRESS_LOG_INTERVAL_MS}`);

  const modelNames = deriveModelNames(absoluteAssetsDir);
  if (modelNames.length === 0) {
    console.error("MODEL_NAMES is required or source folder name must be usable as model name.");
    return 1;
  }
  console.log(`Model tags: ${modelNames.join(", ")}`);

  const creatorChannelId = await resolveCreatorChannelId();
  console.log(`Creator channel: ${creatorChannelId}`);

  const checkpoint = await loadCheckpoint();
  const removedReserved = cleanupStaleReservedEntries(checkpoint);
  if (removedReserved > 0) {
    await flushCheckpoint(checkpoint);
    console.log(`Cleaned stale reserved entries: ${removedReserved}`);
  }

  const startupCounts = checkpointStatusCounts(checkpoint);
  console.log(`Checkpoint status snapshot: ${JSON.stringify(startupCounts)}`);

  const existingMyTitles = !ACCOUNT_TITLE_DEDUPE || ALLOW_DUPLICATE_TITLES ? new Set() : await loadExistingMyTitleSet();
  const seenSignatures = new Set(Object.keys(checkpoint.uploadedSignatures || {}));
  const seenTitles = new Set([
    ...Object.keys(checkpoint.uploadedTitles || {}),
    ...existingMyTitles
  ]);
  const success = [];
  const failed = [];
  let checkpointSkipped = 0;
  let cursor = START_INDEX - 1;
  const progressTimer = setInterval(() => {
    console.log(`[progress] scanned=${Math.min(cursor, files.length)}/${files.length} succeeded=${success.length} failed=${failed.length} checkpointSkipped=${checkpointSkipped}`);
  }, PROGRESS_LOG_INTERVAL_MS);

  // Serialize mutable state updates (checkpoint + in-memory dedupe sets)
  let stateQueue = Promise.resolve();
  const withStateLock = (fn) => {
    const run = stateQueue.then(fn, fn);
    stateQueue = run.catch(() => undefined);
    return run;
  };

  const getNextWorkItem = async () => withStateLock(async () => {
    while (cursor < files.length) {
      const i = cursor;
      cursor += 1;
      const filePath = files[i];
      const index = i + 1;

      const checkpointEntry = checkpoint.uploaded[filePath];
      if (checkpointEntry && checkpointEntry.status !== "RESERVED") {
        if (RETRY_SKIPPED && checkpointEntry.status === "SKIPPED") {
          delete checkpoint.uploaded[filePath];
          if (checkpointEntry.signature) {
            delete checkpoint.uploadedSignatures[checkpointEntry.signature];
          }
          const normalizedTitle = normalizeTitle(checkpointEntry.title);
          if (normalizedTitle) {
            delete checkpoint.uploadedTitles[normalizedTitle];
          }
          await saveCheckpoint(checkpoint);
          return { filePath, index };
        }

        checkpointSkipped += 1;
        if (LOG_CHECKPOINT_SKIPS) {
          console.log(`[${index}/${files.length}] Skipped (checkpoint): ${path.basename(filePath)}`);
        }
        continue;
      }

      if (checkpointEntry?.status === "RESERVED") {
        // Retry previously reserved items from interrupted/failed runs.
        delete checkpoint.uploaded[filePath];
        if (checkpointEntry.signature) {
          delete checkpoint.uploadedSignatures[checkpointEntry.signature];
        }
        const normalizedTitle = normalizeTitle(checkpointEntry.title);
        if (normalizedTitle) {
          delete checkpoint.uploadedTitles[normalizedTitle];
        }
        await saveCheckpoint(checkpoint);
      }

      return { filePath, index };
    }

    return null;
  });

  const processOne = async ({ filePath, index }) => {
    try {
      const fileName = path.basename(filePath);
      const title = toCleanTitle(fileName);
      const stat = await fs.promises.stat(filePath);

      if (stat.size > MAX_FILE_BYTES) {
        await withStateLock(async () => {
          checkpoint.uploaded[filePath] = {
            status: "SKIPPED",
            skipped: true,
            title,
            reason: "too_large",
            sizeBytes: stat.size,
            at: new Date().toISOString()
          };
          await saveCheckpoint(checkpoint);
        });
        console.log(`[${index}/${files.length}] Skipped (too large): ${fileName} (${stat.size} bytes)`);
        return;
      }

      const normalizedTitle = normalizeTitle(title);
      const signature = await buildFileSignature(filePath, stat);

      const localDuplicate = await withStateLock(async () => {
        if (seenSignatures.has(signature)) {
          checkpoint.uploaded[filePath] = { status: "SKIPPED", skipped: true, title, signature, reason: "signature", at: new Date().toISOString() };
          await saveCheckpoint(checkpoint);
          return "signature";
        }

        if (!ALLOW_DUPLICATE_TITLES && normalizedTitle && seenTitles.has(normalizedTitle)) {
          checkpoint.uploaded[filePath] = { status: "SKIPPED", skipped: true, title, signature, reason: "title", at: new Date().toISOString() };
          checkpoint.uploadedSignatures[signature] = { status: "SKIPPED", skipped: true, title, at: new Date().toISOString() };
          await saveCheckpoint(checkpoint);
          return "title";
        }

        return "";
      });

      if (localDuplicate) {
        if (LOG_DUPLICATE_SKIPS) {
          if (localDuplicate === "signature") {
            console.log(`[${index}/${files.length}] Skipped (duplicate signature): ${fileName}`);
          } else {
            console.log(`[${index}/${files.length}] Skipped (duplicate title): ${fileName} -> ${title}`);
          }
        }
        return;
      }

      if (REMOTE_TITLE_CHECK && !ALLOW_DUPLICATE_TITLES) {
        const alreadyExists = await existsByTitle(title);
        if (alreadyExists) {
          await withStateLock(async () => {
            checkpoint.uploaded[filePath] = { status: "SKIPPED", skipped: true, title, signature, reason: "search", at: new Date().toISOString() };
            checkpoint.uploadedSignatures[signature] = { status: "SKIPPED", skipped: true, title, at: new Date().toISOString() };
            if (normalizedTitle) {
              checkpoint.uploadedTitles[normalizedTitle] = { status: "SKIPPED", skipped: true, title, at: new Date().toISOString() };
              seenTitles.add(normalizedTitle);
            }
            seenSignatures.add(signature);
            await saveCheckpoint(checkpoint);
          });
          if (LOG_DUPLICATE_SKIPS) {
            console.log(`[${index}/${files.length}] Skipped (already exists): ${fileName} -> ${title}`);
          }
          return;
        }
      }

      await withStateLock(async () => {
        await reserveFile(checkpoint, filePath, title, signature, normalizedTitle);
      });

      let uploaded;
      let attempt = 0;
      while (attempt < MAX_RETRIES) {
        attempt += 1;
        try {
          uploaded = await uploadOne(filePath, index, files.length, creatorChannelId, signature, modelNames);
          break;
        } catch (error) {
          if (attempt >= MAX_RETRIES) {
            throw error;
          }

          const waitMs = RETRY_BASE_DELAY_MS * attempt;
          console.log(`[${index}/${files.length}] Retry ${attempt}/${MAX_RETRIES - 1} in ${waitMs}ms: ${fileName}`);
          await sleep(waitMs);
        }
      }

      if (!uploaded) {
        throw new Error(`[${index}/${files.length}] ${fileName} failed after retries`);
      }

      await withStateLock(async () => {
        success.push(uploaded);
        checkpoint.uploaded[filePath] = { status: "UPLOADED", id: uploaded.videoId, title: uploaded.title, signature, at: new Date().toISOString() };
        checkpoint.uploadedSignatures[signature] = { status: "UPLOADED", id: uploaded.videoId, title: uploaded.title, at: new Date().toISOString() };
        if (normalizedTitle && !ALLOW_DUPLICATE_TITLES) {
          checkpoint.uploadedTitles[normalizedTitle] = { status: "UPLOADED", id: uploaded.videoId, title: uploaded.title, at: new Date().toISOString() };
          seenTitles.add(normalizedTitle);
        }
        seenSignatures.add(signature);
        await saveCheckpoint(checkpoint);
      });
    } catch (error) {
      const message = `[${index}/${files.length}] ${path.basename(filePath)} failed: ${toErrorMessage(error)}`;
      console.error(message);
      await withStateLock(async () => {
        failed.push({ filePath, message });
        await saveCheckpoint(checkpoint);
      });
    }
  };

  const workers = Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
    while (true) {
      const workItem = await getNextWorkItem();
      if (!workItem) {
        return;
      }

      await processOne(workItem);
    }
  });

  await Promise.all(workers);
  clearInterval(progressTimer);
  await flushCheckpoint(checkpoint);

  console.log("\n=== Upload Summary ===");
  console.log(`Total: ${files.length}`);
  console.log(`Skipped (checkpoint): ${checkpointSkipped}`);
  console.log(`Succeeded: ${success.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed files:");
    for (const f of failed) {
      console.log(`- ${f.filePath}`);
      console.log(`  ${f.message}`);
    }
    return 2;
  }

  return 0;
  } finally {
    // No-op if already cleared after normal completion.
    await fs.promises.unlink(LOCK_PATH).catch(() => undefined);
  }
}

function GetProcessAlive(pid) {
  try {
    const result = fs.existsSync(`/proc/${pid}`);
    if (result) return true;
  } catch {
    // ignore
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
