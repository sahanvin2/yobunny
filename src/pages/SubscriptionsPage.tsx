import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchTrendingVideos } from "@/lib/api";

export default function SubscriptionsPage() {
  const [videos, setVideos] = useState<VideoData[]>([]);

  useEffect(() => {
    fetchTrendingVideos().then(setVideos).catch(() => setVideos([]));
  }, []);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Subscriptions</h1>
      {videos.length === 0 ? <p className="text-sm text-muted-foreground">No subscription uploads yet.</p> : <VideoGrid videos={videos} />}
    </div>
  );
}
