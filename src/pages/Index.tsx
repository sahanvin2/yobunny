import { useEffect, useMemo, useState } from "react";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchVideos, isClipLikeVideo } from "@/lib/api";
import { limitVideosPerCreator, sortShortsVideos } from "@/lib/videoFeed";

const PAGE_SIZE = 60;

export default function HomePage() {
  const [videos, setVideos] = useState<Awaited<ReturnType<typeof fetchVideos>>>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async (initialLoad: boolean) => {
      if (initialLoad) {
        setLoading(true);
        setError("");
      }

      try {
        const items = await fetchVideos({ sort: "latest", page: 1, limit: PAGE_SIZE });
        if (cancelled) return;
        setVideos(items);
        setPage(1);
        setHasMore(items.length === PAGE_SIZE);
      } catch (err) {
        if (cancelled || !initialLoad) return;
        setVideos([]);
        setHasMore(false);
        setError(err instanceof Error ? err.message : "Failed to load home feed");
      } finally {
        if (!cancelled && initialLoad) {
          setLoading(false);
        }
      }
    };

    const refresh = () => {
      void load(false);
    };

    void load(true);

    const refreshTimer = window.setInterval(refresh, 45000);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const nextVideos = await fetchVideos({ sort: "latest", page: nextPage, limit: PAGE_SIZE });
      setVideos((prev) => {
        const merged = [...prev, ...nextVideos];
        const seen = new Set<string>();
        return merged.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setPage(nextPage);
      setHasMore(nextVideos.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const clips = useMemo(() => {
    const clipLike = videos.filter(isClipLikeVideo);
    const sorted = sortShortsVideos(clipLike.length > 0 ? clipLike : videos);
    return limitVideosPerCreator(sorted, 3);
  }, [videos]);

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-5">
      <h1 className="text-2xl font-semibold text-foreground">Home</h1>
      {loading && <p className="text-sm text-muted-foreground">Loading home feed...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No videos available right now.</p>
      ) : (
        <ClipGrid clips={clips} hasMoreFromServer={hasMore} loadingMore={loadingMore} onReachEnd={loadMore} />
      )}
    </div>
  );
}
