import { spawn } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";

const BASE_VARIANTS = [
  { label: "1080p", height: 1080, bitrate: 6000_000 },
  { label: "720p", height: 720, bitrate: 3500_000 },
  { label: "480p", height: 480, bitrate: 1700_000 },
  { label: "360p", height: 360, bitrate: 1000_000 },
  { label: "240p", height: 240, bitrate: 600_000 },
  { label: "144p", height: 144, bitrate: 300_000 }
];

function runProcess(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (typeof options.onOutput === "function") {
        options.onOutput(text, "stdout");
      }
    });

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (typeof options.onOutput === "function") {
        options.onOutput(text, "stderr");
      }
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${binary} exited with code ${code}\n${stderr.slice(-1000)}`));
    });
  });
}

export async function probeVideo(inputPath, ffprobePath) {
  const args = [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    inputPath
  ];

  const { stdout } = await runProcess(ffprobePath, args);
  const parsed = JSON.parse(stdout || "{}");
  const streams = parsed.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("No video stream found");
  }

  const width = Number(videoStream.width || 0);
  const height = Number(videoStream.height || 0);
  const duration = Math.round(Number(parsed.format?.duration || videoStream.duration || 0));

  return {
    width,
    height,
    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    hasAudio: Boolean(audioStream)
  };
}

export async function encodeToHls({ inputPath, outputRoot, ffmpegPath, ffprobePath, log }) {
  const meta = await probeVideo(inputPath, ffprobePath);
  const maxHeight = Math.max(144, meta.height || 1080);
  const variants = BASE_VARIANTS.filter((variant) => variant.height <= maxHeight);

  if (variants.length === 0) {
    variants.push({ label: "240p", height: 240, bitrate: 600_000 });
  }

  await fs.ensureDir(outputRoot);

  const args = ["-y", "-i", inputPath];

  for (let i = 0; i < variants.length; i += 1) {
    args.push("-map", "0:v:0");
  }

  if (meta.hasAudio) {
    for (let i = 0; i < variants.length; i += 1) {
      args.push("-map", "0:a:0?");
    }
  }

  for (let i = 0; i < variants.length; i += 1) {
    const variant = variants[i];
    const maxrate = Math.round(variant.bitrate * 1.08);
    const bufsize = Math.round(variant.bitrate * 1.5);

    args.push(
      `-vf:${i}`,
      `scale=-2:${variant.height}:flags=lanczos,format=yuv420p`,
      `-c:v:${i}`,
      "h264_nvenc",
      `-b:v:${i}`,
      String(variant.bitrate),
      `-maxrate:v:${i}`,
      String(maxrate),
      `-bufsize:v:${i}`,
      String(bufsize),
      `-profile:v:${i}`,
      "high",
      `-preset:v:${i}`,
      "p3",
      `-g:v:${i}`,
      "48",
      `-keyint_min:v:${i}`,
      "48"
    );
  }

  if (meta.hasAudio) {
    for (let i = 0; i < variants.length; i += 1) {
      args.push(`-c:a:${i}`, "aac", `-b:a:${i}`, "128k", `-ac:a:${i}`, "2", `-ar:a:${i}`, "48000");
    }
  }

  const varStreamMap = variants
    .map((variant, index) => {
      if (meta.hasAudio) {
        return `v:${index},a:${index},name:${variant.label}`;
      }
      return `v:${index},name:${variant.label}`;
    })
    .join(" ");

  args.push(
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-master_pl_name",
    "master.m3u8",
    "-hls_segment_filename",
    path.join(outputRoot, "%v", "segment_%06d.ts"),
    "-var_stream_map",
    varStreamMap,
    path.join(outputRoot, "%v", "index.m3u8")
  );

  await runProcess(ffmpegPath, args, {
    onOutput: (chunk) => log(chunk)
  });

  const thumbnailPath = path.join(outputRoot, "thumb.webp");
  const thumbArgs = [
    "-y",
    "-ss",
    "1",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:-2,format=yuv420p",
    "-c:v",
    "libwebp",
    "-quality",
    "80",
    thumbnailPath
  ];

  try {
    await runProcess(ffmpegPath, thumbArgs, {
      onOutput: (chunk) => log(chunk)
    });
  } catch {
    // Thumbnail is optional. Continue when snapshot fails.
  }

  return {
    variants,
    duration: meta.duration,
    hasAudio: meta.hasAudio,
    thumbnailPath: await fs.pathExists(thumbnailPath) ? thumbnailPath : ""
  };
}
