import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchCreatorSummaries, type ApiCreatorSummary } from "@/lib/api";
import { CATEGORIES, formatViewCount } from "@/lib/mockData";

const DEFAULT_CATEGORY = "ENTERTAINMENT";

function toCategoryEnum(value: string) {
  return value.toUpperCase().replace(/\s+/g, "_");
}

export default function DiscoverPage() {
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [creators, setCreators] = useState<ApiCreatorSummary[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCreators = async () => {
      try {
        setLoadingCreators(true);
        setError("");
        const items = await fetchCreatorSummaries({ category: selectedCategory, limit: 30 });
        if (!cancelled) {
          setCreators(items);
        }
      } catch (err) {
        if (!cancelled) {
          setCreators([]);
          setError(err instanceof Error ? err.message : "Failed to load creators");
        }
      } finally {
        if (!cancelled) setLoadingCreators(false);
      }
    };

    void loadCreators();

    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  return (
    <div className="p-4 sm:p-5 lg:p-8 max-w-[1600px] mx-auto space-y-7">
      <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Discover</h1>
            <p className="text-sm text-white/60 mt-1">Browse categories and creators.</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Back to Home
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Categories</h2>
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
        <h2 className="text-lg font-semibold text-white">Creators</h2>
        {loadingCreators && <p className="text-sm text-white/60">Loading creators...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loadingCreators && creators.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {creators.map((creator) => (
              <Link
                key={creator.id}
                to={`/channel/${creator.username}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors overflow-hidden"
              >
                {creator.previewThumbnailUrl ? (
                  <img
                    src={creator.previewThumbnailUrl}
                    alt={creator.displayName}
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
                  <div className="flex items-center gap-2">
                    <img
                      src={creator.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"}
                      alt={creator.displayName}
                      className="w-6 h-6 rounded-full object-cover"
                      loading="lazy"
                      decoding="async"
                      width={24}
                      height={24}
                    />
                    <p className="text-sm font-semibold text-white line-clamp-1">{creator.displayName}</p>
                  </div>
                  <p className="text-xs text-white/65 mt-2">
                    {creator.videoCount} videos · {formatViewCount(creator.totalViews)} views
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loadingCreators && !error && creators.length === 0 && (
          <p className="text-sm text-white/55">No creators found for this category yet.</p>
        )}
      </section>
    </div>
  );
}
