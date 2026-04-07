import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../storage");

function toSafeLocalPath(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(STORAGE_ROOT, normalized);

  const relative = path.relative(STORAGE_ROOT, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage key");
  }

  return full;
}

export function resolveLocalObjectPath(key: string) {
  return toSafeLocalPath(key);
}

export async function writeLocalObject(key: string, data: Buffer) {
  const fullPath = toSafeLocalPath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, data);
}

export async function readLocalObject(key: string) {
  const fullPath = toSafeLocalPath(key);
  return fs.readFile(fullPath);
}

export async function hasLocalObject(key: string) {
  try {
    await fs.access(toSafeLocalPath(key));
    return true;
  } catch {
    return false;
  }
}

export function localPlaybackUrl(videoId: string) {
  return `http://localhost:4000/api/videos/${videoId}/stream`;
}

export function localThumbnailUrl(videoId: string) {
  return `http://localhost:4000/api/videos/${videoId}/thumbnail`;
}
