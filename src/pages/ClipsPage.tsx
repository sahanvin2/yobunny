import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchAllVideos, partitionVideosByFormat } from "@/lib/api";

export default function ClipsPage() {
  const [clips, setClips] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const videos = await fetchAllVideos({ sort: "latest" });
        const { clips: clipItems } = await partitionVideosByFormat(videos);
        if (!cancelled) {
          setClips(clipItems);
        }
      } catch (err) {
        if (!cancelled) {
          setClips([]);
          setError(err instanceof Error ? err.message : "Failed to load clips");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">Clips</h1>
        <p className="text-sm text-muted-foreground">Portrait videos from the latest uploads. Total: {clips.length}</p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading clips...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clips are available yet.</p>
      ) : (
        !loading && !error && <ClipGrid clips={clips} />
      )}
    </div>
  );
}