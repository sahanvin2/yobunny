import { useEffect, useMemo, useState } from "react";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchAllVideos, isClipLikeVideo } from "@/lib/api";
import { sortFeedVideos } from "@/lib/videoFeed";
import type { VideoData } from "@/lib/mockData";

const MAX_CLIPS = 200;

export default function ClipsPage() {
  const [allVideos, setAllVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const items = await fetchAllVideos({ sort: "latest", limitPerPage: 80, maxPages: 5 });
        const clipsOnly = items.filter(isClipLikeVideo);
        if (!cancelled) setAllVideos(clipsOnly);
      } catch (err) {
        if (!cancelled) {
          setAllVideos([]);
          setError(err instanceof Error ? err.message : "Failed to load clips");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const clips = useMemo(() => sortFeedVideos(allVideos, "popular").slice(0, MAX_CLIPS), [allVideos]);

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1800px] mx-auto">
      <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-white/5 to-transparent pointer-events-none -z-10 rounded-t-[3rem]" />

      <div>
        <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight drop-shadow-md">Explore Clips</h1>
        <p className="text-sm font-medium text-white/50 mt-2">Short-form videos that matter.</p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-32 space-y-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-[3px] border-white/10"></div>
            <div className="absolute inset-0 rounded-full border-[3px] border-white border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-bold text-white/50 tracking-widest uppercase">Loading Clips</p>
        </div>
      )}

      {error && (
        <div className="p-10 rounded-3xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      )}

      {!loading && !error && clips.length === 0 && (
        <div className="p-20 text-center">
          <p className="text-base font-medium text-white/40">No clips available yet.</p>
        </div>
      )}

      {!loading && !error && clips.length > 0 && <ClipGrid clips={clips} />}
    </div>
  );
}
