import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchModelVideos, type ApiModelProfile } from "@/lib/api";
import { formatViewCount, type VideoData } from "@/lib/mockData";
import { sortFeedVideos, sortShortsVideos } from "@/lib/videoFeed";

const MODEL_SLUG_ALIASES: Record<string, string[]> = {
  "leia-von": ["cherry-moon"],
  "cherry-moon": ["leia-von"]
};

export default function ModelPage() {
  const { slug = "" } = useParams();
  const [model, setModel] = useState<ApiModelProfile | null>(null);
  const [items, setItems] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        try {
          const payload = await fetchModelVideos(slug);
          if (!cancelled) {
            setModel(payload.model);
            setItems(sortFeedVideos(payload.items, "latest"));
          }
          return;
        } catch {
          const aliases = MODEL_SLUG_ALIASES[slug] || [];
          for (const alias of aliases) {
            try {
              const payload = await fetchModelVideos(alias);
              if (!cancelled) {
                setModel(payload.model);
                setItems(sortFeedVideos(payload.items, "latest"));
              }
              return;
            } catch {
              // Continue fallback attempts.
            }
          }
          throw new Error("Model not found");
        }
      } catch (err) {
        if (!cancelled) {
          setModel(null);
          setItems([]);
          setError(err instanceof Error ? err.message : "Failed to load model page");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (slug) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const shorts = useMemo(() => sortShortsVideos(items), [items]);

  if (loading) {
    return <div className="p-4 sm:p-6 text-sm text-white/65">Loading model profile...</div>;
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-sm text-red-400">{error}</p>
        <Link to="/discover" className="text-sm text-white underline underline-offset-4">Back to discover</Link>
      </div>
    );
  }

  if (!model) {
    return <div className="p-4 sm:p-6 text-sm text-white/65">Model not found.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(255,134,76,0.22),transparent_38%),radial-gradient(circle_at_80%_30%,rgba(79,172,254,0.18),transparent_40%),linear-gradient(145deg,rgba(12,12,16,0.95),rgba(5,6,12,0.98))] overflow-hidden">
        <div className="grid md:grid-cols-[280px_1fr] gap-0">
          <div className="bg-black/40 min-h-[220px]">
            {model.thumbnailUrl ? (
              <img
                src={model.thumbnailUrl}
                alt={model.name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                width={480}
                height={640}
              />
            ) : (
              <div className="h-full min-h-[220px]" />
            )}
          </div>
          <div className="p-6 lg:p-8">
            <p className="text-xs uppercase tracking-widest text-white/65">Model Profile</p>
            <h1 className="text-3xl font-bold text-white mt-2">{model.name}</h1>
            <p className="text-sm text-white/75 mt-2">Videos tagged with this model profile.</p>

            <div className="grid grid-cols-3 gap-3 mt-6 max-w-xl">
              <div className="rounded-2xl border border-white/15 bg-black/35 p-3 text-center">
                <p className="text-xl font-bold text-white">{model.videoCount}</p>
                <p className="text-xs text-white/60">Videos</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-black/35 p-3 text-center">
                <p className="text-xl font-bold text-white">{model.creatorCount}</p>
                <p className="text-xs text-white/60">Creators</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-black/35 p-3 text-center">
                <p className="text-xl font-bold text-white">{formatViewCount(model.totalViews)}</p>
                <p className="text-xs text-white/60">Views</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/85">
              <span className="px-3 py-1.5 rounded-full border border-white/20 bg-black/30">Age: {model.age ?? "N/A"}</span>
              <span className="px-3 py-1.5 rounded-full border border-white/20 bg-black/30">Measurements: {model.bodyMeasurements || "N/A"}</span>
              <span className="px-3 py-1.5 rounded-full border border-white/20 bg-black/30">Height: {model.height || "N/A"}</span>
              {model.primaryAccountUsername ? (
                <span className="px-3 py-1.5 rounded-full border border-white/20 bg-black/30">@{model.primaryAccountUsername}</span>
              ) : null}
            </div>

            {model.profileBio ? <p className="text-sm text-white/70 mt-4 line-clamp-2">{model.profileBio}</p> : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Videos</h2>
        {shorts.length === 0 ? (
          <p className="text-sm text-white/60">No videos tagged for this model yet.</p>
        ) : (
          <ClipGrid clips={shorts} />
        )}
      </section>
    </div>
  );
}
