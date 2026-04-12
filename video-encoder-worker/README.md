# Video Encoder Worker (Windows + Single GPU)

Production-focused sequential HLS encoding worker for a single NVIDIA GPU.

## Features

- Watches input folder for new videos
- Persistent queue in JSON (`queue/jobs.json`)
- Strict one-job-at-a-time processing
- FFmpeg via `child_process` using `h264_nvenc`
- Converts output to 8-bit `yuv420p`
- Generates HLS variants: 1080p, 720p, 480p, 360p, 240p, 144p
- Uploads original + HLS + thumbnail to Backblaze B2
- Writes records to PostgreSQL via Prisma (`Video`, `VideoQuality`)
- Retries failed jobs up to 2 times (configurable)
- Per-video logs in `logs/`

## Folder Layout

- Input: `D:/tele 2` (default via config)
- Processing: `video-encoder-worker/processing`
- Output (temp): `video-encoder-worker/output_hls`
- Completed originals: `video-encoder-worker/completed`
- Failed originals: `video-encoder-worker/failed`
- Queue state: `video-encoder-worker/queue/jobs.json`
- Logs: `video-encoder-worker/logs`

## Setup

1. Open a terminal in `video-encoder-worker`.
2. Install dependencies:

```powershell
npm install
```

3. Copy `.env.example` to `.env` and fill values.

Required envs:

- `DATABASE_URL`
- `B2_ENDPOINT`
- `B2_ACCESS_KEY_ID`
- `B2_SECRET_ACCESS_KEY`
- `B2_BUCKET`
- `B2_REGION`
- `B2_PUBLIC_BASE`

Optional envs:

- `INPUT_DIR` (default `D:/tele 2`)
- `FFMPEG_PATH` (default `ffmpeg`)
- `FFPROBE_PATH` (default `ffprobe`)
- `UPLOADER_USER_ID`
- `RETRY_LIMIT` (default `2`)
- `DELAY_BETWEEN_JOBS_MS` (default `3000`)

## Run

```powershell
npm start
```

Drop files into input folder. Jobs are queued and processed one by one.

## Notes

- No Redis used.
- If app restarts, `processing` jobs are returned to `pending`.
- Corrupt/unsupported files are marked failed after retry limit.
- Adaptive quality switching happens through `master.m3u8`.
