import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchVideos, isClipLikeVideo } from "@/lib/api";

export default function TrendingPage() {
  const PAGE_SIZE = 60;
  const [trending, setTrending] = useState<VideoData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVideos({ sort: "views", page: 1, limit: PAGE_SIZE })
      .then((items) => {
        const clips = items.filter(isClipLikeVideo);
        const source = clips.length > 0 ? clips : items;
        setTrending(source);
        setPage(1);
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch(() => {
        setTrending([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const items = await fetchVideos({ sort: "views", page: nextPage, limit: PAGE_SIZE });
      const clips = items.filter(isClipLikeVideo);
      const source = clips.length > 0 ? clips : items;
      setTrending((prev) => {
        const merged = [...prev, ...source];
        const seen = new Set<string>();
        return merged.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setPage(nextPage);
      setHasMore(items.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-5">
      <h1 className="text-2xl font-semibold text-foreground">Trending</h1>
      {loading && <p className="text-sm text-muted-foreground">Loading trending videos...</p>}
      {!loading && trending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trending videos yet.</p>
      ) : (
        <ClipGrid clips={trending} hasMoreFromServer={hasMore} loadingMore={loadingMore} onReachEnd={loadMore} />
      )}
    </div>
  );
}
