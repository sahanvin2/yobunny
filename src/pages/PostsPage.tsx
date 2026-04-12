import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Download, ExternalLink, Heart, Link2, MessageCircle, MoreVertical, Share2, X } from "lucide-react";
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

function formatPostFileSize(post: ApiPost) {
  if (post.externalUrl) return "External resource";
  if (!post.fileSize) return "No attachment";
  const value = Number(post.fileSize);
  if (!Number.isFinite(value) || value <= 0) return "Attached file";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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

  const openLink = useCallback((url: string, forceDownload = false) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (forceDownload) {
      anchor.download = "";
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, []);

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

  const onDownload = useCallback(async (post: ApiPost) => {
    if (post.externalUrl) {
      openLink(post.externalUrl, false);
      setStatus("Opening external link");
      window.setTimeout(() => setStatus(""), 1200);
      return;
    }
    try {
      const url = await fetchPostDownloadUrl(post.id);
      openLink(url, true);
    } catch {
      if (post.fileUrl) {
        openLink(post.fileUrl, true);
        setStatus("Opened direct file link");
        window.setTimeout(() => setStatus(""), 1200);
        return;
      }
      setStatus("Download failed");
      window.setTimeout(() => setStatus(""), 1200);
    }
  }, [openLink]);

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

  const onCopyFileLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("File link copied");
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
    <div className="p-4 lg:p-8 max-w-[1700px] mx-auto space-y-6 relative">
      <div className="absolute -top-6 left-0 right-0 h-48 bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-fuchsia-500/10 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-3xl font-bold text-white">Creator Posts</h1>
          <p className="text-sm text-white/60 mt-1">Articles, files, and downloadable resources from creators</p>
        </div>
        <Link to="/posts/create" className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold shadow-[0_0_24px_rgba(255,255,255,0.18)]">Create Post</Link>
      </div>

      {loading ? (
        <div className="p-12 text-center text-white/60">Loading posts...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 relative z-10">
            {posts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => openPopup(post.id)}
                className="group text-left rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.06] to-black/30 backdrop-blur-xl hover:border-white/20 hover:from-white/[0.09] hover:to-white/[0.03] shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.6)] transition-all duration-300 p-6 min-h-[300px] flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-white/50 w-full tracking-wide">
                  <div className="flex items-center gap-2">
                    <img src={post.user?.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=creator"} alt="" className="w-6 h-6 rounded-full border border-white/10" />
                    <p className="truncate max-w-[120px]">@{post.user?.username || "creator"}</p>
                  </div>
                  <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 backdrop-blur-md">{formatPostFileSize(post)}</span>
                </div>

                <div className="mt-5 flex-1">
                  <h3 className="text-[22px] font-bold text-white line-clamp-2 leading-snug group-hover:text-cyan-400 transition-colors">{post.title}</h3>
                  <p className="text-[15px] font-medium text-white/60 mt-3 line-clamp-4 leading-relaxed">{post.content}</p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-sm font-medium text-white/40">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 group-hover:text-pink-400 transition-colors"><Heart size={16} /> {post.likeCount}</span>
                    <span className="flex items-center gap-1.5 group-hover:text-sky-400 transition-colors"><MessageCircle size={16} /> {post.commentCount}</span>
                  </div>
                  <span className="flex items-center gap-1.5"><MoreVertical size={16} /></span>
                </div>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="h-1 w-full" />
          {loadingMore && <p className="text-center text-white/60 text-sm">Loading more...</p>}
        </>
      )}

      {openPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md" onClick={closePopup}>
          <div className="absolute inset-x-0 bottom-0 top-10 lg:top-[8vh] lg:left-1/2 lg:-translate-x-1/2 lg:w-full lg:max-w-[800px] lg:bottom-[8vh] rounded-t-[2.5rem] lg:rounded-[2.5rem] border border-white/10 bg-black/70 backdrop-blur-2xl p-6 lg:p-8 overflow-y-auto shadow-[0_20px_80px_rgba(0,0,0,0.9)] custom-scrollbar text-white flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="pr-4">
                <div className="flex items-center gap-3">
                  <img src={openPost.user?.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=creator"} alt="" className="w-8 h-8 rounded-full border border-white/10 shadow-lg" />
                  <p className="text-sm font-semibold text-white/70">@{openPost.user?.username || "creator"}</p>
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mt-4 leading-tight">{openPost.title}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-white/60">
                  <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 backdrop-blur-sm uppercase">{openPost.visibility}</span>
                  {(openPost.fileName || openPost.externalUrl) && (
                     <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 backdrop-blur-sm truncate max-w-[200px]">{openPost.externalUrl ? "External Resource" : openPost.fileName}</span>
                  )}
                  <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 backdrop-blur-sm text-cyan-200">{formatPostFileSize(openPost)}</span>
                  <span className="opacity-60 ml-2">{new Date(openPost.publishedAt || openPost.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button type="button" onClick={closePopup} className="h-10 w-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 lg:p-8 text-white/90 text-sm lg:text-base leading-relaxed whitespace-pre-wrap flex-1 shadow-inner">
              {openPost.content}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void onLike(openPost.id)} className={`h-12 px-5 lg:px-6 rounded-2xl border ${likedById[openPost.id] ? "bg-pink-500 text-white border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)]" : "bg-white/5 text-white hover:bg-white/10 border-white/10"} inline-flex items-center gap-2 font-semibold transition-all hover:scale-[1.02]`}>
                <Heart size={20} className={likedById[openPost.id] ? "fill-white" : ""} /> {likedById[openPost.id] ? 'Liked' : 'Like'}
              </button>
              <button type="button" onClick={() => setSavedById((prev) => ({ ...prev, [openPost.id]: !prev[openPost.id] }))} className={`h-12 px-5 lg:px-6 rounded-2xl border ${savedById[openPost.id] ? "bg-white text-black border-white" : "bg-white/5 text-white hover:bg-white/10 border-white/10"} inline-flex items-center gap-2 font-semibold transition-all hover:scale-[1.02]`}>
                <BookmarkPlus size={20} /> {savedById[openPost.id] ? 'Saved' : 'Save'}
              </button>
              <button type="button" onClick={() => void onShare(openPost.id)} className="h-12 px-5 lg:px-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white inline-flex items-center gap-2 font-semibold transition-all hover:scale-[1.02]">
                <Share2 size={20} /> Share
              </button>
              
              <div className="flex-1 min-w-[200px]" />

              <button type="button" onClick={() => void onDownload(openPost)} className="h-12 px-6 rounded-2xl border border-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-50 inline-flex items-center justify-center gap-2 font-bold shadow-[0_0_24px_rgba(34,211,238,0.2)] transition-all hover:scale-[1.03]">
                <Download size={20} /> {openPost.externalUrl ? "Open Link" : "Download Attached"}
              </button>
            </div>

            <div className="mt-8 space-y-4 border-t border-white/10 pt-8">
              <div className="flex items-center gap-2 mb-6">
                <MessageCircle size={20} className="text-white/60" />
                <h3 className="text-lg font-semibold text-white">Discussion</h3>
              </div>
              <div className="flex gap-3">
                <input
                  value={commentInputById[openPost.id] || ""}
                  onChange={(event) => setCommentInputById((prev) => ({ ...prev, [openPost.id]: event.target.value }))}
                  placeholder="Share your thoughts..."
                  className="flex-1 h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter") void onComment(openPost.id); }}
                />
                <button type="button" onClick={() => void onComment(openPost.id)} className="h-12 px-6 rounded-2xl bg-white text-black text-sm font-bold shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:bg-white/90 transition-colors">Post</button>
              </div>

              <div className="pt-4 space-y-3">
                {(commentsById[openPost.id] || []).map((comment) => (
                  <div key={comment.id} className="rounded-[1.25rem] border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white/50">@{comment.user.username}</p>
                      <span className="text-[10px] text-white/30">{new Date(comment.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[15px] font-medium text-white/90 leading-relaxed">{comment.body}</p>
                  </div>
                ))}

                {(commentsById[openPost.id] || []).length === 0 && (
                  <div className="py-8 text-center bg-white/[0.01] rounded-[1.25rem] border border-white/[0.02]">
                    <p className="text-sm font-medium text-white/40">No comments yet. Start the conversation!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {status && <p className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-xs bg-black/80 border border-white/20 text-white px-3 py-2 rounded-full">{status}</p>}
    </div>
  );
}
