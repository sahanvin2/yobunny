import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
  inputDir: process.env.INPUT_DIR || "D:/tele 2",
  processingDir: process.env.PROCESSING_DIR || path.join(__dirname, "processing"),
  outputDir: process.env.OUTPUT_DIR || path.join(__dirname, "output_hls"),
  completedDir: process.env.COMPLETED_DIR || path.join(__dirname, "completed"),
  failedDir: process.env.FAILED_DIR || path.join(__dirname, "failed"),
  logsDir: process.env.LOGS_DIR || path.join(__dirname, "logs"),
  queueFile: process.env.QUEUE_FILE || path.join(__dirname, "queue", "jobs.json"),
  retryLimit: Number(process.env.RETRY_LIMIT || 2),
  delayBetweenJobsMs: Number(process.env.DELAY_BETWEEN_JOBS_MS || 3000),
  uploaderUserId: process.env.UPLOADER_USER_ID || "",
  defaultCategory: process.env.DEFAULT_CATEGORY || "ENTERTAINMENT",
  defaultVisibility: process.env.DEFAULT_VISIBILITY || "PUBLIC"
};

export const allowedExtensions = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".m4v"
]);
