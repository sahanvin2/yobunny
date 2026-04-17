import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bookmark, Facebook, Heart, Link as LinkIcon, MessageCircle, MoreVertical, Share2, Twitter, X } from "lucide-react";
import { API_BASE, addComment, fetchVideoComments, fetchVideos, isClipLikeVideo, partitionVideosByFormat, toggleLike, toggleSave } from "@/lib/api";
import { formatRelativeTime, formatViewCount, type CommentData, type VideoData } from "@/lib/mockData";
import { sortShortsVideos } from "@/lib/videoFeed";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import HlsVideoPlayer from "@/components/video/HlsVideoPlayer";

type OverlayPanel =
  | { type: "none" }
  | { type: "comments"; videoId: string }
  | { type: "share"; videoId: string }
  | { type: "more"; videoId: string };

const MODEL_TAG_PREFIX = "__MODEL__:";

function normalizeModelSlug(raw: string) {
  const normalized = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized === "cherry-moon") {
    return "leia-von";
  }
  return normalized;
}

function modelNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPrimaryModel(video: VideoData) {
  const modelTag = (video.tags || []).find((tag) => String(tag).startsWith(MODEL_TAG_PREFIX));
  if (!modelTag) return null;
  const slug = normalizeModelSlug(String(modelTag).slice(MODEL_TAG_PREFIX.length));
  if (!slug) return null;
  return { slug, name: modelNameFromSlug(slug) };
}

