import { env } from "../config.js";

export type TranscodeJob = {
  videoId: string;
  fileKey: string;
};

export async function runTranscodeJob(job: TranscodeJob) {
  // Scaffold only: full FFmpeg + queue integration is intentionally separated
  // so the API can go live first with DB + auth + endpoints.
  return {
    videoId: job.videoId,
    status: "PROCESSING",
    note: `Integrate fluent-ffmpeg and Bull queue with B2 endpoint ${env.B2_ENDPOINT}`
  };
}
