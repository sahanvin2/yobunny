import { useState } from "react";
import { createPost } from "@/lib/api";

export default function PostUploadPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">("PUBLIC");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!file && !externalUrl.trim()) || !title.trim() || !content.trim()) {
      setStatus("Title, content, and either a file or an external link are required.");
      return;
    }

    try {
      setLoading(true);
      const item = await createPost({
        title: title.trim(),
        content: content.trim(),
        file: file || undefined,
        externalUrl: externalUrl.trim() || undefined,
        visibility
      });
      setStatus(`Post published: ${item.title}`);
      setTitle("");
      setContent("");
      setExternalUrl("");
      setFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6 relative">
      <div className="absolute -top-6 left-0 right-0 h-56 bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <h1 className="text-3xl font-bold text-white">Create Post</h1>
        <p className="text-sm text-white/60 mt-2">Publish a post with either an uploaded file or an external downloadable link.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-6 relative z-10">
        <div className="space-y-1">
          <label className="text-sm text-white/70">Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full h-11 rounded-xl border border-white/15 bg-black/40 px-3 text-white" placeholder="Post title" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Content</label>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className="w-full min-h-[180px] rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" placeholder="Write your post article" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Attachment (Upload File)</label>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1 file:text-black"
          />
        </div>

        <div className="relative py-1">
          <div className="border-t border-white/10" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0b0b0d] px-2 text-xs uppercase tracking-wider text-white/50">or</span>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">External Download Link (Google Drive, Dropbox, direct URL)</label>
          <input
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            className="w-full h-11 rounded-xl border border-white/15 bg-black/40 px-3 text-white"
            placeholder="https://..."
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Visibility</label>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as "PUBLIC" | "PRIVATE" | "UNLISTED")} className="w-full h-11 rounded-xl border border-white/15 bg-black/40 px-3 text-white">
            <option value="PUBLIC">Public</option>
            <option value="UNLISTED">Unlisted</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>

        <button type="submit" disabled={loading} className="h-11 px-5 rounded-xl bg-white text-black font-semibold disabled:opacity-60 shadow-[0_0_24px_rgba(255,255,255,0.18)]">
          {loading ? "Publishing..." : "Publish Post"}
        </button>
      </form>

      {status && <p className="text-sm text-white/80">{status}</p>}
    </div>
  );
}
