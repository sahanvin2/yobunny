import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchLikedVideosPage } from "@/lib/api";

export default function LikedPage() {
  const PAGE_SIZE = 60;
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchLikedVideosPage({ page: 1, limit: PAGE_SIZE })
      .then((result) => {
        setVideos(result.items);
        setPage(1);
        setHasMore(result.hasMore);
      })
      .catch(() => {
        setVideos([]);
        setHasMore(false);
      });
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await fetchLikedVideosPage({ page: nextPage, limit: PAGE_SIZE });
      setVideos((prev) => {
        const merged = [...prev, ...result.items];
        const seen = new Set<string>();
        return merged.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Liked Videos</h1>
      {videos.length === 0 ? <p className="text-sm text-muted-foreground">No liked videos yet.</p> : <VideoGrid videos={videos} hasMoreFromServer={hasMore} loadingMore={loadingMore} onReachEnd={loadMore} />}
    </div>
  );
}
