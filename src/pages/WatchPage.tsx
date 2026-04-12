import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ThumbsUp,
  Bookmark,
  Share2,
  Download,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Settings,
  Captions,
  Repeat,
  Facebook,
  Twitter,
  MessageCircle,
  Link as LinkIcon,
  Maximize,
  MoreVertical,
  Clock,
  MinusCircle,
  UserX,
  AlertCircle,
  MoreHorizontal,
  Plus,
  Code,
  Copy,
  RotateCcw,
  RotateCw
} from "lucide-react";
import {
  formatViewCount,
  formatRelativeTime,
  formatDuration,
  formatSubscriberCount,
  type CommentData,
  type VideoData
} from "@/lib/mockData";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import {
  API_BASE,
  addComment,
  fetchAllVideos,
  fetchTrendingVideos,
  fetchVideoById,
  fetchVideoComments,
  fetchDownloadUrl,
  fetchVideoInteractions,
  partitionVideosByFormat,
  reportVideoWatch,
  toggleLike,
  toggleSave,
  isClipLikeVideo
} from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";

const FALLBACK_VIDEO: VideoData = {
  id: "empty",
  title: "Video not found",
  thumbnailUrl: "https://placehold.co/640x360/111111/ffffff?text=YoBunny",
  duration: 0,
  viewCount: 0,
  publishedAt: new Date().toISOString(),
  category: "Entertainment",
  tags: [],
  channel: {
    username: "unknown",
    displayName: "Unknown",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff",
    subscriberCount: 0,
    isVerified: false
  }
};

const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff";
const FALLBACK_THUMBNAIL = "https://placehold.co/640x360/111111/ffffff?text=YoBunny";
const RECOMMENDED_TARGET = 220;

