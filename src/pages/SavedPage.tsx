import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchSavedVideos } from "@/lib/api";

export default function SavedPage() {
  const [videos, setVideos] = useState<VideoData[]>([]);

  useEffect(() => {
    fetchSavedVideos().then(setVideos).catch(() => setVideos([]));
  }, []);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Saved Videos</h1>
      {videos.length === 0 ? <p className="text-sm text-muted-foreground">No saved videos yet.</p> : <VideoGrid videos={videos} />}
    </div>
  );
}
