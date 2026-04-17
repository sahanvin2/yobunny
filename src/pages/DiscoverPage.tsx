import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import ClipGrid from "@/components/video/ClipGrid";
import VideoGrid from "@/components/video/VideoGrid";
import { CATEGORIES, formatViewCount, type VideoData } from "@/lib/mockData";
import { fetchModelSummaries, fetchVideos, isClipLikeVideo, type ApiModelSummary } from "@/lib/api";
import { sortFeedVideos } from "@/lib/videoFeed";

const DEFAULT_CATEGORY = "ENTERTAINMENT";

function toCategoryEnum(value: string) {
  return value.toUpperCase().replace(/\s+/g, "_");
}

export default function DiscoverPage() {
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [categoryVideos, setCategoryVideos] = useState<VideoData[]>([]);
  const [models, setModels] = useState<ApiModelSummary[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingCategory(true);
        setError("");
        const videos = await fetchVideos({
          category: selectedCategory,
          sort: "latest",
          page: 1,
          limit: 60
        });

        if (!cancelled) {
          setCategoryVideos(sortFeedVideos(videos, "latest"));
        }
      } catch (err) {
        if (!cancelled) {
          setCategoryVideos([]);
          setError(err instanceof Error ? err.message : "Failed to load category videos");
        }
      } finally {
        if (!cancelled) setLoadingCategory(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setLoadingModels(true);
        const items = await fetchModelSummaries({ q: modelQuery, limit: 30 });
        if (!cancelled) {
          setModels(items);
        }
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [modelQuery]);

  const clips = useMemo(() => categoryVideos.filter((video) => isClipLikeVideo(video)).slice(0, 24), [categoryVideos]);
  const landscape = useMemo(() => categoryVideos.filter((video) => !isClipLikeVideo(video)), [categoryVideos]);

  return (
    <div className="p-4 sm:p-5 lg:p-8 max-w-[1600px] mx-auto space-y-7">
      <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Discover</h1>
            <p className="text-sm text-white/60 mt-1">Explore by category and model tags.</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Go to Home Feed
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Browse Categories</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {CATEGORIES.filter((item) => item !== "All").map((item) => {
            const value = toCategoryEnum(item);
            const active = selectedCategory === value;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedCategory(value)}
                className={`px-4 h-10 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-white text-black border-white"
                    : "bg-black/30 text-white/80 border-white/20 hover:bg-white/10"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Models</h2>
          <input
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="Search models..."
            className="w-[220px] h-10 px-4 rounded-full bg-black/40 border border-white/20 text-sm text-white focus:outline-none focus:border-white/40"
          />
        </div>

        {loadingModels && <p className="text-sm text-white/60">Loading models...</p>}

        {!loadingModels && models.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {models.map((model) => (
              <Link
                key={model.slug}
                to={`/models/${model.slug}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors overflow-hidden"
              >
                {model.thumbnailUrl ? (
                  <img
                    src={model.thumbnailUrl}
                    alt={model.name}
                    className="w-full aspect-[4/5] object-cover"
                    loading="lazy"
                    decoding="async"
                    width={320}
                    height={400}
                  />
                ) : (
                  <div className="w-full aspect-[4/5] bg-black/40" />
                )}
                <div className="p-3">
                  <p className="text-sm font-semibold text-white line-clamp-1">{model.name}</p>
                  <p className="text-xs text-white/65 mt-1">
                    {model.videoCount} videos · {formatViewCount(model.totalViews)} views
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loadingModels && models.length === 0 && (
          <p className="text-sm text-white/55">No models found yet.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{selectedCategory.replace(/_/g, " ")} Shorts</h2>
        {loadingCategory && <p className="text-sm text-white/60">Loading videos...</p>}
        {!loadingCategory && clips.length > 0 && <ClipGrid clips={clips} mode="row" />}
        {!loadingCategory && clips.length === 0 && <p className="text-sm text-white/55">No shorts in this category yet.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{selectedCategory.replace(/_/g, " ")} Videos</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loadingCategory && landscape.length > 0 && <VideoGrid videos={landscape} />}
        {!loadingCategory && !error && landscape.length === 0 && <p className="text-sm text-white/55">No landscape videos in this category yet.</p>}
      </section>
    </div>
  );
}
