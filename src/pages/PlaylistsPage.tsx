import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PlayCircle } from "lucide-react";
import VideoGrid from "@/components/video/VideoGrid";
import type { VideoData } from "@/lib/mockData";
import { fetchHistoryVideos, fetchLikedVideos, fetchSavedVideos, isClipLikeVideo, mapApiVideoToVideoData } from "@/lib/api";

type PlaylistTab = "watchLater" | "liked" | "history" | "clips" | "longs";

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

  const clips = useMemo(() => {
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
        : tab === "clips"
          ? clips
          : longs;

  const cards = [
    { id: "watchLater" as const, title: "Watch Later", count: watchLater.length, description: "Saved videos you want to watch next" },
    { id: "liked" as const, title: "Liked Videos", count: liked.length, description: "Videos you liked" },
    { id: "history" as const, title: "History Replay", count: history.length, description: "Videos from your watch history" },
    { id: "clips" as const, title: "My Clips Mix", count: clips.length, description: "Short-form videos from your library" },
    { id: "longs" as const, title: "My Long-form Mix", count: longs.length, description: "Long videos from your library" }
  ];

  const playlistPlayer = currentVideos[0] || null;

  return (
    <div className="p-4 lg:p-6 space-y-8">
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

      {playlistPlayer && (
        <section className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 rounded-[2rem] border border-border/60 bg-surface/70 backdrop-blur-md p-4 lg:p-5 shadow-sm">
          <div className="rounded-[1.75rem] overflow-hidden border border-border/60 bg-black relative aspect-[9/16] lg:max-w-[420px] mx-auto w-full">
            <video key={playlistPlayer.id} src={playlistPlayer.hlsBaseUrl} poster={playlistPlayer.thumbnailUrl} controls autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              <PlayCircle size={14} /> Autoplay playlist
            </div>
          </div>
          <div className="space-y-4 py-2 lg:py-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{playlistPlayer.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">Click any playlist card above to switch the active queue.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/watch/${playlistPlayer.id}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground">
                Open full watch page <ChevronRight size={16} />
              </Link>
              <Link to={`/channel/${playlistPlayer.channel.username}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-border text-foreground bg-background hover:bg-surface-hover transition-colors">
                Channel
              </Link>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <p className="text-sm text-muted-foreground">Now playing</p>
              <p className="mt-1 text-sm font-medium text-foreground">{playlistPlayer.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{playlistPlayer.channel.displayName} · {isClipLikeVideo(playlistPlayer) ? "Clip" : "Landscape video"}</p>
            </div>
          </div>
        </section>
      )}

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
