import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PlayCircle } from "lucide-react";
import VideoGrid from "@/components/video/VideoGrid";
import type { VideoData } from "@/lib/mockData";
import { API_BASE, fetchHistoryVideos, fetchLikedVideos, fetchSavedVideos, isClipLikeVideo, mapApiVideoToVideoData } from "@/lib/api";

type PlaylistTab = "watchLater" | "liked" | "history" | "clips" | "longs";

export default function PlaylistsPage() {
  const [watchLater, setWatchLater] = useState<VideoData[]>([]);
  const [liked, setLiked] = useState<VideoData[]>([]);
  const [history, setHistory] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PlaylistTab>("watchLater");
  const [activeVideoId, setActiveVideoId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [savedRows, likedRows, historyRows] = await Promise.all([
        fetchSavedVideos().catch(() => [] as VideoData[]),
        fetchLikedVideos().catch(() => [] as VideoData[]),
        fetchHistoryVideos()
          .then((items) => items.map((item) => mapApiVideoToVideoData(item.video)))
          .catch(() => [] as VideoData[])
      ]);

      if (cancelled) return;
      setWatchLater(savedRows);
      setLiked(likedRows);
      setHistory(historyRows);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (currentVideos.length === 0) {
      setActiveVideoId("");
      return;
    }

    if (!activeVideoId || !currentVideos.some((item) => item.id === activeVideoId)) {
      setActiveVideoId(currentVideos[0].id);
    }
  }, [activeVideoId, currentVideos]);

  const cards = [
    { id: "watchLater" as const, title: "Watch Later", count: watchLater.length, description: "Saved videos you want to watch next" },
    { id: "liked" as const, title: "Liked Videos", count: liked.length, description: "Videos you liked" },
    { id: "history" as const, title: "History Replay", count: history.length, description: "Videos from your watch history" },
    { id: "clips" as const, title: "My Clips Mix", count: clips.length, description: "Short-form videos from your library" },
    { id: "longs" as const, title: "My Long-form Mix", count: longs.length, description: "Long videos from your library" }
  ];

  const playlistPlayer = currentVideos.find((item) => item.id === activeVideoId) || currentVideos[0] || null;
  const isActivePortrait = playlistPlayer ? isClipLikeVideo(playlistPlayer) : false;
  const activePlaybackUrl = playlistPlayer ? (playlistPlayer.hlsBaseUrl || `${API_BASE}/videos/${playlistPlayer.id}/stream`) : "";

  useEffect(() => {
    if (!playlistPlayer?.thumbnailUrl) return;

    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "image";
    preload.href = playlistPlayer.thumbnailUrl;
    preload.setAttribute("fetchpriority", "high");
    document.head.appendChild(preload);

    return () => {
      preload.remove();
    };
  }, [playlistPlayer?.id, playlistPlayer?.thumbnailUrl]);

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

      {loading && (
        <div className="rounded-3xl border border-border/60 bg-surface/70 p-8 text-sm text-muted-foreground">Loading playlists...</div>
      )}

      {!loading && playlistPlayer && (
        <section className="grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 rounded-[2rem] border border-border/60 bg-surface/70 backdrop-blur-md p-4 lg:p-5 shadow-sm">
          <div className={`rounded-[1.75rem] overflow-hidden border border-border/60 bg-black relative mx-auto w-full ${isActivePortrait ? "aspect-[9/16] lg:max-w-[380px]" : "aspect-video lg:max-w-[440px]"}`}>
            <video key={playlistPlayer.id} src={activePlaybackUrl} poster={playlistPlayer.thumbnailUrl} controls autoPlay muted playsInline preload="metadata" className={`w-full h-full ${isActivePortrait ? "object-cover" : "object-contain"}`} />
            <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              <PlayCircle size={14} /> Playlist preview
            </div>
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {isActivePortrait ? "Portrait" : "Landscape"}
            </div>
          </div>

          <div className="space-y-4 py-2 lg:py-4 min-w-0">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{playlistPlayer.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">Switch tabs for playlist type, then click any item below to preview it here.</p>
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

            <div className="rounded-2xl border border-border/60 bg-background/60 p-3 max-h-[360px] overflow-y-auto space-y-2">
              {currentVideos.map((item) => {
                const isPortrait = isClipLikeVideo(item);
                const isActive = item.id === playlistPlayer.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveVideoId(item.id)}
                    className={`w-full text-left rounded-xl border p-2 flex gap-3 transition-colors ${isActive ? "border-primary bg-primary/10" : "border-border/60 bg-transparent hover:bg-surface-hover"}`}
                  >
                    <div className={`overflow-hidden rounded-lg bg-black flex-shrink-0 ${isPortrait ? "w-14 h-24" : "w-28 h-16"}`}>
                      <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" width={isPortrait ? 90 : 160} height={isPortrait ? 160 : 90} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{isPortrait ? "Portrait" : "Landscape"}</p>
                    </div>
                  </button>
                );
              })}
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
