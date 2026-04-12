import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Download, Heart, MessageCircle, MoreVertical, Share2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addPostComment,
  fetchPostComments,
  fetchPostDownloadUrl,
  fetchPosts,
  togglePostLike,
  type ApiPost,
  type ApiPostComment
} from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

export default function PostsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAuthModal } = useAuthModal();

  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState("");
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const [savedById, setSavedById] = useState<Record<string, boolean>>({});
  const [commentsById, setCommentsById] = useState<Record<string, ApiPostComment[]>>({});
  const [commentInputById, setCommentInputById] = useState<Record<string, string>>({});
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const openId = searchParams.get("open");
  const openPost = useMemo(() => posts.find((item) => item.id === openId) || null, [openId, posts]);

  const loadPage = useCallback(async (nextPage: number, replace = false) => {
    try {
      if (replace) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const data = await fetchPosts({ page: nextPage, limit: 24, sort: "latest" });
      setPosts((prev) => {
        const base = replace ? [] : prev;
        const seen = new Set(base.map((item) => item.id));
        const merged = [...base];
        for (const item of data.items) {
          if (seen.has(item.id)) continue;
          merged.push(item);
          seen.add(item.id);
        }
        return merged;
      });

      setPage(nextPage);
      setHasMore(data.items.length >= 24);
    } catch {
      setStatus("Failed to load posts");
      window.setTimeout(() => setStatus(""), 1500);
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
    if (!sentinelRef.current) return;
    if (!hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (loading || loadingMore) return;
      void loadPage(page + 1);
    }, { rootMargin: "1000px 0px" });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, loadingMore, page]);

  const openPopup = useCallback((id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("open", id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closePopup = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const onLike = useCallback(async (id: string) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }

    try {
      const data = await togglePostLike(id);
      setLikedById((prev) => ({ ...prev, [id]: data.liked }));
    } catch {
      setStatus("Like failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [openAuthModal]);

  const onDownload = useCallback(async (id: string) => {
    try {
      const url = await fetchPostDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setStatus("Download failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const onShare = useCallback(async (id: string) => {
    const url = `${window.location.origin}/posts?open=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
      window.setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Copy failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, []);

  const openComments = useCallback(async (id: string) => {
    openPopup(id);
    if (commentsById[id]) return;
    try {
      const rows = await fetchPostComments(id);
      setCommentsById((prev) => ({ ...prev, [id]: rows }));
    } catch {
      setCommentsById((prev) => ({ ...prev, [id]: [] }));
    }
  }, [commentsById, openPopup]);

  const onComment = useCallback(async (id: string) => {
    if (!isAuthenticated()) {
      openAuthModal(window.location.pathname + window.location.search);
      return;
    }

    const body = (commentInputById[id] || "").trim();
    if (!body) return;

    try {
      await addPostComment(id, body);
      const rows = await fetchPostComments(id);
      setCommentsById((prev) => ({ ...prev, [id]: rows }));
      setCommentInputById((prev) => ({ ...prev, [id]: "" }));
    } catch {
      setStatus("Comment failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [commentInputById, openAuthModal]);

  return (
    <div className="p-4 lg:p-8 max-w-[1700px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Posts</h1>
          <p className="text-sm text-white/60 mt-1">Read creator articles and downloadable content</p>
        </div>
        <Link to="/posts/create" className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold">Create Post</Link>
      </div>

      {loading ? (
        <div className="p-12 text-center text-white/60">Loading posts...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {posts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => openPopup(post.id)}
                className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 min-h-[240px]"
              >
                <p className="text-xs text-white/50">@{post.user?.username || "creator"}</p>
                <h3 className="text-base font-semibold text-white mt-2 line-clamp-2">{post.title}</h3>
                <p className="text-sm text-white/70 mt-3 line-clamp-6">{post.content}</p>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="h-1 w-full" />
          {loadingMore && <p className="text-center text-white/60 text-sm">Loading more...</p>}
        </>
      )}

      {openPost && (
        <div className="fixed inset-0 z-50 bg-black/70" onClick={closePopup}>
          <div className="absolute inset-x-0 bottom-0 top-10 lg:top-16 lg:left-1/2 lg:-translate-x-1/2 lg:max-w-3xl lg:bottom-10 rounded-t-3xl lg:rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-white/60">@{openPost.user?.username || "creator"}</p>
                <h2 className="text-xl font-bold text-white mt-1">{openPost.title}</h2>
              </div>
              <button type="button" onClick={closePopup} className="h-9 w-9 rounded-full bg-white/10 inline-flex items-center justify-center text-white">
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/90 leading-7 whitespace-pre-wrap">
              {openPost.content}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void onLike(openPost.id)} className={`h-10 px-3 rounded-xl border border-white/20 inline-flex items-center gap-2 ${likedById[openPost.id] ? "bg-white text-black" : "bg-white/10 text-white"}`}>
                <Heart size={16} /> Like
              </button>
              <button type="button" onClick={() => setSavedById((prev) => ({ ...prev, [openPost.id]: !prev[openPost.id] }))} className={`h-10 px-3 rounded-xl border border-white/20 inline-flex items-center gap-2 ${savedById[openPost.id] ? "bg-white text-black" : "bg-white/10 text-white"}`}>
                <BookmarkPlus size={16} /> Add
              </button>
              <button type="button" onClick={() => void onShare(openPost.id)} className="h-10 px-3 rounded-xl border border-white/20 bg-white/10 text-white inline-flex items-center gap-2">
                <Share2 size={16} /> Share
              </button>
              <button type="button" onClick={() => void onDownload(openPost.id)} className="h-10 px-3 rounded-xl border border-white/20 bg-white/10 text-white inline-flex items-center gap-2">
                <Download size={16} /> Download
              </button>
              <button type="button" className="h-10 px-3 rounded-xl border border-white/20 bg-white/10 text-white inline-flex items-center gap-2" onClick={() => setStatus("More actions coming soon") }>
                <MoreVertical size={16} /> More
              </button>
              <button type="button" className="h-10 px-3 rounded-xl border border-white/20 bg-white/10 text-white inline-flex items-center gap-2" onClick={() => void openComments(openPost.id)}>
                <MessageCircle size={16} /> Comments
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex gap-2">
                <input
                  value={commentInputById[openPost.id] || ""}
                  onChange={(event) => setCommentInputById((prev) => ({ ...prev, [openPost.id]: event.target.value }))}
                  placeholder="Write a comment"
                  className="flex-1 h-10 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white"
                />
                <button type="button" onClick={() => void onComment(openPost.id)} className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold">Post</button>
              </div>

              {(commentsById[openPost.id] || []).map((comment) => (
                <div key={comment.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-sm text-white">{comment.body}</p>
                  <p className="text-xs text-white/60 mt-1">@{comment.user.username}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {status && <p className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-xs bg-black/80 border border-white/20 text-white px-3 py-2 rounded-full">{status}</p>}
    </div>
  );
}
