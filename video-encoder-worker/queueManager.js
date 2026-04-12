import fs from "fs-extra";
import path from "node:path";
import crypto from "node:crypto";

function toJobId(filePath) {
  return crypto.createHash("sha1").update(path.resolve(filePath).toLowerCase()).digest("hex");
}

export class QueueManager {
  constructor(queueFile) {
    this.queueFile = queueFile;
    this.state = {
      jobs: [],
      updatedAt: new Date().toISOString()
    };
  }

  async init() {
    await fs.ensureDir(path.dirname(this.queueFile));
    if (await fs.pathExists(this.queueFile)) {
      this.state = await fs.readJson(this.queueFile);
      for (const job of this.state.jobs) {
        if (job.status === "processing") {
          job.status = "pending";
        }
      }
      await this.persist();
      return;
    }
    await this.persist();
  }

  async persist() {
    this.state.updatedAt = new Date().toISOString();
    await fs.writeJson(this.queueFile, this.state, { spaces: 2 });
  }

  getJobs() {
    return this.state.jobs;
  }

  async enqueue(filePath) {
    const resolved = path.resolve(filePath);
    const id = toJobId(resolved);
    const existing = this.state.jobs.find((job) => job.id === id && ["pending", "processing", "completed"].includes(job.status));
    if (existing) {
      return existing;
    }

    const job = {
      id,
      sourcePath: resolved,
      currentPath: resolved,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      error: ""
    };

    this.state.jobs.push(job);
    await this.persist();
    return job;
  }

  async nextPending() {
    const job = this.state.jobs.find((item) => item.status === "pending");
    if (!job) return null;
    job.status = "processing";
    job.attempts += 1;
    job.startedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    await this.persist();
    return job;
  }

  async updatePaths(id, currentPath) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) return;
    job.currentPath = currentPath;
    job.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async complete(id) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) return;
    job.status = "completed";
    job.endedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    job.error = "";
    await this.persist();
  }

  async fail(id, errorMessage, retryLimit) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) return { retried: false, final: true };

    job.error = String(errorMessage || "Unknown error");
    job.endedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    if (job.attempts <= retryLimit) {
      job.status = "pending";
      await this.persist();
      return { retried: true, final: false };
    }

    job.status = "failed";
    await this.persist();
    return { retried: false, final: true };
  }
}
