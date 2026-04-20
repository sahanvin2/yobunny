import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchModelSummaries, fetchVideos, type ApiModelSummary } from "@/lib/api";
import { formatViewCount, type VideoData } from "@/lib/mockData";

type DiscoverTab = "videos" | "models" | "niches";
type SortMode = "trending" | "top_week" | "top_month" | "latest";

const TAB_LABELS: Array<{ key: DiscoverTab; label: string }> = [
  { key: "videos", label: "Videos" },
  { key: "models", label: "Models" },
  { key: "niches", label: "Niches" }
];

const SORT_LABELS: Array<{ key: SortMode; label: string }> = [
  { key: "trending", label: "Trending" },
  { key: "top_week", label: "Top This Week" },
  { key: "top_month", label: "Top This Month" },
  { key: "latest", label: "Latest" }
];

const NICHE_TAGS = [
  "Entertainment",
  "Music",
  "Gaming",
  "Education",
  "Technology",
  "Sports",
  "Travel",
  "Fashion",
  "Comedy",
  "Culture"
];

function modelScore(item: ApiModelSummary, mode: SortMode) {
  if (mode === "latest") return item.videoCount * 10;
  if (mode === "top_week") return item.videoCount * 8 + item.totalViews * 0.15;
  if (mode === "top_month") return item.totalViews * 0.9 + item.videoCount * 8;
  return item.totalViews + item.videoCount * 30;
}

