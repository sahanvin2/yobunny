import fs from "fs";

const testVideoPath = "test/xfree@Cristian.Hilpert_10841.mp4";

async function testUpload() {
  console.log("🎬 Loading test video:", testVideoPath);
  const videoBuffer = await fs.promises.readFile(testVideoPath);
  console.log(`📦 Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  const formData = new FormData();
  const blob = new Blob([videoBuffer], { type: "video/mp4" });
  formData.append("file", blob, "test-video.mp4");
  formData.append("title", "Test Upload - With Duration");
  formData.append("category", "ENTERTAINMENT");
  formData.append("description", "Testing video feature with duration extraction");
  formData.append("visibility", "PUBLIC");

  console.log("\n⏳ Starting upload...");
  const start = Date.now();

  try {
    const response = await fetch("http://localhost:4000/api/videos/upload-file", {
      method: "POST",
      body: formData,
      headers: {} // Let browser set Content-Type with boundary
    });

    const elapsed = (Date.now() - start) / 1000;

    if (!response.ok) {
      console.error(`❌ Upload failed (${response.status}) after ${elapsed}s`);
      const error = await response.text();
      console.error("Status:", response.status);
      console.error("Error:", error);
      process.exit(1);
    }

    const data = await response.json();
    console.log(`\n✅ Upload succeeded in ${elapsed}s!\n`);
    console.log("📹 Video Details:");
    console.log(`   └─ ID: ${data.item.id}`);
    console.log(`   └─ Title: ${data.item.title}`);
    console.log(`   └─ Duration: ${data.item.duration || "extracting..."} seconds`);
    console.log(`   └─ Status: ${data.item.status}`);
    console.log(`   └─ Storage: ${data.item.rawFileKey.includes("local") ? "Local" : "B2"}`);
    console.log(`   └─ Play URL: ${data.item.hlsBaseUrl}`);
    console.log("\n🎉 You can now view this video at:");
    console.log(`   http://localhost:8080/watch/${data.item.id}`);
  } catch (error) {
    const elapsed = (Date.now() - start) / 1000;
    console.error(`\n❌ Upload error after ${elapsed}s:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testUpload();
