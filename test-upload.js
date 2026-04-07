import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFile = path.join(__dirname, "test.mp4");

// Create test file
console.log("Creating test video file...");
const testData = Buffer.alloc(50 * 1024);
fs.writeFileSync(testFile, testData);

// Upload using fetch
async function test() {
  const form = new FormData();
  form.append("file", new Blob([testData], { type: "video/mp4" }), "test.mp4");
  form.append("title", "Test Video");
  form.append("category", "EDUCATION");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  console.log("\nStarting upload at", new Date().toISOString());
  const start = Date.now();

  try {
    const response = await fetch("http://localhost:4000/api/videos/upload-file", {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Upload succeeded in ${elapsed}s`);
      console.log("Response:", JSON.stringify(data, null, 2));
    } else {
      console.error(`✗ Upload failed (${response.status}) after ${elapsed}s`);
      console.error("Response:", await response.text());
    }
  } catch (error) {
    clearTimeout(timeout);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`✗ Upload error after ${elapsed}s:`, error.message);
  }

  // Cleanup
  fs.unlinkSync(testFile);
  process.exit(0);
}

test();