function mergeUniqueById(...lists: VideoData[][]) {
  const out: VideoData[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  return out;
}

export default function WatchPage() {
  const { id } = useParams();
  const { openAuthModal } = useAuthModal();
  const isMobile = useIsMobile();

  const [video, setVideo] = useState<VideoData>(FALLBACK_VIDEO);
  const [playbackCandidates, setPlaybackCandidates] = useState<string[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const [signedFallbackTried, setSignedFallbackTried] = useState(false);
  const [recommended, setRecommended] = useState<VideoData[]>([]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const [liked, setLiked] = useState(false);
  const [likedAnimating, setLikedAnimating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [abEnabled, setAbEnabled] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [openRecommendedMenuId, setOpenRecommendedMenuId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const wasPlayingRef = useRef(false);
  const lastWatchReportRef = useRef(0);
  const lastWatchReportSentAtRef = useRef(0);

  const likeCount = useMemo(() => Math.max(0, Math.floor(video.viewCount * 0.04) + (liked ? 1 : 0)), [video.viewCount, liked]);
  const currentPlaybackUrl = playbackCandidates[playbackIndex] || "";

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [videoDetails, trending, latestPool, apiComments, interactions] = await Promise.all([
          fetchVideoById(id),
          fetchTrendingVideos(),
          fetchAllVideos({ sort: "latest", limitPerPage: 40, maxPages: 4 }),
          fetchVideoComments(id),
          fetchVideoInteractions(id).catch(() => ({ liked: false, saved: false }))
        ]);

        if (cancelled) return;

        setVideo(videoDetails.video);
        const candidates = [
          videoDetails.playbackUrl,
          `${API_BASE}/videos/${id}/stream`
        ].filter((item, index, arr): item is string => Boolean(item) && arr.indexOf(item) === index);

        setPlaybackCandidates(candidates);
        setPlaybackIndex(0);
        setPlaybackError("");
        setSignedFallbackTried(false);
        lastWatchReportRef.current = 0;
        lastWatchReportSentAtRef.current = 0;
        setDescription(videoDetails.description || "");
        setLiked(interactions.liked);
        setSaved(interactions.saved);

        const recommendationPool = mergeUniqueById(
          trending,
          latestPool
        ).filter((item) => item.id !== id && !isClipLikeVideo(item));
        setRecommended(recommendationPool.slice(0, RECOMMENDED_TARGET));

        setComments(apiComments.map((comment) => ({
          ...comment,
          user: {
            ...comment.user,
            avatarUrl: comment.user.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"
          },
          replies: (comment.replies || []).map((reply) => ({
            ...reply,
            user: {
              ...reply.user,
              avatarUrl: reply.user.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"
            }
          }))
        })));
      } catch {
        if (!cancelled) {
          setVideo(FALLBACK_VIDEO);
          setPlaybackCandidates([]);
          setPlaybackIndex(0);
          setPlaybackError("Failed to load this video.");
          setSignedFallbackTried(false);
          setRecommended([]);
          setComments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const reportWatchProgress = (progress: number) => {
    if (!id) return;
    if (!isAuthenticated()) return;

    const normalized = Math.max(0, Math.min(1, progress));
    if (normalized < 0.05) return;
    if (normalized <= lastWatchReportRef.current + 0.05 && normalized < 1) return;

    const now = Date.now();
    if (normalized < 1 && now - lastWatchReportSentAtRef.current < 10000) return;

    lastWatchReportRef.current = normalized;
    lastWatchReportSentAtRef.current = now;

    void reportVideoWatch(id, normalized).catch(() => undefined);
  };

  const enterPlayerFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const container = video.parentElement as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const target = container || video;
    const elementWithFullscreen = target as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    const videoWithWebkit = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };

    if (typeof elementWithFullscreen.requestFullscreen === "function") {
      void elementWithFullscreen.requestFullscreen();
      return;
    }

    if (typeof elementWithFullscreen.webkitRequestFullscreen === "function") {
      void elementWithFullscreen.webkitRequestFullscreen();
      return;
    }

    if (typeof elementWithFullscreen.msRequestFullscreen === "function") {
      void elementWithFullscreen.msRequestFullscreen();
      return;
    }

    if (typeof videoWithWebkit.webkitEnterFullscreen === "function") {
      videoWithWebkit.webkitEnterFullscreen();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (!videoRef.current) return;

      const el = videoRef.current;
      const duration = isFinite(el.duration) && el.duration > 0 ? el.duration : video.duration;

      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (el.paused) {
          void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          el.pause();
          setPlaying(false);
        }
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key === "ArrowLeft") {
        event.preventDefault();
        el.currentTime = Math.max(0, el.currentTime - 10);
        return;
      }

      if (event.key.toLowerCase() === "l" || event.key === "ArrowRight") {
        event.preventDefault();
        el.currentTime = Math.min(duration, el.currentTime + 10);
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        el.muted = !el.muted;
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          enterPlayerFullscreen();
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        el.volume = Math.min(1, el.volume + 0.1);
        el.muted = false;
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        el.volume = Math.max(0, el.volume - 0.1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterPlayerFullscreen, video.duration]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    // A-B loop handled in onTimeUpdate directly now to avoid stale state issues, 
    // but the effect can remain to setup listeners if needed. We already handle it in onTimeUpdate.
  }, [abEnabled, pointA, pointB]);

  const requireAuth = (next: () => void) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }
    next();
  };

  const togglePlayback = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleVideoError = () => {
    if (!id) {
      setPlaybackError("This video cannot be played.");
      return;
    }

    if (playbackIndex < playbackCandidates.length - 1) {
      setPlaybackIndex((prev) => prev + 1);
      return;
    }

    if (signedFallbackTried) {
      setPlaybackError("This video format is not supported in your browser yet.");
      return;
    }

    void (async () => {
      try {
        setSignedFallbackTried(true);
        const signed = await fetchDownloadUrl(id);
        if (!signed) {
          setPlaybackError("This video format is not supported in your browser yet.");
          return;
        }

        setPlaybackCandidates((prev) => [...prev, signed]);
        setPlaybackIndex(playbackCandidates.length);
      } catch {
        setPlaybackError("This video format is not supported in your browser yet.");
      }
    })();
  };

  const submitComment = () => {
    requireAuth(async () => {
      if (!id) return;
      const body = commentInput.trim();
      if (!body) return;

      await addComment(id, body);
      const refreshed = await fetchVideoComments(id);
      setComments(refreshed.map((comment) => ({
        ...comment,
        user: {
          ...comment.user,
          avatarUrl: comment.user.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"
        },
        replies: (comment.replies || []).map((reply) => ({
          ...reply,
          user: {
            ...reply.user,
            avatarUrl: reply.user.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"
          }
        }))
      })));
      setCommentInput("");
    });
  };

  const onLike = () => {
    requireAuth(async () => {
      if (!id) return;
      const res = await toggleLike(id);
      setLiked(res.liked);
      if (res.liked) {
         setLikedAnimating(true);
         setTimeout(() => setLikedAnimating(false), 600);
      }
    });
  };

  const onSave = () => {
    requireAuth(async () => {
      if (!id) return;
      const res = await toggleSave(id);
      setSaved(res.saved);
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Link copied");
      window.setTimeout(() => setShareStatus(""), 1500);
    } catch {
      setShareStatus("Copy failed");
      window.setTimeout(() => setShareStatus(""), 1500);
    }
  };

  const downloadVideo = () => {
    requireAuth(async () => {
      if (!id) return;
      try {
        setDownloadStatus("Downloading...");
        const url = await fetchDownloadUrl(id);
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = `video-${id}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
        setDownloadStatus("Completed");
        window.setTimeout(() => setDownloadStatus(""), 2000);
      } catch {
        setDownloadStatus("Failed");
        window.setTimeout(() => setDownloadStatus(""), 2000);
      }
    });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading video...</div>;
  }

  return (
    <div className="lg:flex lg:gap-6 p-4 lg:p-6">
      <div className="flex-1 min-w-0">
        <div className="relative aspect-video bg-black rounded-2xl overflow-hidden mb-4 group">
          {currentPlaybackUrl ? (
            <video
              key={currentPlaybackUrl}
              ref={videoRef}
              src={currentPlaybackUrl}
              poster={video.thumbnailUrl}
              preload="metadata"
              controls={isMobile}
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              className="w-full h-full object-contain"
              onClick={togglePlayback}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={handleVideoError}
              onContextMenu={(event) => event.preventDefault()}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                const duration = isFinite(el.duration) && el.duration > 0 ? el.duration : video.duration;
                const progress = duration > 0 ? (el.currentTime / duration) * 100 : 0;
                const progressRatio = duration > 0 ? (el.currentTime / duration) : 0;
                if (progressRef.current) {
                  progressRef.current.style.width = `${progress}%`;
                }
                if (progressInputRef.current && document.activeElement !== progressInputRef.current) {
                  progressInputRef.current.value = progress.toString();
                }
                if (timeRef.current) {
                  const m = Math.floor(el.currentTime / 60);
                  const s = Math.floor(el.currentTime % 60);
                  timeRef.current.innerText = `${m}:${s.toString().padStart(2, "0")}`;
                }
                reportWatchProgress(progressRatio);
              }}
              onEnded={() => reportWatchProgress(1)}
            />
          ) : (
            <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-contain" width={1280} height={720} loading="eager" decoding="async" fetchPriority="high" />
          )}

          {!isMobile && !playing && (
            <div onClick={togglePlayback} className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer group/play">
              <div className="w-20 h-20 bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center backdrop-blur-md shadow-2xl transform transition-all group-hover/play:scale-110">
                <Play size={40} fill="currentColor" className="ml-2" />
              </div>
            </div>
          )}

          {!isMobile && <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button onClick={() => setCcEnabled((v) => !v)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${ccEnabled ? "bg-white text-black" : "bg-black/50 text-white hover:bg-black/70"}`} aria-label="Toggle captions">
              <Captions size={18} />
            </button>
            <button onClick={() => setShowSettings((v) => !v)} className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md transition-colors" aria-label="Open settings">
              <Settings size={18} />
            </button>
          </div>}

          {showSettings && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowSettings(false)} />
              <div className="absolute right-4 top-16 w-60 rounded-3xl border border-border/50 bg-black/80 backdrop-blur-2xl p-5 text-sm space-y-5 z-30 shadow-2xl animate-fade-in text-white">
                <div>
                  <p className="text-xs text-white/60 mb-2 font-medium">Playback Speed</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0.5, 1, 1.5, 2].map((value) => (
                      <button key={value} onClick={() => setSpeed(value)} className={`h-8 rounded-lg text-xs font-medium transition-colors ${speed === value ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20'}`}>
                        {value}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {!isMobile && <div className="absolute bottom-0 left-0 right-0 pt-16 pb-4 px-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end z-20">
            <div className="relative w-full h-1.5 mb-3 group/progress hover:h-2 transition-all">
              <div className="absolute inset-0 bg-white/30 rounded-full pointer-events-none"></div>
              <div ref={progressRef} className="absolute inset-y-0 left-0 bg-primary rounded-full pointer-events-none transition-all duration-75 ease-linear w-0"></div>
              <input 
                type="range" 
                ref={progressInputRef}
                min="0" 
                max="100" 
                step="0.1"
                defaultValue="0"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onMouseDown={() => {
                  if (videoRef.current) {
                     wasPlayingRef.current = !videoRef.current.paused;
                     videoRef.current.pause();
                  }
                }}
                onMouseUp={() => {
                  if (videoRef.current && wasPlayingRef.current) {
                     videoRef.current.play().catch(() => {});
                  }
                }}
                onTouchStart={() => {
                  if (videoRef.current) {
                     wasPlayingRef.current = !videoRef.current.paused;
                     videoRef.current.pause();
                  }
                }}
                onTouchEnd={() => {
                  if (videoRef.current && wasPlayingRef.current) {
                     videoRef.current.play().catch(() => {});
                  }
                }}
                onChange={(e) => {
                  if (videoRef.current) {
                    const val = parseFloat(e.target.value) / 100;
                    const duration = isFinite(videoRef.current.duration) && videoRef.current.duration > 0 ? videoRef.current.duration : video.duration;
                    if (duration > 0) {
                      videoRef.current.currentTime = val * duration;
                    }
                  }
                }}
                onInput={(e) => {
                  const val = parseFloat((e.target as HTMLInputElement).value) / 100;
                  if (progressRef.current) {
                    progressRef.current.style.width = `${val * 100}%`;
                  }
                  if (videoRef.current) {
                    const duration = isFinite(videoRef.current.duration) && videoRef.current.duration > 0 ? videoRef.current.duration : video.duration;
                    if (duration > 0) {
                      videoRef.current.currentTime = val * duration;
                    }
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <button 
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                    }
                  }} 
                  className="text-white hover:text-primary transition-colors"
                  aria-label="Skip backward 10 seconds"
                 >
                   <RotateCcw size={20} />
                 </button>
                 <button onClick={togglePlayback} className="text-white hover:text-primary transition-colors">
                   {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                 </button>
                 <button 
                  onClick={() => {
                    if (videoRef.current) {
                      const duration = isFinite(videoRef.current.duration) && videoRef.current.duration > 0 ? videoRef.current.duration : video.duration;
                      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
                    }
                  }} 
                  className="text-white hover:text-primary transition-colors"
                  aria-label="Skip forward 10 seconds"
                 >
                   <RotateCw size={20} />
                 </button>
                 <span className="text-white text-xs font-medium tabular-nums shadow-sm ml-2">
                   <span ref={timeRef}>0:00</span> / {formatDuration(video.duration)}
                 </span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                     if (document.fullscreenElement) document.exitFullscreen();
                     else enterPlayerFullscreen();
                  }} 
                  className="text-white hover:text-primary transition-colors"
                >
                   <Maximize size={20} />
                </button>
              </div>
            </div>
          </div>}
        </div>

        {playbackError && (
          <div className="mb-4 p-3 rounded-xl border border-destructive/40 bg-destructive/10">
            <p className="text-sm text-destructive">{playbackError}</p>
          </div>
        )}

        <h1 className="text-xl font-semibold text-foreground mb-2">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm text-muted-foreground">{formatViewCount(video.viewCount)} views · {formatRelativeTime(video.publishedAt)}</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap justify-end mt-2 md:mt-0">
            <button onClick={onLike} className={`relative overflow-hidden flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-colors ${liked ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface-hover border border-border"}`}>
              <div className="relative flex items-center justify-center">
                 <ThumbsUp size={18} fill={liked ? 'currentColor' : 'none'} className={`transition-transform duration-300 ease-out ${likedAnimating ? 'scale-[1.7] -rotate-12 text-blue-300' : 'scale-100'}`} />
                 {likedAnimating && (
                   <span className="absolute inset-0 bg-white/50 rounded-full animate-[ping_0.5s_ease-out_forwards] pointer-events-none scale-150" />
                 )}
              </div>
              <span className={`transition-transform duration-300 z-10 ${likedAnimating ? 'scale-110' : 'scale-100'}`}>{formatViewCount(likeCount)}</span>
            </button>
            <div className="relative">
              <button onClick={() => setShowShareModal((s) => !s)} className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-surface hover:bg-surface-hover border border-border transition-colors">
                <Share2 size={18} /> Share
              </button>
              {showShareModal && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareModal(false)} />
                  <div className="absolute top-12 right-0 w-[260px] p-4 bg-surface border border-border shadow-2xl rounded-3xl z-50 animate-fade-in origin-top-right">
                    <h4 className="text-sm font-semibold mb-3">Share this video</h4>
                    <div className="flex gap-2 mb-3">
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity"><Facebook size={18} /></a>
                      <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(video.title)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:opacity-90 transition-opacity"><Twitter size={18} /></a>
                      <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(video.title + " " + window.location.href)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity"><MessageCircle size={18} /></a>
                      <button onClick={copyLink} className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:opacity-90 transition-opacity border border-border"><LinkIcon size={18} /></button>
                    </div>
                    {shareStatus && <p className="text-xs font-medium text-primary text-center">{shareStatus}</p>}
                  </div>
                </>
              )}
            </div>
            <button onClick={onSave} className={`flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-colors ${saved ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface-hover border border-border"}`}>
              <Plus size={18} /> Add
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowMoreMenu((s) => !s)} 
                className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold bg-surface hover:bg-surface-hover border border-border transition-colors"
              >
                <MoreHorizontal size={18} /> More
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute top-12 right-0 w-56 rounded-2xl bg-surface border border-border shadow-xl z-50 p-2 py-2 space-y-0.5 animate-fade-in origin-top-right">
                    <button onClick={() => { setShowMoreMenu(false); onSave(); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><Clock size={16} /> Watch later</button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><Plus size={16} /> Add to channel</button>
                    <button onClick={copyLink} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><Copy size={16} /> Copy link</button>
                    <button onClick={downloadVideo} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><Download size={16} /> Download</button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><Code size={16} /> Export</button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors text-foreground"><AlertCircle size={16} /> Report</button>
                  </div>
                </>
              )}
            </div>
            {shareStatus && <span className="text-xs text-primary font-medium w-full text-right">{shareStatus}</span>}
            {downloadStatus && <span className="text-xs text-primary font-medium w-full text-right">{downloadStatus}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
          <Link to={`/channel/${video.channel.username}`}>
            <img
              src={video.channel.avatarUrl}
              alt={video.channel.displayName}
              className="w-10 h-10 rounded-full bg-surface object-cover"
              width={40}
              height={40}
              decoding="async"
              onError={(event) => {
                event.currentTarget.src = FALLBACK_AVATAR;
              }}
            />
          </Link>
          <div className="flex-1">
            <Link to={`/channel/${video.channel.username}`} className="text-sm font-medium text-foreground hover:underline">
              {video.channel.displayName}
              {video.channel.isVerified && <span className="ml-1 text-text-tertiary">✓</span>}
            </Link>
            <p className="text-xs text-muted-foreground">{formatSubscriberCount(video.channel.subscriberCount)}</p>
          </div>
          <button onClick={() => requireAuth(() => setSubscribed((v) => !v))} className={`px-5 py-2 rounded-2xl text-sm font-medium transition-colors ${subscribed ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>
        </div>

        {isMobile ? (
          <>
            <div className="bg-surface rounded-3xl mb-6 shadow-sm border border-border/50 overflow-hidden">
              <button
                onClick={() => setDescriptionOpen((prev) => !prev)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-foreground">Description</span>
                {descriptionOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </button>
              {descriptionOpen && (
                <div className="px-5 pb-5">
                  <p className={`text-sm text-foreground whitespace-pre-wrap ${descExpanded ? "" : "line-clamp-2"}`}>{description || video.title}</p>
                  <button onClick={() => setDescExpanded(!descExpanded)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground mt-2 hover:text-foreground transition-colors">
                    {descExpanded ? <><ChevronUp size={14} /> Less</> : <><ChevronDown size={14} /> More</>}
                  </button>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {video.tags.map((tag) => (
                      <Link key={tag} to={`/search?q=${tag}`} className="px-3 py-1 rounded-full text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors">#{tag}</Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-surface rounded-3xl shadow-sm border border-border/50 overflow-hidden">
              <button
                onClick={() => setCommentsOpen((prev) => !prev)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-foreground">Comments ({comments.length})</span>
                {commentsOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </button>
              {commentsOpen && (
                <div className="px-5 pb-5">
                  <div className="flex gap-2 mb-5">
                    <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Add a comment" className="flex-1 h-11 px-4 rounded-full bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    <button onClick={submitComment} className="px-5 h-11 rounded-full bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90">Comment</button>
                  </div>

                  <div className="space-y-6 max-h-[520px] overflow-y-auto pr-1">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <img
                          src={comment.user.avatarUrl}
                          alt={comment.user.displayName}
                          className="w-8 h-8 rounded-full bg-surface flex-shrink-0 object-cover"
                          width={32}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.src = FALLBACK_AVATAR;
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">{comment.user.displayName}</span>
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground mb-2">{comment.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="bg-surface rounded-3xl mb-6 shadow-sm border border-border/50 p-5">
              <p className={`text-sm text-foreground whitespace-pre-wrap ${descExpanded ? "" : "line-clamp-3"}`}>{description || video.title}</p>
              <button onClick={() => setDescExpanded(!descExpanded)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground mt-2 hover:text-foreground transition-colors">
                {descExpanded ? <><ChevronUp size={14} /> Less</> : <><ChevronDown size={14} /> More</>}
              </button>
              <div className="flex gap-2 mt-3 flex-wrap">
                {video.tags.map((tag) => (
                  <Link key={tag} to={`/search?q=${tag}`} className="px-3 py-1 rounded-full text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors">#{tag}</Link>
                ))}
              </div>
            </div>

            <div className="bg-surface rounded-3xl shadow-sm border border-border/50 p-5">
              <p className="text-sm font-semibold text-foreground mb-4">Comments ({comments.length})</p>
              <div className="flex gap-2 mb-5">
                <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Add a comment" className="flex-1 h-11 px-4 rounded-full bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={submitComment} className="px-5 h-11 rounded-full bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90">Comment</button>
              </div>
              <div className="space-y-6 max-h-[520px] overflow-y-auto pr-1">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <img
                      src={comment.user.avatarUrl}
                      alt={comment.user.displayName}
                      className="w-8 h-8 rounded-full bg-surface flex-shrink-0 object-cover"
                      width={32}
                      height={32}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.src = FALLBACK_AVATAR;
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{comment.user.displayName}</span>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground mb-2">{comment.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="lg:hidden mt-8">
          <h3 className="text-base font-semibold text-foreground mb-3">Up next</h3>
          <div className="space-y-3">
            {recommended.map((v) => (
              <div key={v.id} className="flex gap-3">
                <Link to={`/watch/${v.id}`} className="relative w-40 aspect-video rounded-2xl overflow-hidden bg-surface flex-shrink-0">
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    width={320}
                    height={180}
                    sizes="160px"
                    onError={(event) => {
                      event.currentTarget.src = FALLBACK_THUMBNAIL;
                    }}
                  />
                  <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] font-medium bg-background/80 text-foreground">{formatDuration(v.duration)}</span>
                </Link>
                <div className="flex-1 min-w-0 py-0.5">
                  <Link to={`/watch/${v.id}`}>
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 leading-5">{v.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{v.channel.displayName}</p>
                    <p className="text-xs text-muted-foreground">{formatViewCount(v.viewCount)} views · {formatRelativeTime(v.publishedAt)}</p>
                  </Link>
                </div>
              </div>
            ))}
            {recommended.length === 0 && <p className="text-sm text-muted-foreground">No recommendations yet.</p>}
          </div>
        </div>
      </div>

      <div className="hidden lg:block w-[360px] flex-shrink-0 space-y-3 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
        <h3 className="text-base font-semibold text-foreground mb-3">Up next</h3>
        {recommended.map((v) => (
          <div key={v.id} className="flex gap-3 group relative">
            <Link to={`/watch/${v.id}`} className="relative w-40 aspect-video rounded-2xl overflow-hidden bg-surface flex-shrink-0">
              <img
                src={v.thumbnailUrl}
                alt={v.title}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                width={320}
                height={180}
                sizes="160px"
                onError={(event) => {
                  event.currentTarget.src = FALLBACK_THUMBNAIL;
                }}
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] font-medium bg-background/80 text-foreground">{formatDuration(v.duration)}</span>
            </Link>
            <div className="flex-1 min-w-0 py-0.5 pr-6">
              <Link to={`/watch/${v.id}`}>
                <h4 className="text-sm font-medium text-foreground line-clamp-2 leading-5 group-hover:underline">{v.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">{v.channel.displayName}</p>
                <p className="text-xs text-muted-foreground">{formatViewCount(v.viewCount)} views · {formatRelativeTime(v.publishedAt)}</p>
              </Link>
            </div>
            {/* Recommended item actions */ }
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-1 rounded-full hover:bg-surface-hover text-muted-foreground" onClick={() => setOpenRecommendedMenuId((prev) => prev === v.id ? null : v.id)}>
                 <MoreVertical size={16} />
               </button>
              {openRecommendedMenuId === v.id && (
                <>
                 <div className="fixed inset-0 z-40" onClick={() => setOpenRecommendedMenuId(null)} />
                 <div className="absolute right-0 top-full mt-1 w-56 rounded-2xl bg-surface border border-border shadow-xl z-50 p-2 py-2 space-y-0.5">
                   <button onClick={() => { setOpenRecommendedMenuId(null); onSave(); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><Clock size={16} /> Watch later</button>
                   <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><MinusCircle size={16} /> Not interesting</button>
                   <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><UserX size={16} /> Don't recommend channel</button>
                   <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><Share2 size={16} /> Share</button>
                   <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><AlertCircle size={16} /> Report</button>
                 </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
