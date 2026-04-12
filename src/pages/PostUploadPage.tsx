import { useState } from "react";
import { createPost } from "@/lib/api";

export default function PostUploadPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">("PUBLIC");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim() || !content.trim()) {
      setStatus("Title, content and file are required.");
      return;
    }

    try {
      setLoading(true);
      const item = await createPost({
        title: title.trim(),
        content: content.trim(),
        file,
        visibility
      });
      setStatus(`Post published: ${item.title}`);
      setTitle("");
      setContent("");
      setFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Create Post</h1>
        <p className="text-sm text-white/60 mt-2">Upload an article with downloadable attachment.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="space-y-1">
          <label className="text-sm text-white/70">Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full h-11 rounded-xl border border-white/15 bg-black/40 px-3 text-white" placeholder="Post title" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Content</label>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className="w-full min-h-[180px] rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" placeholder="Write your post article" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/70">Attachment</label>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1 file:text-black"
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

        <button type="submit" disabled={loading} className="h-11 px-5 rounded-xl bg-white text-black font-semibold disabled:opacity-60">
          {loading ? "Publishing..." : "Publish Post"}
        </button>
      </form>

      {status && <p className="text-sm text-white/80">{status}</p>}
    </div>
  );
}
