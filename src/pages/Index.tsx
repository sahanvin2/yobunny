import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CategoryBar from "@/components/layout/CategoryBar";
import VideoGrid from "@/components/video/VideoGrid";
import ClipGrid from "@/components/video/ClipGrid";
import type { VideoData } from "@/lib/mockData";
import { fetchVideos, isClipLikeVideo, partitionVideosByFormat } from "@/lib/api";

const PAGE_SIZE = 40;
const TOP_LANDSCAPE_COUNT = 15;

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function mixByCreator(videos: VideoData[]) {
  const groups = new Map<string, VideoData[]>();

  for (const video of videos) {
    const key = video.channel?.username || "unknown";
    const list = groups.get(key) || [];
    list.push(video);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    shuffleInPlace(list);
  }

  const creatorKeys = shuffleInPlace(Array.from(groups.keys()));
  const mixed: VideoData[] = [];

  while (creatorKeys.length > 0) {
    for (let i = creatorKeys.length - 1; i >= 0; i -= 1) {
      const key = creatorKeys[i];
      const bucket = groups.get(key);
      if (!bucket || bucket.length === 0) {
        creatorKeys.splice(i, 1);
        continue;
      }

      const item = bucket.shift();
      if (item) {
        mixed.push(item);
      }

      if (bucket.length === 0) {
        creatorKeys.splice(i, 1);
      }
    }
  }

  return mixed;
}

function hasClipTag(video: VideoData) {
  const tags = (video.tags || []).map((tag) => String(tag).toLowerCase());
  return tags.includes("__auto_clip__") || tags.includes("__portrait__") || tags.includes("portrait") || tags.includes("short") || tags.includes("shorts") || tags.includes("clip") || tags.includes("clips");
}

function isClipCandidate(video: VideoData) {
  return isClipLikeVideo(video) || hasClipTag(video);
}

export default function HomePage() {
  const [category, setCategory] = useState("All");
  const [allVideos, setAllVideos] = useState<VideoData[]>([]);
  const [clipsPreview, setClipsPreview] = useState<VideoData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreLockRef = useRef(false);
  const [mixSeed, setMixSeed] = useState(() => Date.now());

  const loadPage = useCallback(
    async (targetPage: number, replace = false) => {
      try {
        if (targetPage === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        const items = await fetchVideos({
          sort: "latest",
          page: targetPage,
          limit: PAGE_SIZE,
          ...(category !== "All" ? { category } : {})
        });

        setAllVideos((prev) => {
          const base = replace ? [] : prev;
          const seen = new Set(base.map((item) => item.id));
          const merged = [...base];

          for (const item of items) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
          }

          return merged;
        });

        setHasMorePages(items.length >= PAGE_SIZE);
        setPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load videos");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category]
  );

  useEffect(() => {
    setAllVideos([]);
    setPage(1);
    setHasMorePages(true);
    setError("");
    setMixSeed(Date.now());
    void loadPage(1, true);
  }, [category, loadPage]);

  useEffect(() => {
    let cancelled = false;

    const loadClipsPreview = async () => {
      setClipsLoading(true);
      setClipsPreview([]);

      try {
        const seen = new Set<string>();
        const collected: VideoData[] = [];

        for (let clipPage = 1; clipPage <= 30; clipPage += 1) {
          const items = await fetchVideos({ sort: "latest", page: clipPage, limit: PAGE_SIZE });
          if (cancelled) return;

          const { clips: clipItems } = await partitionVideosByFormat(items);

          for (const item of clipItems) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            collected.push(item);
          }

          setClipsPreview([...collected.slice(0, 60)]);

          if (collected.length >= 60 || items.length < PAGE_SIZE) {
            break;
          }
        }
      } catch {
        if (!cancelled) {
          setClipsPreview([]);
        }
      } finally {
        if (!cancelled) {
          setClipsLoading(false);
        }
      }
    };

    void loadClipsPreview();

    return () => {
      cancelled = true;
    };
  }, []);

  const onLoadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMorePages || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    try {
      await loadPage(page + 1);
    } finally {
      loadMoreLockRef.current = false;
    }
  }, [hasMorePages, loadPage, loading, loadingMore, page]);

  useEffect(() => {
    if (!pageSentinelRef.current || loading || loadingMore || !hasMorePages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        void onLoadMore();
      },
      {
        rootMargin: "900px 0px"
      }
    );

    observer.observe(pageSentinelRef.current);
    return () => observer.disconnect();
  }, [hasMorePages, loading, loadingMore, onLoadMore]);

  const clipIds = useMemo(() => new Set(clipsPreview.map((clip) => clip.id)), [clipsPreview]);
  const videos = useMemo(
    () => allVideos.filter((video) => !clipIds.has(video.id) && !isClipCandidate(video)),
    [allVideos, clipIds]
  );
  const mixedLandscapeVideos = useMemo(() => {
    // mixSeed is used to re-shuffle when category changes or page is refreshed.
    void mixSeed;
    return mixByCreator(videos);
  }, [videos, mixSeed]);
  const topLandscapeVideos = mixedLandscapeVideos.slice(0, TOP_LANDSCAPE_COUNT);
  const bottomLandscapeVideos = mixedLandscapeVideos.slice(TOP_LANDSCAPE_COUNT);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <CategoryBar selected={category} onSelect={setCategory} />
      {loading && <p className="text-sm text-muted-foreground">Loading videos...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && topLandscapeVideos.length > 0 && (
        <div className="pt-2">
          <h2 className="text-lg font-semibold text-foreground mb-6">Videos ({videos.length})</h2>
          <VideoGrid videos={topLandscapeVideos} />
        </div>
      )}

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clips ({clipsPreview.length})</h2>
        {clipsLoading && <p className="text-sm text-muted-foreground">Loading clips...</p>}
        {!clipsLoading && clipsPreview.length === 0 && (
          <p className="text-sm text-muted-foreground">No clips yet. Upload a portrait video under 1 minute.</p>
        )}
        {!clipsLoading && clipsPreview.length > 0 && <ClipGrid clips={clipsPreview} mode="row" />}
      </div>

      {!loading && !error && bottomLandscapeVideos.length > 0 && (
        <div className="pt-6 mt-4 border-t border-white/10">
          <h2 className="text-lg font-semibold text-foreground mb-6">More Videos</h2>
          <VideoGrid videos={bottomLandscapeVideos} />
          {loadingMore && <p className="text-sm text-muted-foreground mt-4">Loading more videos...</p>}
        </div>
      )}
      {!loading && !error && videos.length === 0 && <p className="text-sm text-muted-foreground">No landscape videos yet.</p>}
      {!loading && !error && hasMorePages && <div ref={pageSentinelRef} className="h-1 w-full" aria-hidden="true" />}
    </div>
  );
}
