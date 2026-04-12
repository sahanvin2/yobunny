import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react";
import { fetchVideos, partitionVideosByFormat, toggleLike, toggleSave } from "@/lib/api";
import { formatRelativeTime, formatViewCount, type VideoData } from "@/lib/mockData";
import { sortShortsVideos } from "@/lib/videoFeed";

export default function ShortsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const PAGE_SIZE = 40;

  const [clips, setClips] = useState<VideoData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const gridSentinelRef = useRef<HTMLDivElement | null>(null);
  const playerSentinelRef = useRef<HTMLDivElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const didJumpToInitialRef = useRef(false);
  const [activeVideoId, setActiveVideoId] = useState<string>(id || "");
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const [savedById, setSavedById] = useState<Record<string, boolean>>({});

  const isPlayerMode = Boolean(id);

  const loadPage = useCallback(async (nextPage: number, replace = false) => {
    try {
      if (replace) {
        setLoading(true);
        setStatus("");
      } else {
        setLoadingMore(true);
      }

      const items = await fetchVideos({
        sort: "latest",
        page: nextPage,
        limit: PAGE_SIZE
      });

      const { clips: portraitItems } = await partitionVideosByFormat(items);
      const cleanPortraits = portraitItems.filter((item) => Boolean(item.hlsBaseUrl));

      setClips((prev) => {
        const base = replace ? [] : prev;
        const seen = new Set(base.map((item) => item.id));
        const merged = [...base];
        for (const item of cleanPortraits) {
          if (seen.has(item.id)) continue;
          merged.push(item);
          seen.add(item.id);
        }
        return sortShortsVideos(merged);
      });

      setPage(nextPage);
      setHasMore(items.length === PAGE_SIZE);
    } catch {
      if (replace) {
        setClips([]);
      }
      setStatus("Failed to load shorts");
    } finally {
      if (replace) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    if (!id || loading || loadingMore || !hasMore) return;
    if (clips.some((item) => item.id === id)) return;
    void loadPage(page + 1);
  }, [id, clips, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!gridSentinelRef.current || isPlayerMode) return;
    const node = gridSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void loadPage(page + 1);
      },
      { rootMargin: "1200px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isPlayerMode, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!playerSentinelRef.current || !isPlayerMode) return;
    const node = playerSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void loadPage(page + 1);
      },
      { rootMargin: "900px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isPlayerMode, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!isPlayerMode || !id) return;
    const target = cardRefs.current[id];
    if (!target) return;
    target.scrollIntoView({ behavior: didJumpToInitialRef.current ? "smooth" : "auto", block: "start" });
    didJumpToInitialRef.current = true;
    setActiveVideoId(id);
  }, [id, isPlayerMode, clips.length]);

  useEffect(() => {
    if (!isPlayerMode || !playerContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const videoId = element.dataset.videoId;
          if (!videoId) return;

          const videoEl = videoRefs.current[videoId];
          if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
            setActiveVideoId(videoId);
            if (videoEl) {
              void videoEl.play().catch(() => undefined);
            }
          } else if (videoEl) {
            videoEl.pause();
          }
        });
      },
      {
        root: playerContainerRef.current,
        threshold: [0.35, 0.72, 0.95]
      }
    );

    Object.entries(cardRefs.current).forEach(([, node]) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [clips, isPlayerMode]);

  const onShare = useCallback(async (videoId: string) => {
    const url = `${window.location.origin}/shorts/${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Copy failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const onLike = useCallback(async (videoId: string) => {
    try {
      const result = await toggleLike(videoId);
      setLikedById((prev) => ({ ...prev, [videoId]: result.liked }));
    } catch {
      setStatus("Like failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const onSave = useCallback(async (videoId: string) => {
    try {
      const result = await toggleSave(videoId);
      setSavedById((prev) => ({ ...prev, [videoId]: result.saved }));
      setStatus(result.saved ? "Saved" : "Removed from saved");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Save failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const shorts = useMemo(() => clips.filter((item) => Boolean(item.hlsBaseUrl)), [clips]);

  if (loading) {
    return <div className="p-4 lg:p-6 text-sm text-muted-foreground">Loading shorts...</div>;
  }

  if (shorts.length === 0) {
    return <div className="p-4 lg:p-6 text-sm text-muted-foreground">No shorts available yet.</div>;
  }

  if (!isPlayerMode) {
    return (
      <div className="p-4 lg:p-8 space-y-6 max-w-[1800px] mx-auto">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Shorts</h1>
          <p className="text-sm text-white/60 mt-2">Portrait videos only</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-3 lg:gap-4">
          {shorts.map((video) => (
            <Link
              key={video.id}
              to={`/shorts/${video.id}`}
              className="group rounded-2xl overflow-hidden border border-white/10 bg-black/30"
            >
              <div className="aspect-[9/16] relative">
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <p className="text-xs font-semibold text-white line-clamp-2">{video.title}</p>
                  <p className="text-[11px] text-white/75 mt-1">{formatViewCount(video.viewCount)} views</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div ref={gridSentinelRef} className="h-1 w-full" aria-hidden="true" />
        {loadingMore && <p className="text-center text-sm text-white/60">Loading more...</p>}
        {status && <p className="text-center text-xs text-white/70">{status}</p>}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-black text-white">
      <div
        ref={playerContainerRef}
        className="h-full overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shorts.map((video) => {
          const isActive = activeVideoId === video.id;
          return (
            <section
              key={video.id}
              data-video-id={video.id}
              ref={(node) => {
                cardRefs.current[video.id] = node;
              }}
              className="snap-start h-[calc(100vh-64px)] flex items-center justify-center px-2 sm:px-4"
            >
              <div className="relative w-full max-w-[430px] h-[95%] rounded-2xl overflow-hidden border border-white/10 bg-black">
                <video
                  ref={(node) => {
                    videoRefs.current[video.id] = node;
                  }}
                  src={video.hlsBaseUrl}
                  poster={video.thumbnailUrl}
                  controls={isActive}
                  autoPlay={isActive}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  <Link to={`/channel/${video.channel.username}`} className="text-sm font-semibold text-white/95 hover:text-white">
                    @{video.channel.username}
                  </Link>
                  <p className="text-sm text-white mt-1 line-clamp-2">{video.title}</p>
                  <p className="text-xs text-white/70 mt-1">{formatViewCount(video.viewCount)} views • {formatRelativeTime(video.publishedAt)}</p>
                </div>

                <aside className="absolute right-3 bottom-24 flex flex-col gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => void onLike(video.id)}
                    className={`h-11 w-11 rounded-full border border-white/20 inline-flex items-center justify-center ${likedById[video.id] ? "bg-white text-black" : "bg-black/45 hover:bg-black/60"}`}
                    title="Like"
                  >
                    <Heart size={18} />
                  </button>
                  <p className="text-[11px] text-white/85 font-semibold">{likedById[video.id] ? "Liked" : (video.likeCount || 0)}</p>
                  <button
                    type="button"
                    onClick={() => void onSave(video.id)}
                    className={`h-11 w-11 rounded-full border border-white/20 inline-flex items-center justify-center ${savedById[video.id] ? "bg-white text-black" : "bg-black/45 hover:bg-black/60"}`}
                    title="Save"
                  >
                    <Bookmark size={18} />
                  </button>
                  <p className="text-[11px] text-white/85 font-semibold">{savedById[video.id] ? "Saved" : "Save"}</p>
                  <button type="button" onClick={() => void onShare(video.id)} className="h-11 w-11 rounded-full bg-black/45 border border-white/20 hover:bg-black/60 inline-flex items-center justify-center" title="Share">
                    <Share2 size={18} />
                  </button>
                  <Link to={`/watch/${video.id}`} className="h-11 w-11 rounded-full bg-black/45 border border-white/20 inline-flex items-center justify-center hover:bg-black/60" title="Comments">
                    <MessageCircle size={18} />
                  </Link>
                </aside>
              </div>
            </section>
          );
        })}

        <div ref={playerSentinelRef} className="h-2 w-full" aria-hidden="true" />
        {loadingMore && <p className="py-4 text-center text-xs text-white/60">Loading more shorts...</p>}
        <div className="fixed top-20 left-4 z-30">
          <button
            type="button"
            onClick={() => navigate("/shorts")}
            className="px-3 py-2 rounded-full bg-black/60 border border-white/20 text-xs font-semibold hover:bg-black/75"
          >
            All Shorts
          </button>
        </div>
        {status && <p className="fixed bottom-8 left-1/2 -translate-x-1/2 text-xs bg-black/70 px-3 py-2 rounded-full border border-white/15">{status}</p>}
      </div>
    </div>
  );
}