export default function ClipsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openAuthModal } = useAuthModal();
  const PAGE_SIZE = 40;

  const [clips, setClips] = useState<VideoData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const gridSentinelRef = useRef<HTMLDivElement | null>(null);
  const playerSentinelRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const didJumpToInitialRef = useRef(false);
  const [activeVideoId, setActiveVideoId] = useState<string>(id || "");
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const [savedById, setSavedById] = useState<Record<string, boolean>>({});
  const [commentsById, setCommentsById] = useState<Record<string, CommentData[]>>({});
  const [commentInputById, setCommentInputById] = useState<Record<string, string>>({});
  const [sourceById, setSourceById] = useState<Record<string, string>>({});
  const [fallbackTriedById, setFallbackTriedById] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<OverlayPanel>({ type: "none" });
  const [playerReady, setPlayerReady] = useState(!Boolean(id));

  const isPlayerMode = true;

  const loadPage = useCallback(async (nextPage: number, replace = false) => {
    try {
      if (replace) {
        setLoading(true);
        setStatus("");
      } else {
        setLoadingMore(true);
      }

      const items = await fetchVideos({
        sort: "latest",
        page: nextPage,
        limit: PAGE_SIZE
      });

      const tagBasedPortraits = items.filter((item) => isClipLikeVideo(item));
      const portraitItems = tagBasedPortraits.length > 0
        ? tagBasedPortraits
        : (await partitionVideosByFormat(items)).clips;
      const cleanPortraits = portraitItems.filter((item) => Boolean(item.hlsBaseUrl));
      const fallbackPlayable = items.filter((item) => Boolean(item.hlsBaseUrl));
      const sourceItems = cleanPortraits.length > 0 ? cleanPortraits : fallbackPlayable;

      setClips((prev) => {
        const base = replace ? [] : prev;
        const seen = new Set(base.map((item) => item.id));
        const merged = [...base];
        for (const item of sourceItems) {
          if (seen.has(item.id)) continue;
          merged.push(item);
          seen.add(item.id);
        }

        setSourceById((prevSources) => {
          const nextSources = { ...prevSources };
          for (const item of sourceItems) {
            if (!nextSources[item.id] && item.hlsBaseUrl) {
              nextSources[item.id] = item.hlsBaseUrl;
            }
          }
          return nextSources;
        });

        return sortShortsVideos(merged);
      });

      setPage(nextPage);
      setHasMore(items.length === PAGE_SIZE);
    } catch {
      if (replace) {
        setClips([]);
      }
      setStatus("Failed to load clips");
    } finally {
      if (replace) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    if (!id || loading || loadingMore || !hasMore) return;
    if (clips.some((item) => item.id === id)) return;
    void loadPage(page + 1);
  }, [id, clips, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!isPlayerMode || !id) {
      setPlayerReady(true);
      return;
    }

    didJumpToInitialRef.current = false;
    setPlayerReady(false);
  }, [id, isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode || !id) return;

    if (clips.some((item) => item.id === id)) {
      setPlayerReady(true);
      return;
    }

    if (!loading && !loadingMore && !hasMore) {
      setStatus("Clip not found");
      window.setTimeout(() => setStatus(""), 1500);
      navigate("/clips", { replace: true });
    }
  }, [clips, hasMore, id, isPlayerMode, loading, loadingMore, navigate]);

  useEffect(() => {
    if (!gridSentinelRef.current || isPlayerMode) return;
    const node = gridSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void loadPage(page + 1);
      },
      { rootMargin: "1200px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isPlayerMode, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!playerSentinelRef.current || !isPlayerMode) return;
    const node = playerSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void loadPage(page + 1);
      },
      { rootMargin: "900px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isPlayerMode, hasMore, loading, loadingMore, loadPage, page]);

  useEffect(() => {
    if (!playerReady) return;
    if (!isPlayerMode || !id) return;
    const target = cardRefs.current[id];
    if (!target) return;
    target.scrollIntoView({ behavior: didJumpToInitialRef.current ? "smooth" : "auto", block: "start" });
    didJumpToInitialRef.current = true;
    setActiveVideoId(id);
  }, [id, isPlayerMode, clips.length, playerReady]);

  useEffect(() => {
    if (!isPlayerMode) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const videoId = element.dataset.videoId;
          if (!videoId) return;

          const videoEl = videoRefs.current[videoId];
          if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
            setActiveVideoId(videoId);
            if (id !== videoId) {
              navigate(`/clips/${videoId}`, { replace: true });
            }
            if (videoEl) {
              void videoEl.play().catch(() => undefined);
            }
          } else if (videoEl) {
            videoEl.pause();
          }
        });
      },
      {
        threshold: [0.35, 0.72, 0.95]
      }
    );

    Object.entries(cardRefs.current).forEach(([, node]) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [clips, id, isPlayerMode, navigate]);

  const onShare = useCallback(async (videoId: string) => {
    const url = `${window.location.origin}/clips/${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Copy failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const openShare = useCallback((videoId: string) => {
    setPanel({ type: "share", videoId });
  }, []);

  const openMore = useCallback((videoId: string) => {
    setPanel({ type: "more", videoId });
  }, []);

  const openComments = useCallback(async (videoId: string) => {
    setPanel({ type: "comments", videoId });
    if (commentsById[videoId]) return;

    try {
      const rows = await fetchVideoComments(videoId);
      setCommentsById((prev) => ({ ...prev, [videoId]: rows }));
    } catch {
      setCommentsById((prev) => ({ ...prev, [videoId]: [] }));
      setStatus("Failed to load comments");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [commentsById]);

  const onLike = useCallback(async (videoId: string) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }

    try {
      const result = await toggleLike(videoId);
      setLikedById((prev) => ({ ...prev, [videoId]: result.liked }));
    } catch {
      setStatus("Like failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [openAuthModal]);

  const onSave = useCallback(async (videoId: string) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }

    try {
      const result = await toggleSave(videoId);
      setSavedById((prev) => ({ ...prev, [videoId]: result.saved }));
      setStatus(result.saved ? "Saved" : "Removed from saved");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Save failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [openAuthModal]);

  const onSubmitComment = useCallback(async (videoId: string) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }

    const body = (commentInputById[videoId] || "").trim();
    if (!body) return;

    try {
      await addComment(videoId, body);
      const rows = await fetchVideoComments(videoId);
      setCommentsById((prev) => ({ ...prev, [videoId]: rows }));
      setCommentInputById((prev) => ({ ...prev, [videoId]: "" }));
      setStatus("Comment posted");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Comment failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [commentInputById, openAuthModal]);

  const onVideoError = useCallback((videoId: string) => {
    if (fallbackTriedById[videoId]) {
      setStatus("Playback unavailable");
      window.setTimeout(() => setStatus(""), 1500);
      return;
    }

    setFallbackTriedById((prev) => ({ ...prev, [videoId]: true }));
    setSourceById((prev) => ({ ...prev, [videoId]: `${API_BASE}/videos/${videoId}/playable` }));
  }, [fallbackTriedById]);

  const onTogglePlay = useCallback((videoId: string) => {
    const videoEl = videoRefs.current[videoId];
    if (!videoEl) return;
    if (videoEl.paused) {
      void videoEl.play().catch(() => undefined);
    } else {
      videoEl.pause();
    }
  }, []);

  const shorts = useMemo(() => clips.filter((item) => Boolean(item.hlsBaseUrl)), [clips]);

  if (loading) {
    return <div className="p-4 lg:p-6 text-sm text-muted-foreground">Loading clips...</div>;
  }

  if (shorts.length === 0) {
    return <div className="p-4 lg:p-6 text-sm text-muted-foreground">No clips available yet.</div>;
  }

  if (!playerReady) {
    return <div className="p-4 lg:p-6 text-sm text-muted-foreground">Opening selected clip...</div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top,rgba(22,22,22,0.9),rgba(0,0,0,1)_60%)] text-white py-6">
      <div className="space-y-6">
        {shorts.map((video) => {
          const isActive = activeVideoId === video.id;
          const primaryModel = getPrimaryModel(video);
          return (
            <section
              key={video.id}
              data-video-id={video.id}
              ref={(node) => {
                cardRefs.current[video.id] = node;
              }}
              className="min-h-[76vh] flex items-center justify-center px-2 sm:px-4"
            >
              <div className="relative w-full max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                <HlsVideoPlayer
                  ref={(node) => {
                    videoRefs.current[video.id] = node;
                  }}
                  src={sourceById[video.id] || video.hlsBaseUrl}
                  poster={video.thumbnailUrl}
                  controls={false}
                  autoPlay={isActive}
                  muted
                  playsInline
                  preload={isActive ? "auto" : "metadata"}
                  onClick={() => onTogglePlay(video.id)}
                  onError={() => onVideoError(video.id)}
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/70 via-transparent to-black/80" />

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  {primaryModel ? (
                    <Link to={`/models/${primaryModel.slug}`} className="text-sm font-semibold text-white/95 hover:text-white">
                      {primaryModel.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-white/95">{video.channel.displayName}</span>
                  )}
                  <p className="text-sm text-white mt-1 line-clamp-2">{video.title}</p>
                  <p className="text-xs text-white/70 mt-1">{formatViewCount(video.viewCount)} views • {formatRelativeTime(video.publishedAt)}</p>
                </div>

                <aside className="absolute right-3 bottom-[12%] flex flex-col gap-4 items-center z-10 transition-opacity duration-300">
                  <button
                    type="button"
                    onClick={() => void onLike(video.id)}
                    className={`h-[46px] w-[46px] rounded-full border border-white/25 inline-flex items-center justify-center transition-all ${likedById[video.id] ? "bg-white text-black scale-105" : "bg-black/20 hover:bg-black/40 text-white hover:scale-105"}`}
                    title="Like"
                  >
                    <Heart size={21} className={likedById[video.id] ? "fill-black" : ""} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void openComments(video.id)}
                    className="h-[46px] w-[46px] rounded-full border border-white/25 bg-black/20 hover:bg-black/40 inline-flex items-center justify-center transition-all text-white hover:scale-105"
                    title="Comments"
                  >
                    <MessageCircle size={21} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(video.id)}
                    className={`h-[46px] w-[46px] rounded-full border border-white/25 inline-flex items-center justify-center transition-all ${savedById[video.id] ? "bg-white text-black scale-105" : "bg-black/20 hover:bg-black/40 text-white hover:scale-105"}`}
                    title="Save"
                  >
                    <Bookmark size={21} className={savedById[video.id] ? "fill-black" : ""} />
                  </button>
                  <button type="button" onClick={() => openShare(video.id)} className="h-[46px] w-[46px] rounded-full border border-white/25 bg-black/20 hover:bg-black/40 inline-flex items-center justify-center transition-all text-white hover:scale-105" title="Share">
                    <Share2 size={21} />
                  </button>
                  <button type="button" onClick={() => openMore(video.id)} className="h-[46px] w-[46px] rounded-full border border-white/25 bg-black/20 hover:bg-black/40 inline-flex items-center justify-center transition-all text-white hover:scale-105" title="More">
                    <MoreVertical size={21} />
                  </button>
                </aside>

                {panel.type !== "none" && panel.videoId === video.id && (
                  <div className="absolute inset-0 z-50 bg-black/60 flex flex-col justify-end backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setPanel({ type: "none" }); }}>
                    <div className="bg-[#0d0d0d] max-h-[75%] rounded-t-3xl border-t border-white/10 p-4 overflow-y-auto shadow-[0_-20px_40px_rgba(0,0,0,0.8)] custom-scrollbar" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-between mb-4 sticky top-0 bg-[#0d0d0d] pb-2 z-10">
                        <h3 className="text-sm font-semibold text-white">
                          {panel.type === "comments" ? "Comments" : panel.type === "share" ? "Share" : "More"}
                        </h3>
                        <button type="button" className="h-8 w-8 rounded-full bg-white/10 inline-flex items-center justify-center hover:bg-white/20 transition-colors" onClick={() => setPanel({ type: "none" })}>
                          <X size={16} />
                        </button>
                      </div>

                      {panel.type === "comments" && (
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <input
                              value={commentInputById[panel.videoId] || ""}
                              onChange={(event) => setCommentInputById((prev) => ({ ...prev, [panel.videoId]: event.target.value }))}
                              placeholder="Add a comment"
                              className="flex-1 h-10 px-3 rounded-xl border border-white/15 bg-black/40 text-sm text-white focus:outline-none focus:border-white/30"
                              onKeyDown={(e) => { if (e.key === "Enter") void onSubmitComment(panel.videoId); }}
                            />
                            <button
                              type="button"
                              onClick={() => void onSubmitComment(panel.videoId)}
                              className="h-10 px-4 rounded-xl bg-white hover:bg-white/90 text-black text-sm font-semibold transition-colors"
                            >
                              Post
                            </button>
                          </div>

                          <div className="space-y-3 pb-4">
                            {(commentsById[panel.videoId] || []).map((comment) => (
                              <div key={comment.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-sm text-white/95">{comment.body}</p>
                                <p className="text-[11px] text-white/50 mt-1.5 flex items-center gap-1.5">
                                  <span className="font-medium text-white/70">@{comment.user.username}</span> 
                                  <span>•</span>
                                  <span>{formatRelativeTime(comment.createdAt)}</span>
                                </p>
                              </div>
                            ))}
                            {(commentsById[panel.videoId] || []).length === 0 && (
                              <div className="text-center py-6 text-sm text-white/40">No comments yet. Be the first!</div>
                            )}
                          </div>
                        </div>
                      )}

                      {panel.type === "share" && (
                        <div className="space-y-4 pb-4">
                          <p className="text-xs text-white/50 mb-2">Share this clip to your favorite platforms</p>
                          <div className="flex gap-3 justify-center">
                            <a
                              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + "/clips/" + panel.videoId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-12 h-12 rounded-full bg-blue-600 text-white inline-flex items-center justify-center hover:scale-110 transition-transform"
                            >
                              <Facebook size={20} />
                            </a>
                            <a
                              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.origin + "/clips/" + panel.videoId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-12 h-12 rounded-full bg-black text-white inline-flex items-center justify-center border border-white/20 hover:scale-110 transition-transform"
                            >
                              <Twitter size={20} />
                            </a>
                            <button type="button" onClick={() => void onShare(panel.videoId)} className="w-12 h-12 rounded-full bg-white/10 text-white inline-flex items-center justify-center border border-white/20 hover:scale-110 transition-transform">
                              <LinkIcon size={20} />
                            </button>
                          </div>
                        </div>
                      )}

                      {panel.type === "more" && (
                        <div className="space-y-2 pb-4">
                          <button type="button" className="w-full h-11 rounded-xl border border-white/10 bg-white/5 text-sm text-white/90 hover:bg-white/10 transition-colors text-left px-4" onClick={() => { setStatus("Added to watch later"); setPanel({ type: "none" }); window.setTimeout(() => setStatus(""), 1200); }}>
                            Add to watch later
                          </button>
                          <button type="button" className="w-full h-11 rounded-xl border border-white/10 bg-white/5 text-sm text-white/90 hover:bg-white/10 transition-colors text-left px-4" onClick={() => { setStatus("We will show less like this"); setPanel({ type: "none" }); window.setTimeout(() => setStatus(""), 1200); }}>
                            Not interested
                          </button>
                          <button type="button" className="w-full h-11 rounded-xl border border-white/10 bg-white/5 text-sm text-white/90 hover:bg-white/10 transition-colors text-left px-4 text-red-400" onClick={() => { setStatus("Reported"); setPanel({ type: "none" }); window.setTimeout(() => setStatus(""), 1200); }}>
                            Report
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <div ref={playerSentinelRef} className="h-2 w-full" aria-hidden="true" />
        {loadingMore && <p className="py-4 text-center text-xs text-white/60">Loading more clips...</p>}
        <div className="mx-auto max-w-[360px] px-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/clips")}
              className="px-4 py-2 rounded-full bg-black/60 border border-white/20 text-xs font-semibold text-white hover:bg-black/80 transition-colors backdrop-blur-md"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate("/discover")}
              className="px-3 py-2 rounded-full bg-black/60 border border-white/20 text-xs font-semibold hover:bg-black/75"
            >
              Discover
            </button>
          </div>
        </div>
        {status && <p className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm text-white font-medium bg-black/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 shadow-2xl z-50">{status}</p>}


      </div>
    </div>
  );
}
