import fs from "fs";
import path from "path";

async function uploadWithFormData() {
  const testVideoPath = "test/xfree@Cristian.Hilpert_10841.mp4";
  console.log("🎬 Reading test video:", testVideoPath);
  const videoBuffer = await fs.promises.readFile(testVideoPath);
  const stats = fs.statSync(testVideoPath);
  console.log(`📦 Video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

  const form = new FormData();
  const blob = new Blob([videoBuffer], { type: "video/mp4" });
  form.append("file", blob, path.basename(testVideoPath));
  form.append("title", "Test Video - Local Upload");
  form.append("category", "ENTERTAINMENT");
  form.append("description", "Testing local storage upload");
  form.append("visibility", "PUBLIC");

  console.log("⏳ Starting upload to localhost:4000/api/videos/upload-file");
  const start = Date.now();

  try {
    const response = await fetch("http://localhost:4000/api/videos/upload-file", {
      method: "POST",
      body: form
    });

    const elapsed = (Date.now() - start) / 1000;

    if (!response.ok) {
      console.error(`\n❌ Upload failed (${response.status}) after ${elapsed}s`);
      const error = await response.text();
      console.error("Response:", error);
      process.exit(1);
    }

    const data = await response.json();
    console.log(`\n✅ Upload succeeded in ${elapsed.toFixed(1)}s!\n`);
    console.log("📹 Video Details:");
    console.log(`   └─ ID: ${data.item.id}`);
    console.log(`   └─ Title: ${data.item.title}`);
    console.log(`   └─ Duration: ${data.item.duration ?? "?"} seconds`);
    console.log(`   └─ Status: ${data.item.status}`);
    console.log(`   └─ Play URL: ${data.item.hlsBaseUrl}`);
    console.log(`\n🎉 View at http://localhost:8080/watch/${data.item.id}`);
  } catch (error) {
    const elapsed = (Date.now() - start) / 1000;
    console.error(`\n❌ Error after ${elapsed}s:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

uploadWithFormData();
