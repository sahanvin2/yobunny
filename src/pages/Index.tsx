import { useEffect, useState } from "react";
import CategoryBar from "@/components/layout/CategoryBar";
import VideoGrid from "@/components/video/VideoGrid";
import ClipGrid from "@/components/video/ClipGrid";
import type { VideoData } from "@/lib/mockData";
import { fetchVideos, isAutoClipVideo, isClipLikeVideo } from "@/lib/api";

export default function HomePage() {
  const [category, setCategory] = useState("All");
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [clips, setClips] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [error, setError] = useState("");
  const [clipsError, setClipsError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchVideos({ category, sort: "latest", page: 1, limit: 40 });
        if (!cancelled) setVideos(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load videos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    let cancelled = false;

    const loadClips = async () => {
      try {
        setClipsLoading(true);
        setClipsError("");
        const data = await fetchVideos({ sort: "latest", page: 1, limit: 50 });
        if (!cancelled) {
          setClips(data.filter(isClipLikeVideo));
        }
      } catch (err) {
        if (!cancelled) {
          setClipsError(err instanceof Error ? err.message : "Failed to load clips");
        }
      } finally {
        if (!cancelled) setClipsLoading(false);
      }
    };

    void loadClips();
    return () => {
      cancelled = true;
    };
  }, []);

  const regularVideos = videos.filter((video) => !isClipLikeVideo(video));
  const topRowsVideos = regularVideos.slice(0, 12);
  const bottomRowsVideos = regularVideos.slice(12);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <CategoryBar selected={category} onSelect={setCategory} />
      {loading && <p className="text-sm text-muted-foreground">Loading videos...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && topRowsVideos.length === 0 && <p className="text-sm text-muted-foreground">No videos yet.</p>}
      {!loading && !error && topRowsVideos.length > 0 && <VideoGrid videos={topRowsVideos} />}

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clips</h2>
        {clipsLoading && <p className="text-sm text-muted-foreground">Loading clips...</p>}
        {clipsError && <p className="text-sm text-destructive">{clipsError}</p>}
        {!clipsLoading && !clipsError && clips.length === 0 && (
          <p className="text-sm text-muted-foreground">No clips yet. Upload a portrait video under 1 minute.</p>
        )}
        {!clipsLoading && !clipsError && clips.length > 0 && <ClipGrid clips={clips.slice(0, 12)} />}
      </div>

      {!loading && !error && bottomRowsVideos.length > 0 && (
        <div className="pt-6 mt-4 border-t border-white/10">
          <h2 className="text-lg font-semibold text-foreground mb-6">More Videos</h2>
          <VideoGrid videos={bottomRowsVideos} />
        </div>
      )}
    </div>
  );
}
