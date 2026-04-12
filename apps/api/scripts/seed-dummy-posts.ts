import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedDummyPosts() {
  console.log("🌱 Seeding 3 dummy posts from existing B2 videos...\n");

  try {
    // Find or create a test user for posts
    let testUser = await prisma.user.findUnique({
      where: { username: "dummyposter" }
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          username: "dummyposter",
          displayName: "Dummy Poster",
          firebaseUid: "test-dummy-poster-uid-" + Date.now(),
          email: "dummy@test.local"
        }
      });
      console.log(`✅ Created test user: @${testUser.username}`);
    } else {
      console.log(`✅ Using existing test user: @${testUser.username}`);
    }

    // Get first 3 public videos to base posts on
    const videos = await prisma.video.findMany({
      where: { status: "READY", visibility: "PUBLIC" },
      orderBy: { uploadedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        description: true,
        videoKey: true,
        hlsBaseUrl: true,
        bucket: true
      }
    });

    if (videos.length === 0) {
      console.log("❌ No public videos found in database. Cannot create dummy posts.");
      console.log("\n📝 Creating sample posts with placeholder data instead...\n");

      // Create sample posts anyway
      for (let i = 0; i < 3; i++) {
        const post = await prisma.post.create({
          data: {
            title: `📢 Sample Article #${i + 1}`,
            content: `This is a sample article with downloadable content.\n\nClick the download button to get the attached file.\n\nCreated on: ${new Date().toLocaleDateString()}\n\nThis is dummy post #${i + 1} for demonstration.`,
            fileKey: `posts/demo/file-${i + 1}.pdf`,
            fileUrl: `https://cdn.example.com/posts/demo/file-${i + 1}.pdf`,
            fileName: `sample-document-${i + 1}.pdf`,
            mimeType: "application/pdf",
            fileSize: BigInt(500000 + i * 100000),
            status: "PUBLISHED" as const,
            visibility: "PUBLIC" as const,
            publishedAt: new Date(Date.now() - i * 86400000),
            userId: testUser.id
          },
          include: {
            user: {
              select: { username: true, displayName: true }
            }
          }
        });

        console.log(`✅ Created post #${i + 1}: "${post.title}"`);
        console.log(`   Author: @${post.user.username}`);
        console.log(`   File: ${post.fileName}\n`);
      }
      return;
    }

    console.log(`Found ${videos.length} videos to base posts on\n`);

    // Create posts from these videos
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];

      // Use video's HLS base or video key for file storage
      const fileKey = video.videoKey || `${video.bucket || "videos"}/${video.id}/original.mp4`;
      const fileUrl = video.hlsBaseUrl || `https://cdn.example.com/${fileKey}`;

      const post = await prisma.post.create({
        data: {
          title: `📢 ${video.title} (Post #${i + 1})`,
          content: `This is a downloadable article featuring: ${video.description || video.title}\n\nClick download to get the full media file.\n\nCreated on: ${new Date().toLocaleDateString()}`,
          fileKey,
          fileUrl,
          fileName: `${video.title.replace(/[^\w\s-]/g, "").slice(0, 40)}.mp4`,
          mimeType: "video/mp4",
          fileSize: BigInt(10000000),
          status: "PUBLISHED" as const,
          visibility: "PUBLIC" as const,
          publishedAt: new Date(Date.now() - i * 86400000),
          userId: testUser.id
        },
        include: {
          user: {
            select: { username: true, displayName: true }
          }
        }
      });

      console.log(`✅ Created post #${i + 1}: "${post.title}"`);
      console.log(`   Author: @${post.user.username}`);
      console.log(`   File: ${post.fileName}\n`);
    }

    console.log("🎉 Dummy posts created successfully!");
    console.log("   To remove them later, find posts with userId matching the 'dummyposter' user.\n");
  } catch (error) {
    console.error("❌ Error seeding posts:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedDummyPosts();
