import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Heart, MessageCircle, Bookmark } from "lucide-react";
import { addComment, fetchVideoComments, fetchVideos, isClipLikeVideo, toggleLike, toggleSave } from "@/lib/api";
import type { VideoData, CommentData } from "@/lib/mockData";
import { formatRelativeTime } from "@/lib/mockData";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

export default function ShortsPage() {
  const { id } = useParams();
  const { openAuthModal } = useAuthModal();

  const [clips, setClips] = useState<VideoData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [status, setStatus] = useState("");
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetchVideos({ sort: "latest", page: 1, limit: 50 })
      .then((items) => {
        const shortItems = items.filter(isClipLikeVideo);
        setClips(shortItems);
        if (!id) return;
        const idx = shortItems.findIndex((item) => item.id === id);
        if (idx >= 0) setCurrentIndex(idx);
      })
      .catch(() => setClips([]));
  }, [id]);

  const current = clips[currentIndex];

  useEffect(() => {
    if (!current?.id) {
      setComments([]);
      return;
    }

    void fetchVideoComments(current.id)
      .then(setComments)
      .catch(() => setComments([]));
  }, [current?.id]);

  const requireAuth = (action: () => void) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }
    action();
  };

  const onLike = () => {
    if (!current) return;
    requireAuth(async () => {
      const result = await toggleLike(current.id);
      setLiked(result.liked);
    });
  };

  const onSave = () => {
    if (!current) return;
    requireAuth(async () => {
      const result = await toggleSave(current.id);
      setSaved(result.saved);
    });
  };

  const onComment = () => {
    if (!current) return;
    requireAuth(async () => {
      if (!commentInput.trim()) return;
      await addComment(current.id, commentInput.trim());
      const rows = await fetchVideoComments(current.id);
      setComments(rows);
      setCommentInput("");
      setStatus("Comment posted.");
      window.setTimeout(() => setStatus(""), 1200);
    });
  };

  const next = () => setCurrentIndex((prev) => Math.min(clips.length - 1, prev + 1));
  const prev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));

  const shortCountText = useMemo(() => `${currentIndex + 1}/${Math.max(1, clips.length)}`, [currentIndex, clips.length]);

  if (!current) {
    return (
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Shorts</h1>
        <p className="text-sm text-muted-foreground">No shorts are available yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 grid xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
      <section className="mx-auto w-full max-w-[420px]">
        <div className="rounded-3xl overflow-hidden border border-white/10 bg-black aspect-[9/16] relative">
          <video key={current.id} src={current.hlsBaseUrl} poster={current.thumbnailUrl} controls autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs bg-black/60 text-white">Short {shortCountText}</div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={prev} disabled={currentIndex === 0} className="h-10 px-3 rounded-xl border border-white/15 text-sm text-foreground inline-flex items-center gap-1 disabled:opacity-50">
            <ChevronUp size={16} /> Prev
          </button>
          <Link to={`/watch/${current.id}`} className="h-10 px-3 rounded-xl border border-white/15 text-sm text-foreground inline-flex items-center">
            Open long watch page
          </Link>
          <button type="button" onClick={next} disabled={currentIndex >= clips.length - 1} className="h-10 px-3 rounded-xl border border-white/15 text-sm text-foreground inline-flex items-center gap-1 disabled:opacity-50">
            Next <ChevronDown size={16} />
          </button>
        </div>
      </section>

      <section className="space-y-4 min-w-0">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <p className="text-lg font-semibold text-foreground leading-tight">{current.title}</p>
          <p className="text-xs text-muted-foreground">{current.channel.displayName} · {formatRelativeTime(current.publishedAt)}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={onLike} className={`h-9 px-3 rounded-xl text-xs inline-flex items-center gap-1 ${liked ? "bg-primary text-primary-foreground" : "border border-white/15 text-foreground"}`}>
              <Heart size={14} /> Like
            </button>
            <button type="button" onClick={onSave} className={`h-9 px-3 rounded-xl text-xs inline-flex items-center gap-1 ${saved ? "bg-primary text-primary-foreground" : "border border-white/15 text-foreground"}`}>
              <Bookmark size={14} /> Save
            </button>
            <Link to={`/channel/${current.channel.username}`} className="h-9 px-3 rounded-xl border border-white/15 text-xs text-foreground inline-flex items-center">
              Channel
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Comments ({comments.length})</h2>
          </div>
          <div className="flex gap-2">
            <input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Write a short comment"
              className="flex-1 h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm"
            />
            <button type="button" onClick={onComment} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
              Post
            </button>
          </div>
          {status && <p className="text-xs text-muted-foreground">{status}</p>}

          <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              comments.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-medium text-foreground">{item.user.displayName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
