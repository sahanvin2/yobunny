import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchModelVideos, isClipLikeVideo, type ApiModelProfile } from "@/lib/api";
import { formatViewCount, type VideoData } from "@/lib/mockData";
import { sortFeedVideos } from "@/lib/videoFeed";

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
        const payload = await fetchModelVideos(slug);
        if (!cancelled) {
          setModel(payload.model);
          setItems(sortFeedVideos(payload.items, "latest"));
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

  const shorts = useMemo(() => items.filter((video) => isClipLikeVideo(video)), [items]);

  if (loading) {
    return <div className="p-4 sm:p-6 text-sm text-white/65">Loading model feed...</div>;
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
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.01] overflow-hidden">
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
            <p className="text-xs uppercase tracking-widest text-white/55">Model Profile</p>
            <h1 className="text-3xl font-bold text-white mt-2">{model.name}</h1>
            <p className="text-sm text-white/60 mt-2">Videos from multiple creators tagged with this model.</p>

            <div className="grid grid-cols-3 gap-3 mt-6 max-w-xl">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-xl font-bold text-white">{model.videoCount}</p>
                <p className="text-xs text-white/60">Videos</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-xl font-bold text-white">{model.creatorCount}</p>
                <p className="text-xs text-white/60">Creators</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-xl font-bold text-white">{formatViewCount(model.totalViews)}</p>
                <p className="text-xs text-white/60">Views</p>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Link to="/discover" className="px-4 py-2 rounded-full border border-white/20 text-sm text-white hover:bg-white/10 transition-colors">
                Discover
              </Link>
              <Link to="/search" className="px-4 py-2 rounded-full border border-white/20 text-sm text-white hover:bg-white/10 transition-colors">
                Search
              </Link>
            </div>
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
