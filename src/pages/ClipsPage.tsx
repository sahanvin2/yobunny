import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchVideos, isClipLikeVideo } from "@/lib/api";

export default function ClipsPage() {
  const [clips, setClips] = useState<VideoData[]>([]);

  useEffect(() => {
    fetchVideos({ sort: "latest", page: 1, limit: 50 })
      .then((videos) => setClips(videos.filter(isClipLikeVideo)))
      .catch(() => setClips([]));
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">Clips</h1>
        <p className="text-sm text-muted-foreground">Short-form clips from the latest uploads.</p>
      </div>

      {clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clips are available yet.</p>
      ) : (
        <ClipGrid clips={clips} />
      )}
    </div>
  );
}