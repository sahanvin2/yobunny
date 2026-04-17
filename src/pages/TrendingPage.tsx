import { useEffect, useState } from "react";
import type { VideoData } from "@/lib/mockData";
import ClipGrid from "@/components/video/ClipGrid";
import { fetchTrendingVideos, isClipLikeVideo } from "@/lib/api";
import { sortShortsVideos } from "@/lib/videoFeed";

export default function TrendingPage() {
  const [trending, setTrending] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingVideos()
      .then((items) => {
        const playable = items.filter((video) => Boolean(video.hlsBaseUrl));
        const clips = playable.filter(isClipLikeVideo);
        const source = clips.length > 0 ? clips : playable;
        setTrending(sortShortsVideos(source));
      })
      .catch(() => setTrending([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-5">
      <h1 className="text-2xl font-semibold text-foreground">Trending</h1>
      {loading && <p className="text-sm text-muted-foreground">Loading trending videos...</p>}
      {!loading && trending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trending videos yet.</p>
      ) : (
        <ClipGrid clips={trending} />
      )}
    </div>
  );
}
