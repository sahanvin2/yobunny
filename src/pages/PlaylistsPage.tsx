import { useEffect, useMemo, useState } from "react";
import VideoGrid from "@/components/video/VideoGrid";
import type { VideoData } from "@/lib/mockData";
import { fetchHistoryVideos, fetchLikedVideos, fetchSavedVideos, isClipLikeVideo, mapApiVideoToVideoData } from "@/lib/api";

type PlaylistTab = "watchLater" | "liked" | "history" | "shorts" | "longs";

export default function PlaylistsPage() {
  const [watchLater, setWatchLater] = useState<VideoData[]>([]);
  const [liked, setLiked] = useState<VideoData[]>([]);
  const [history, setHistory] = useState<VideoData[]>([]);
  const [tab, setTab] = useState<PlaylistTab>("watchLater");

  useEffect(() => {
    void fetchSavedVideos().then(setWatchLater).catch(() => setWatchLater([]));
    void fetchLikedVideos().then(setLiked).catch(() => setLiked([]));
    void fetchHistoryVideos()
      .then((items) => setHistory(items.map((item) => mapApiVideoToVideoData(item.video))))
      .catch(() => setHistory([]));
  }, []);

  const shorts = useMemo(() => {
    const all = [...watchLater, ...liked, ...history];
    const dedup = new Map<string, VideoData>();
    for (const item of all) dedup.set(item.id, item);
    return Array.from(dedup.values()).filter(isClipLikeVideo);
  }, [watchLater, liked, history]);

  const longs = useMemo(() => {
    const all = [...watchLater, ...liked, ...history];
    const dedup = new Map<string, VideoData>();
    for (const item of all) dedup.set(item.id, item);
    return Array.from(dedup.values()).filter((video) => !isClipLikeVideo(video));
  }, [watchLater, liked, history]);

  const currentVideos = tab === "watchLater"
    ? watchLater
    : tab === "liked"
      ? liked
      : tab === "history"
        ? history
        : tab === "shorts"
          ? shorts
          : longs;

  const cards = [
    { id: "watchLater" as const, title: "Watch Later", count: watchLater.length, description: "Saved videos you want to watch next" },
    { id: "liked" as const, title: "Liked Videos", count: liked.length, description: "Videos you liked" },
    { id: "history" as const, title: "History Replay", count: history.length, description: "Videos from your watch history" },
    { id: "shorts" as const, title: "My Shorts Mix", count: shorts.length, description: "Short-form videos from your library" },
    { id: "longs" as const, title: "My Long-form Mix", count: longs.length, description: "Long videos from your library" }
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Playlists</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal library organized by behavior and format.</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setTab(card.id)}
            className={`text-left rounded-2xl border p-4 transition-colors ${tab === card.id ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
          >
            <p className="text-sm font-semibold text-foreground">{card.title}</p>
            <p className="text-2xl font-bold text-foreground mt-2">{card.count}</p>
            <p className="text-xs text-muted-foreground mt-2">{card.description}</p>
          </button>
        ))}
      </div>

      <div>
        {currentVideos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No videos in this playlist yet.</p>
        ) : (
          <VideoGrid videos={currentVideos} />
        )}
      </div>
    </div>
  );
}
