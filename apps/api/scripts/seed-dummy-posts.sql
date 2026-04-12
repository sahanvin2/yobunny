-- First, find or create a test user by finding any existing user (or use first dev user)
-- If no users exist, create one
INSERT INTO "User" (id, "firebaseUid", username, "displayName", email)
SELECT 
  'dummy-poster-' || EXTRACT(EPOCH FROM NOW())::int::text,
  'test-dummy-poster-uid-' || EXTRACT(EPOCH FROM NOW())::int::text,
  'dummyposter',
  'Dummy Poster',
  'dummy@test.local'
ON CONFLICT DO NOTHING;

-- Create 3 dummy posts using any existing user as author
INSERT INTO "Post" (id, title, content, "fileKey", "fileUrl", "fileName", "mimeType", "fileSize", status, visibility, "publishedAt", "createdAt", "updatedAt", "userId", "viewCount", "likeCount", "commentCount")
SELECT 
  'post-demo-1' as id,
  '📢 Sample Article #1' as title,
  'This is a demo article with downloadable content.' || E'\n\n' ||
  'Click the download button to get the attached file.' || E'\n\n' ||
  'Created: ' || CURRENT_DATE::text || E'\n\n' ||
  'This demonstrates the posts feature for content creators.' as content,
  'posts/demo/file-1.pdf' as "fileKey",
  'https://cdn.example.com/posts/demo/file-1.pdf' as "fileUrl",
  'sample-document-1.pdf' as "fileName",
  'application/pdf' as "mimeType",
  500000::bigint as "fileSize",
  'PUBLISHED'::"PostStatus" as status,
  'PUBLIC'::"Visibility" as visibility,
  (NOW() - interval '2 days') as "publishedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt",
  (SELECT id FROM "User" LIMIT 1) as "userId",
  0 as "viewCount",
  0 as "likeCount",
  0 as "commentCount"
WHERE NOT EXISTS (SELECT 1 FROM "Post" WHERE id = 'post-demo-1')

UNION ALL

SELECT 
  'post-demo-2' as id,
  '📢 Sample Article #2' as title,
  'Another demo article showcasing the posts system.' || E'\n\n' ||
  'Posts can contain downloadable files, documents, media, or any other resources.' || E'\n\n' ||
  'The download link is the fileUrl field in the database.' || E'\n\n' ||
  'Created: ' || CURRENT_DATE::text as content,
  'posts/demo/file-2.pdf' as "fileKey",
  'https://cdn.example.com/posts/demo/file-2.pdf' as "fileUrl",
  'sample-document-2.pdf' as "fileName",
  'application/pdf' as "mimeType",
  600000::bigint as "fileSize",
  'PUBLISHED'::"PostStatus" as status,
  'PUBLIC'::"Visibility" as visibility,
  (NOW() - interval '1 day') as "publishedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt",
  (SELECT id FROM "User" LIMIT 1) as "userId",
  0 as "viewCount",
  0 as "likeCount",
  0 as "commentCount"
WHERE NOT EXISTS (SELECT 1 FROM "Post" WHERE id = 'post-demo-2')

UNION ALL

SELECT 
  'post-demo-3' as id,
  '📢 Sample Article #3' as title,
  'The post system supports:' || E'\n' ||
  '- Multiple file types (PDF, docs, images, video, etc)' || E'\n' ||
  '- Direct B2 CDN links for fast downloads' || E'\n' ||
  '- Support for external storage (Google Drive, S3, etc) in future' || E'\n' ||
  '- View counts, likes, and comments' || E'\n' ||
  '- Public/Private/Unlisted visibility' || E'\n\n' ||
  'Created: ' || CURRENT_DATE::text as content,
  'posts/demo/file-3.pdf' as "fileKey",
  'https://cdn.example.com/posts/demo/file-3.pdf' as "fileUrl",
  'sample-document-3.pdf' as "fileName",
  'application/pdf' as "mimeType",
  700000::bigint as "fileSize",
  'PUBLISHED'::"PostStatus" as status,
  'PUBLIC'::"Visibility" as visibility,
  NOW() as "publishedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt",
  (SELECT id FROM "User" LIMIT 1) as "userId",
  0 as "viewCount",
  0 as "likeCount",
  0 as "commentCount"
WHERE NOT EXISTS (SELECT 1 FROM "Post" WHERE id = 'post-demo-3');

-- Print results
SELECT 'Dummy posts created successfully!' as status;
SELECT COUNT(*) as "total_posts_in_system" FROM "Post";
