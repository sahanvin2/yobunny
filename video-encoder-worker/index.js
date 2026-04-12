import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import chokidar from "chokidar";
import fs from "fs-extra";
import { config, allowedExtensions } from "./config.js";
import { QueueManager } from "./queueManager.js";
import { encodeToHls } from "./ffmpeg.js";
import { createB2Client, uploadDirectory, uploadFile } from "./b2.js";
import { createVideoWithQualities, resolveUploaderUserId, shutdownDb } from "./db.js";

const queue = new QueueManager(config.queueFile);
const env = {
  B2_ENDPOINT: process.env.B2_ENDPOINT,
  B2_ACCESS_KEY_ID: process.env.B2_ACCESS_KEY_ID,
  B2_SECRET_ACCESS_KEY: process.env.B2_SECRET_ACCESS_KEY,
  B2_BUCKET: process.env.B2_BUCKET,
  B2_REGION: process.env.B2_REGION,
  B2_PUBLIC_BASE: process.env.B2_PUBLIC_BASE
};

const requiredEnv = Object.entries(env).filter(([, value]) => !value).map(([key]) => key);
if (requiredEnv.length > 0) {
  console.error(`Missing required env vars: ${requiredEnv.join(", ")}`);
  process.exit(1);
}

const b2Client = createB2Client(env);
let uploaderUserId = "";
let busy = false;

function isVideoFile(filePath) {
  return allowedExtensions.has(path.extname(filePath).toLowerCase());
}

function getVideoTitle(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[._-]+/g, " ").trim();
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDirs() {
  await Promise.all([
    fs.ensureDir(config.inputDir),
    fs.ensureDir(config.processingDir),
    fs.ensureDir(config.outputDir),
    fs.ensureDir(config.completedDir),
    fs.ensureDir(config.failedDir),
    fs.ensureDir(config.logsDir)
  ]);
}

function logLine(stream, message) {
  const line = `[${nowIso()}] ${message}\n`;
  stream.write(line);
  process.stdout.write(line);
}

async function moveWithUniqueName(sourcePath, targetDir) {
  const parsed = path.parse(sourcePath);
  let targetPath = path.join(targetDir, `${parsed.name}${parsed.ext}`);

  if (await fs.pathExists(targetPath)) {
    targetPath = path.join(targetDir, `${parsed.name}-${Date.now()}${parsed.ext}`);
  }

  await fs.move(sourcePath, targetPath, { overwrite: false });
  return targetPath;
}

