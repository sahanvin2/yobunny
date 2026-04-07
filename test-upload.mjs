import fs from "fs";
import path from "path";

const testVideoPath = "test/xfree@unrealporn_275353.mp4";

async function testUpload() {
  console.log("Loading test video:", testVideoPath);
  const videoBuffer = await fs.promises.readFile(testVideoPath);
  console.log(`Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Create multipart form data
  const formData = new FormData();
  const blob = new Blob([videoBuffer], { type: "video/mp4" });
  formData.append("file", blob, path.basename(testVideoPath));
  formData.append("title", "Test Video - YouTube like");
  formData.append("category", "ENTERTAINMENT");
  formData.append("description", "Testing video upload with duration extraction");
  formData.append("visibility", "PUBLIC");

  console.log("\nStarting upload...");
  const start = Date.now();

  try {
    const response = await fetch("http://localhost:4000/api/videos/upload-file", {
      method: "POST",
      body: formData
    });

    const elapsed = (Date.now() - start) / 1000;

    if (!response.ok) {
      console.error(`❌ Upload failed (${response.status}) after ${elapsed}s`);
      console.error("Error:", await response.text());
      process.exit(1);
    }

    const data = await response.json();
    console.log(`✅ Upload succeeded in ${elapsed}s`);
    console.log("Video details:");
    console.log(`  ID: ${data.item.id}`);
    console.log(`  Title: ${data.item.title}`);
    console.log(`  Duration: ${data.item.duration} seconds`);
    console.log(`  Status: ${data.item.status}`);
    console.log(`  URL: ${data.item.hlsBaseUrl}`);
  } catch (error) {
    const elapsed = (Date.now() - start) / 1000;
    console.error(`❌ Upload error after ${elapsed}s:`, error.message);
    process.exit(1);
  }
}

testUpload();
