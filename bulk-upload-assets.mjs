import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const UPLOAD_URL = `${API_BASE}/api/videos/upload-file`;
const SEARCH_URL = `${API_BASE}/api/videos/search`;
const AUTH_UID = process.env.AUTH_UID ?? "dev-user-1";
const ASSETS_DIR = process.argv[2] ?? "..\\assets";
const CHECKPOINT_PATH = path.resolve(".upload-checkpoint.json");
const START_INDEX = Number.parseInt(process.env.START_INDEX ?? "1", 10) || 1;
const MAX_RETRIES = Number.parseInt(process.env.MAX_RETRIES ?? "3", 10) || 3;

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

function toCleanTitle(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");

  // Remove leading source/id segments like: EPORNER.COM - [kQNFeI0C1gs]
  let title = withoutExt.replace(/^.*?\]\s*/i, "");

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
    return { uploaded: {} };
  }

  try {
    const raw = await fs.promises.readFile(CHECKPOINT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      uploaded: parsed?.uploaded && typeof parsed.uploaded === "object" ? parsed.uploaded : {}
    };
  } catch {
    return { uploaded: {} };
  }
}

async function saveCheckpoint(checkpoint) {
  await fs.promises.writeFile(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
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
    return items.some((item) => String(item?.title ?? "").trim().toLowerCase() === title.trim().toLowerCase());
  } catch {
    return false;
  }
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

async function uploadOne(filePath, index, total) {
  const fileName = path.basename(filePath);
  const title = toCleanTitle(fileName);
  const ext = path.extname(fileName).toLowerCase();
  const mime = ext === ".webm" ? "video/webm" : "video/mp4";

  const buffer = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), fileName);
  form.append("title", title);
  form.append("category", "ENTERTAINMENT");
  form.append("visibility", "PUBLIC");
  form.append("description", title);

  const response = await fetchWithTimeout(
    UPLOAD_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_UID}`
      },
      body: form
    },
    600000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[${index}/${total}] ${fileName} failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const videoId = data?.item?.id ?? "unknown";
  console.log(`[${index}/${total}] Uploaded: ${fileName} -> ${title} (id: ${videoId})`);
  return { fileName, title, videoId };
}

async function main() {
  const absoluteAssetsDir = path.resolve(ASSETS_DIR);
  if (!fs.existsSync(absoluteAssetsDir)) {
    console.error(`Assets folder not found: ${absoluteAssetsDir}`);
    process.exit(1);
  }

  const files = await collectVideoFiles(absoluteAssetsDir);
  if (files.length === 0) {
    console.log(`No video files found in: ${absoluteAssetsDir}`);
    return;
  }

  console.log(`Found ${files.length} video files in: ${absoluteAssetsDir}`);
  console.log(`Uploading to: ${UPLOAD_URL}`);
  console.log(`Checkpoint: ${CHECKPOINT_PATH}`);

  const checkpoint = await loadCheckpoint();
  const success = [];
  const failed = [];

  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i];
    const index = i + 1;
    if (index < START_INDEX) {
      continue;
    }

    if (checkpoint.uploaded[filePath]) {
      console.log(`[${index}/${files.length}] Skipped (checkpoint): ${path.basename(filePath)}`);
      continue;
    }

    try {
      const fileName = path.basename(filePath);
      const title = toCleanTitle(fileName);

      const alreadyExists = await existsByTitle(title);
      if (alreadyExists) {
        checkpoint.uploaded[filePath] = { skipped: true, title, at: new Date().toISOString() };
        await saveCheckpoint(checkpoint);
        console.log(`[${index}/${files.length}] Skipped (already exists): ${fileName} -> ${title}`);
        continue;
      }

      let uploaded;
      let attempt = 0;
      while (attempt < MAX_RETRIES) {
        attempt += 1;
        try {
          uploaded = await uploadOne(filePath, index, files.length);
          break;
        } catch (error) {
          if (attempt >= MAX_RETRIES) {
            throw error;
          }

          const waitMs = 3000 * attempt;
          console.log(`[${index}/${files.length}] Retry ${attempt}/${MAX_RETRIES - 1} in ${waitMs}ms: ${fileName}`);
          await sleep(waitMs);
        }
      }

      if (!uploaded) {
        throw new Error(`[${index}/${files.length}] ${fileName} failed after retries`);
      }

      success.push(uploaded);
      checkpoint.uploaded[filePath] = { id: uploaded.videoId, title: uploaded.title, at: new Date().toISOString() };
      await saveCheckpoint(checkpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      failed.push({ filePath, message });
      await saveCheckpoint(checkpoint);
    }
  }

  console.log("\n=== Upload Summary ===");
  console.log(`Total: ${files.length}`);
  console.log(`Succeeded: ${success.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed files:");
    for (const f of failed) {
      console.log(`- ${f.filePath}`);
      console.log(`  ${f.message}`);
    }
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
