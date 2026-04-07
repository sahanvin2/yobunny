import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchLikedVideos } from "@/lib/api";

export default function LikedPage() {
  const [videos, setVideos] = useState<VideoData[]>([]);

  useEffect(() => {
    fetchLikedVideos().then(setVideos).catch(() => setVideos([]));
  }, []);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Liked Videos</h1>
      {videos.length === 0 ? <p className="text-sm text-muted-foreground">No liked videos yet.</p> : <VideoGrid videos={videos} />}
    </div>
  );
}
