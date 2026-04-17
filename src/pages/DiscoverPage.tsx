import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchAllVideos, fetchCreatorSummaries, type ApiCreatorSummary } from "@/lib/api";
import { formatViewCount, type VideoData } from "@/lib/mockData";

type DiscoverTab = "gifs" | "images" | "creators" | "niches";
type SortMode = "trending" | "top_week" | "top_month" | "latest";

const TAB_LABELS: Array<{ key: DiscoverTab; label: string }> = [
  { key: "gifs", label: "GIFs" },
  { key: "images", label: "Images" },
  { key: "creators", label: "Creators" },
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

function creatorScore(item: ApiCreatorSummary, mode: SortMode) {
  if (mode === "latest") return item.videoCount * 5 + item.subscriberCount;
  if (mode === "top_week") return item.videoCount * 8 + item.subscriberCount * 1.2;
  if (mode === "top_month") return item.totalViews * 0.8 + item.videoCount * 4;
  return item.totalViews + item.subscriberCount * 4 + item.videoCount * 15;
}

function videoScore(item: VideoData, mode: SortMode) {
  const ts = new Date(item.publishedAt).getTime() || 0;
  if (mode === "latest") return ts;
  if (mode === "top_week") return item.viewCount * 1.1 + ts * 0.0000001;
  if (mode === "top_month") return item.viewCount + (item.likeCount || 0) * 30;
  return item.viewCount * 1.15 + (item.likeCount || 0) * 35 + ts * 0.00000006;
}

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<DiscoverTab>("creators");
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [sortOpen, setSortOpen] = useState(false);
  const [creators, setCreators] = useState<ApiCreatorSummary[]>([]);
  const [mediaItems, setMediaItems] = useState<VideoData[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDiscover = async () => {
      try {
        setLoadingMedia(true);
        setLoadingCreators(true);
        setError("");
        const [creatorItems, videos] = await Promise.all([
          fetchCreatorSummaries({ limit: 60 }),
          fetchAllVideos({ sort: "views", limitPerPage: 60, maxPages: 2 })
        ]);
        if (!cancelled) {
          const playable = videos.filter((item) => Boolean(item.hlsBaseUrl));
          setCreators(creatorItems);
          setMediaItems(playable.length > 0 ? playable : videos);
        }
      } catch (err) {
        if (!cancelled) {
          setCreators([]);
          setMediaItems([]);
          setError(err instanceof Error ? err.message : "Failed to load creators");
        }
      } finally {
        if (!cancelled) {
          setLoadingCreators(false);
          setLoadingMedia(false);
        }
      }
    };

    void loadDiscover();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedCreators = useMemo(
    () => [...creators].sort((a, b) => creatorScore(b, sortMode) - creatorScore(a, sortMode)),
    [creators, sortMode]
  );

  const sortedMedia = useMemo(
    () => [...mediaItems].sort((a, b) => videoScore(b, sortMode) - videoScore(a, sortMode)),
    [mediaItems, sortMode]
  );

  const gifVideos = useMemo(
    () => sortedMedia.filter((video) => (video.tags || []).some((tag) => tag.toLowerCase().includes("gif"))).slice(0, 40),
    [sortedMedia]
  );

  const imageLikeVideos = useMemo(
    () => sortedMedia.filter((video) => !gifVideos.some((gif) => gif.id === video.id)).slice(0, 40),
    [gifVideos, sortedMedia]
  );

  return (
    <div className="p-4 sm:p-5 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-4 sm:p-6">
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

      {(loadingCreators || loadingMedia) && <p className="text-sm text-white/60">Loading discover...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loadingCreators && !loadingMedia && !error && activeTab === "creators" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[2px] sm:gap-3">
          {sortedCreators.map((creator) => (
            <Link
              key={creator.id}
              to={`/channel/${creator.username}`}
              className="group relative overflow-hidden rounded-md sm:rounded-2xl border border-white/10 bg-black/30"
            >
              {creator.previewThumbnailUrl ? (
                <img
                  src={creator.previewThumbnailUrl}
                  alt={creator.displayName}
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
                <p className="text-white text-base sm:text-xl font-semibold leading-tight line-clamp-1">{creator.displayName}</p>
                <p className="text-[11px] sm:text-xs text-white/75 mt-1 line-clamp-1">{formatViewCount(creator.totalViews)} views</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loadingCreators && !loadingMedia && !error && activeTab === "gifs" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[2px] sm:gap-3">
          {(gifVideos.length > 0 ? gifVideos : sortedMedia.slice(0, 40)).map((item) => (
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
                <p className="text-[11px] text-white/70 mt-1">Video</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {!loadingCreators && !loadingMedia && !error && activeTab === "images" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[2px] sm:gap-3">
          {imageLikeVideos.map((item) => (
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

      {!loadingCreators && !loadingMedia && !error && activeTab === "niches" && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {NICHE_TAGS.map((niche, index) => (
            <Link
              key={niche}
              to={`/search?q=${encodeURIComponent(niche)}`}
              className="rounded-2xl border border-white/10 p-4 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-black/10 hover:from-white/[0.14] hover:via-white/[0.07] transition-colors"
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <p className="text-white font-semibold text-sm sm:text-base">{niche}</p>
              <p className="text-xs text-white/60 mt-1">Explore creators and shorts</p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
