SELECT COUNT(*) as total_videos FROM "Video";
SELECT COUNT(*) as total_ready FROM "Video" WHERE status = 'READY';
SELECT id, title, tags FROM "Video" LIMIT 5;