function videoScore(item: VideoData, mode: SortMode) {
  const ts = new Date(item.publishedAt).getTime() || 0;
  if (mode === "latest") return ts;
  if (mode === "top_week") return item.viewCount * 1.1 + ts * 0.0000001;
  if (mode === "top_month") return item.viewCount + (item.likeCount || 0) * 30;
  return item.viewCount * 1.15 + (item.likeCount || 0) * 35 + ts * 0.00000006;
}

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<DiscoverTab>("models");
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [sortOpen, setSortOpen] = useState(false);
  const [models, setModels] = useState<ApiModelSummary[]>([]);
  const [mediaItems, setMediaItems] = useState<VideoData[]>([]);
  const [modelsOffset, setModelsOffset] = useState(0);
  const [modelsHasMore, setModelsHasMore] = useState(true);
  const [videosPage, setVideosPage] = useState(1);
  const [videosHasMore, setVideosHasMore] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingMoreModels, setLoadingMoreModels] = useState(false);
  const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);
  const [error, setError] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const MODELS_BATCH_SIZE = 40;
  const VIDEOS_BATCH_SIZE = 60;

  const videoApiSort: "latest" | "views" = sortMode === "latest" ? "latest" : "views";

  useEffect(() => {
    let cancelled = false;

    const loadDiscover = async () => {
      try {
        setLoadingMedia(true);
        setLoadingModels(true);
        setError("");
        const [modelsResult, videosResult] = await Promise.allSettled([
          fetchModelSummaries({ limit: MODELS_BATCH_SIZE, offset: 0 }),
          fetchVideos({ sort: videoApiSort, page: 1, limit: VIDEOS_BATCH_SIZE })
        ]);

        if (cancelled) {
          return;
        }

        if (modelsResult.status === "fulfilled") {
          setModels(modelsResult.value);
          setModelsOffset(modelsResult.value.length);
          setModelsHasMore(modelsResult.value.length === MODELS_BATCH_SIZE);
        } else {
          setModels([]);
          setModelsOffset(0);
          setModelsHasMore(false);
        }

        if (videosResult.status === "fulfilled") {
          setMediaItems(videosResult.value);
          setVideosPage(1);
          setVideosHasMore(videosResult.value.length === VIDEOS_BATCH_SIZE);
        } else {
          setMediaItems([]);
          setVideosPage(1);
          setVideosHasMore(false);
        }

        if (modelsResult.status === "rejected" || videosResult.status === "rejected") {
          setError("Some discover content could not be loaded");
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
          setLoadingMedia(false);
        }
      }
    };

    void loadDiscover();

    return () => {
      cancelled = true;
    };
  }, [videoApiSort]);

  useEffect(() => {
    if (activeTab === "models" && !modelsHasMore) return;
    if (activeTab === "videos" && !videosHasMore) return;

    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) return;

      if (activeTab === "models" && !loadingModels && !loadingMoreModels && modelsHasMore) {
        setLoadingMoreModels(true);
        void fetchModelSummaries({ limit: MODELS_BATCH_SIZE, offset: modelsOffset })
          .then((nextModels) => {
            setModels((prev) => {
              const merged = [...prev, ...nextModels];
              const seen = new Set<string>();
              return merged.filter((item) => {
                if (seen.has(item.slug)) return false;
                seen.add(item.slug);
                return true;
              });
            });
            setModelsOffset((prev) => prev + nextModels.length);
            setModelsHasMore(nextModels.length === MODELS_BATCH_SIZE);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Failed to load more models");
          })
          .finally(() => {
            setLoadingMoreModels(false);
          });
      }

      if (activeTab === "videos" && !loadingMedia && !loadingMoreVideos && videosHasMore) {
        const nextPage = videosPage + 1;
        setLoadingMoreVideos(true);
        void fetchVideos({ sort: videoApiSort, page: nextPage, limit: VIDEOS_BATCH_SIZE })
          .then((nextVideos) => {
            setMediaItems((prev) => {
              const merged = [...prev, ...nextVideos];
              const seen = new Set<string>();
              return merged.filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
              });
            });
            setVideosPage(nextPage);
            setVideosHasMore(nextVideos.length === VIDEOS_BATCH_SIZE);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Failed to load more videos");
          })
          .finally(() => {
            setLoadingMoreVideos(false);
          });
      }
    }, { rootMargin: "300px 0px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, loadingMedia, loadingModels, loadingMoreModels, loadingMoreVideos, modelsHasMore, modelsOffset, videoApiSort, videosHasMore, videosPage]);

  const sortedModels = useMemo(
    () => [...models].sort((a, b) => modelScore(b, sortMode) - modelScore(a, sortMode)),
    [models, sortMode]
  );

  const sortedMedia = useMemo(
    () => [...mediaItems].sort((a, b) => videoScore(b, sortMode) - videoScore(a, sortMode)),
    [mediaItems, sortMode]
  );

  const nicheCards = useMemo(
    () => NICHE_TAGS.map((niche) => {
      const key = niche.toUpperCase();
      const video = sortedMedia.find((item) => item.category === key);
      return {
        niche,
        thumbnail: video?.thumbnailUrl || null,
        href: `/search?q=${encodeURIComponent(niche)}`
      };
    }),
    [sortedMedia]
  );

  return (
    <div className="p-4 sm:p-5 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_8%_10%,rgba(255,142,62,0.25),transparent_35%),radial-gradient(circle_at_88%_20%,rgba(56,189,248,0.2),transparent_42%),linear-gradient(140deg,rgba(9,9,13,0.95),rgba(11,15,26,0.95))] p-4 sm:p-6">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Discover</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Find models and clips faster</h1>
          <p className="text-sm text-white/70 mt-2">Browse by model profiles, newest drops, and trending niches in one place.</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <div className="flex gap-2 sm:gap-3 overflow-x-auto custom-scrollbar">
            {TAB_LABELS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 h-10 rounded-full text-sm font-semibold whitespace-nowrap transition-colors border ${
                    active
                      ? "text-white border-white/30 bg-white/10"
                      : "text-white/65 border-transparent hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((prev) => !prev)}
              className="h-10 px-4 rounded-full border border-white/15 bg-black/40 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-white/10 transition-colors"
            >
              Sort by
              <ChevronDown size={16} className={`transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>

            {sortOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-3xl border border-white/15 bg-[#0a0b10] p-2 shadow-2xl z-20">
                {SORT_LABELS.map((option) => {
                  const active = sortMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSortMode(option.key);
                        setSortOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                        active ? "text-white bg-white/10" : "text-white/70 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {(loadingModels || loadingMedia) && <p className="text-sm text-white/60">Loading discover...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loadingModels && !loadingMedia && activeTab === "models" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[2px] sm:gap-3">
          {sortedModels.map((model) => (
            <Link
              key={model.slug}
              to={`/models/${model.slug}`}
              className="group relative overflow-hidden rounded-md sm:rounded-2xl border border-white/10 bg-black/30"
            >
              {model.thumbnailUrl ? (
                <img
                  src={model.thumbnailUrl}
                  alt={model.name}
                  className="w-full aspect-[3/4] object-cover group-hover:scale-[1.04] transition-transform duration-300"
                  loading="lazy"
                  decoding="async"
                  width={320}
                  height={420}
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-black/40" />
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-base sm:text-xl font-semibold leading-tight line-clamp-1">{model.name}</p>
                <p className="text-[11px] sm:text-xs text-white/75 mt-1 line-clamp-1">{model.videoCount} videos · {formatViewCount(model.totalViews)} views</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {model.age ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/25 bg-black/40 text-white/90">{model.age}y</span> : null}
                  {model.bodyMeasurements ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/25 bg-black/40 text-white/90">{model.bodyMeasurements}</span> : null}
                  {model.primaryAccountUsername ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/25 bg-black/40 text-white/90">@{model.primaryAccountUsername}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loadingModels && !loadingMedia && activeTab === "videos" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[2px] sm:gap-3">
          {sortedMedia.map((item) => (
            <Link
              key={item.id}
              to={`/clips/${item.id}`}
              className="group relative overflow-hidden rounded-md sm:rounded-2xl border border-white/10 bg-black/30"
            >
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="w-full aspect-[3/4] object-cover group-hover:scale-[1.04] transition-transform duration-300"
                loading="lazy"
                decoding="async"
                width={320}
                height={420}
              />
              <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 bg-gradient-to-t from-black/85 to-transparent">
                <p className="text-white text-sm font-semibold line-clamp-1">{item.channel.displayName}</p>
                <p className="text-[11px] text-white/70 mt-1">{formatViewCount(item.viewCount)} views</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loadingModels && !loadingMedia && activeTab === "niches" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {nicheCards.map((card, index) => (
            <Link
              key={card.niche}
              to={card.href}
              className="group relative rounded-2xl border border-white/10 overflow-hidden bg-black/30"
              style={{ animationDelay: `${index * 35}ms` }}
            >
              {card.thumbnail ? (
                <img
                  src={card.thumbnail}
                  alt={card.niche}
                  className="w-full aspect-[4/5] object-cover group-hover:scale-[1.04] transition-transform duration-300"
                  loading="lazy"
                  decoding="async"
                  width={360}
                  height={440}
                />
              ) : (
                <div className="w-full aspect-[4/5] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-black/10" />
              )}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 to-transparent">
                <p className="text-white font-semibold text-sm sm:text-base">{card.niche}</p>
                <p className="text-xs text-white/70 mt-1">Explore shorts</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loadingModels && !loadingMedia && (activeTab === "models" || activeTab === "videos") && (
        <div ref={loadMoreRef} className="h-10 flex items-center justify-center text-xs text-white/60">
          {(activeTab === "models" && loadingMoreModels) || (activeTab === "videos" && loadingMoreVideos)
            ? "Loading more..."
            : activeTab === "models"
              ? (modelsHasMore ? "Scroll for more models" : "All models loaded")
              : (videosHasMore ? "Scroll for more videos" : "All videos loaded")}
        </div>
      )}
    </div>
  );
}