async function bootstrapInputFiles() {
  const entries = await fs.readdir(config.inputDir);
  for (const name of entries) {
    const full = path.join(config.inputDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    if (!isVideoFile(full)) continue;
    await queue.enqueue(full);
  }
}

async function processOneJob(job) {
  const fileStem = path.basename(job.currentPath, path.extname(job.currentPath));
  const logPath = path.join(config.logsDir, `${fileStem}-${job.id.slice(0, 8)}.log`);
  await fs.ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const started = Date.now();
  logLine(logStream, `JOB START | id=${job.id} | attempt=${job.attempts}`);

  let workingPath = job.currentPath;
  const inInputDir = path.dirname(workingPath).toLowerCase() === path.resolve(config.inputDir).toLowerCase();
  if (inInputDir) {
    workingPath = await moveWithUniqueName(workingPath, config.processingDir);
    await queue.updatePaths(job.id, workingPath);
  }

  const outputJobRoot = path.join(config.outputDir, job.id);
  await fs.remove(outputJobRoot);
  await fs.ensureDir(outputJobRoot);

  try {
    const encoderResult = await encodeToHls({
      inputPath: workingPath,
      outputRoot: outputJobRoot,
      ffmpegPath: config.ffmpegPath,
      ffprobePath: config.ffprobePath,
      log: (chunk) => logLine(logStream, chunk.trimEnd())
    });

    const videoId = crypto.randomUUID().replace(/-/g, "");
    const ext = path.extname(workingPath).toLowerCase() || ".mp4";

    const rawKey = `raw/${uploaderUserId}/${videoId}/original${ext}`;
    await uploadFile(b2Client, env, workingPath, rawKey);

    const hlsPrefix = `hls/${videoId}`;
    const uploadedFiles = await uploadDirectory(b2Client, env, outputJobRoot, hlsPrefix);

    const master = uploadedFiles.find((item) => item.rel.replace(/\\/g, "/") === "master.m3u8");
    if (!master) {
      throw new Error("master.m3u8 was not generated/uploaded");
    }

    const thumbnailFile = uploadedFiles.find((item) => item.rel === "thumb.webp");
    const thumbnailUrl = thumbnailFile ? thumbnailFile.publicUrl : "";

    const qualityRows = encoderResult.variants.map((variant) => {
      const rel = `${variant.label}/index.m3u8`;
      const file = uploadedFiles.find((item) => item.rel === rel);
      return {
        resolution: variant.label,
        hlsUrl: file?.publicUrl || `${env.B2_PUBLIC_BASE.replace(/\/$/, "")}/${hlsPrefix}/${rel}`,
        fileKey: file?.key || `${hlsPrefix}/${rel}`,
        fileSize: file?.size || 0,
        bitrate: Math.round(variant.bitrate / 1000)
      };
    });

    await createVideoWithQualities({
      title: getVideoTitle(workingPath),
      userId: uploaderUserId,
      rawFileKey: rawKey,
      hlsBaseUrl: master.publicUrl,
      thumbnailUrl,
      duration: encoderResult.duration,
      category: config.defaultCategory,
      visibility: config.defaultVisibility,
      qualities: qualityRows
    });

    const completedPath = await moveWithUniqueName(workingPath, config.completedDir);
    await queue.updatePaths(job.id, completedPath);
    await queue.complete(job.id);

    const elapsed = Math.round((Date.now() - started) / 1000);
    logLine(logStream, `JOB DONE | id=${job.id} | durationSec=${elapsed}`);
  } catch (error) {
    const fail = await queue.fail(job.id, String(error), config.retryLimit);

    if (fail.final) {
      const failedPath = await moveWithUniqueName(workingPath, config.failedDir).catch(() => workingPath);
      await queue.updatePaths(job.id, failedPath);
      logLine(logStream, `JOB FAILED FINAL | id=${job.id} | error=${String(error)}`);
    } else {
      logLine(logStream, `JOB FAILED RETRYING | id=${job.id} | error=${String(error)}`);
    }
  } finally {
    logStream.end();
    await fs.remove(outputJobRoot).catch(() => undefined);
  }
}

async function workLoop() {
  if (busy) return;
  busy = true;

  try {
    while (true) {
      const next = await queue.nextPending();
      if (!next) break;
      await processOneJob(next);
      await new Promise((resolve) => setTimeout(resolve, config.delayBetweenJobsMs));
    }
  } finally {
    busy = false;
  }
}

async function startWatcher() {
  const watcher = chokidar.watch(config.inputDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 500
    }
  });

  watcher.on("add", async (filePath) => {
    if (!isVideoFile(filePath)) return;
    await queue.enqueue(filePath);
    await workLoop();
  });

  watcher.on("error", (err) => {
    console.error("Watcher error:", err);
  });
}

async function main() {
  await ensureDirs();
  await queue.init();
  uploaderUserId = await resolveUploaderUserId(config.uploaderUserId);

  console.log(`[worker] uploaderUserId=${uploaderUserId}`);
  console.log(`[worker] inputDir=${config.inputDir}`);

  await bootstrapInputFiles();
  await startWatcher();
  await workLoop();

  process.on("SIGINT", async () => {
    await shutdownDb();
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error("Worker failed to start", err);
  await shutdownDb().catch(() => undefined);
  process.exit(1);
});
