import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchTrendingVideos } from "@/lib/api";

export default function TrendingPage() {
  const [trending, setTrending] = useState<VideoData[]>([]);

  useEffect(() => {
    fetchTrendingVideos().then(setTrending).catch(() => setTrending([]));
  }, []);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Trending</h1>
      {trending.length === 0 ? <p className="text-sm text-muted-foreground">No trending videos yet.</p> : <VideoGrid videos={trending} />}
    </div>
  );
}
