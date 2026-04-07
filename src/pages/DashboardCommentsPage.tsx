import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchVideoComments, addComment, fetchManageVideo } from "@/lib/api";
import type { CommentData } from "@/lib/mockData";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";

export default function DashboardCommentsPage() {
  const { id } = useParams<{ id: string }>();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [videoTitle, setVideoTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchManageVideo(id)
      .then(v => setVideoTitle(v.title))
      .catch(() => setVideoTitle("Video Comments"));

    fetchVideoComments(id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !id) return;
    try {
      await addComment(id, newComment);
      setNewComment("");
      const updated = await fetchVideoComments(id);
      setComments(updated);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-4 lg:p-10 max-w-4xl mx-auto space-y-6 animate-fade-in relative z-10">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Comments Management</h1>
          <p className="text-sm text-white/50 truncate max-w-xs sm:max-w-md">{videoTitle}</p>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-6 md:p-8 shadow-xl">
        <form onSubmit={handleAddComment} className="flex gap-4 mb-8">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment or reply..."
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button type="submit" disabled={!newComment.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
            <Send size={16} /> <span className="hidden sm:inline">Comment</span>
          </button>
        </form>

        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-10 text-white/40">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10 text-white/40 flex flex-col items-center">
                <MessageSquare size={32} className="mb-4 opacity-50" />
                <p>No comments on this video yet.</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                <img src={c.user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${c.user.username}`} alt={c.user.displayName} className="w-10 h-10 rounded-full bg-white/10 object-cover flex-shrink-0" />
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-semibold text-white text-sm">{c.user.displayName}</span>
                    <span className="text-xs text-white/40">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed">{c.body}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
