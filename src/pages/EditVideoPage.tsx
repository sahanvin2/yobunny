import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { CATEGORIES } from "@/lib/mockData";
import { fetchManageVideo, updateVideo, uploadVideoThumbnail } from "@/lib/api";

type ThumbnailCandidate = {
  id: string;
  previewUrl: string;
  file?: File;
  source: "generated" | "fallback" | "manual";
};

async function generateThumbnailCandidates(videoUrl: string, videoId: string) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "metadata";
  video.src = videoUrl;
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to read video metadata"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) {
    return [] as ThumbnailCandidate[];
  }

  const rawPoints = [0.15, 0.45, 0.75].map((ratio) => Math.max(0.2, Math.min(duration - 0.2, duration * ratio)));
  const points = Array.from(new Set(rawPoints.map((t) => Number(t.toFixed(2)))));

  const captureAt = async (timeSec: number, index: number) => {
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Unable to seek video frame"));
      };
      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = timeSec;
    });

    const canvas = document.createElement("canvas");
    const width = video.videoWidth > 0 ? Math.min(video.videoWidth, 1280) : 1280;
    const height = video.videoHeight > 0 ? Math.min(video.videoHeight, 720) : 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create thumbnail canvas context");
    }

    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => {
        if (!next) {
          reject(new Error("Unable to capture thumbnail"));
          return;
        }
        resolve(next);
      }, "image/jpeg", 0.9);
    });

    const file = new File([blob], `thumb-${videoId}-${index + 1}.jpg`, { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(file);

    return {
      id: `generated-${index + 1}`,
      previewUrl,
      file,
      source: "generated"
    } as ThumbnailCandidate;
  };

  const candidates: ThumbnailCandidate[] = [];
  for (let i = 0; i < points.length && candidates.length < 3; i += 1) {
    const candidate = await captureAt(points[i], i);
    candidates.push(candidate);
  }

  return candidates;
}

export default function EditVideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("ENTERTAINMENT");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">("PUBLIC");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailCandidates, setThumbnailCandidates] = useState<ThumbnailCandidate[]>([]);
  const [selectedThumbnailCandidateId, setSelectedThumbnailCandidateId] = useState("");
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [applyingThumbnail, setApplyingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState("");
  const [autoGeneratePending, setAutoGeneratePending] = useState(false);

  const resetThumbnailCandidates = () => {
    setThumbnailCandidates((prev) => {
      for (const item of prev) {
        if (item.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      return [];
    });
    setSelectedThumbnailCandidateId("");
  };

  const generateCandidates = async (sourceUrl: string, currentVideoId: string) => {
    if (!sourceUrl) {
      setThumbnailError("No video source is available for thumbnail generation.");
      return;
    }

    try {
      setGeneratingThumbnails(true);
      setThumbnailError("");
      resetThumbnailCandidates();

      const generated = await generateThumbnailCandidates(sourceUrl, currentVideoId);
      if (generated.length > 0) {
        setThumbnailCandidates(generated);
        setSelectedThumbnailCandidateId(generated[0].id);
        return;
      }

      setThumbnailError("Could not capture thumbnail frames from this video.");
    } catch {
      setThumbnailError("Frame capture is unavailable for this video source.");
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const item = await fetchManageVideo(id);
        if (cancelled) return;

        setTitle(item.title || "");
        setDescription(item.description || "");
        setTags((item.tags || []).join(", "));
        setCategory(item.category || "ENTERTAINMENT");
        setVisibility(item.visibility || "PUBLIC");
        setThumbnailUrl(item.thumbnailUrl || "");
        setVideoUrl(item.hlsBaseUrl || "");
        setAutoGeneratePending(Boolean(!item.thumbnailUrl && item.hlsBaseUrl));
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load video");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      resetThumbnailCandidates();
    };
  }, [id]);

  useEffect(() => {
    if (!id || !videoUrl || !autoGeneratePending) return;
    void generateCandidates(videoUrl, id);
    setAutoGeneratePending(false);
  }, [id, videoUrl, autoGeneratePending]);

  const categoryOptions = useMemo(
    () => CATEGORIES.filter((value) => value !== "All").map((value) => ({ label: value, value: value.toUpperCase().replace(/\s+/g, "_") })),
    []
  );

  const onSave = async () => {
    if (!id) return;
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateVideo(id, {
        title: title.trim(),
        description: description.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 30),
        category: category as never,
        visibility
      });

      setSuccess("Video updated successfully.");
      window.setTimeout(() => navigate("/dashboard"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save video");
    } finally {
      setSaving(false);
    }
  };

  const onUploadThumbnailFile = async (file: File) => {
    if (!id) return;
    if (!file.type.startsWith("image/")) {
      setThumbnailError("Please choose a valid image file.");
      return;
    }

    try {
      setApplyingThumbnail(true);
      setThumbnailError("");
      const data = await uploadVideoThumbnail(id, file);
      if (data.item.thumbnailUrl) {
        setThumbnailUrl(`${data.item.thumbnailUrl}${data.item.thumbnailUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
      }

      const manualPreviewUrl = URL.createObjectURL(file);
      resetThumbnailCandidates();
      setThumbnailCandidates([{ id: "manual", previewUrl: manualPreviewUrl, source: "manual" }]);
      setSelectedThumbnailCandidateId("manual");
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : "Failed to upload thumbnail");
    } finally {
      setApplyingThumbnail(false);
    }
  };

  const onApplySelectedThumbnail = async () => {
    if (!id) return;
    const selected = thumbnailCandidates.find((item) => item.id === selectedThumbnailCandidateId);
    if (!selected?.file) {
      setThumbnailError("Select a generated thumbnail to apply.");
      return;
    }

    try {
      setApplyingThumbnail(true);
      setThumbnailError("");
      const data = await uploadVideoThumbnail(id, selected.file);
      if (data.item.thumbnailUrl) {
        setThumbnailUrl(`${data.item.thumbnailUrl}${data.item.thumbnailUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
      } else {
        setThumbnailUrl(selected.previewUrl);
      }
      setSuccess("Thumbnail updated successfully.");
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : "Failed to apply thumbnail");
    } finally {
      setApplyingThumbnail(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading video editor...</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft size={15} /> Back to dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Edit Video</h1>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {(error || success) && (
        <div className="space-y-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}
        </div>
      )}

      {thumbnailError && <p className="text-sm text-destructive">{thumbnailError}</p>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              className="w-full h-10 px-4 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={7}
              maxLength={5000}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Tags (comma separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tutorial, gaming, clips"
              className="w-full h-10 px-4 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-4 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "PRIVATE" | "UNLISTED")}
              className="w-full h-10 px-4 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>

          <div>
            <p className="block text-sm font-medium text-foreground mb-1.5">Thumbnail</p>
            <div className="rounded-xl overflow-hidden border border-border bg-background aspect-video">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="Current thumbnail" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No thumbnail yet</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => id && videoUrl && void generateCandidates(videoUrl, id)}
                disabled={generatingThumbnails || applyingThumbnail || !id || !videoUrl}
                className="h-9 px-3 rounded-lg border border-border text-xs text-foreground hover:bg-accent disabled:opacity-60"
              >
                {generatingThumbnails ? "Generating..." : "Generate 3 thumbnails"}
              </button>

              <label className="h-9 px-3 rounded-lg border border-border text-xs text-foreground hover:bg-accent inline-flex items-center cursor-pointer">
                Upload thumbnail
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void onUploadThumbnailFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {thumbnailCandidates.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Choose a thumbnail option:</p>
                <div className="grid grid-cols-3 gap-2">
                  {thumbnailCandidates.map((candidate) => {
                    const selected = candidate.id === selectedThumbnailCandidateId;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedThumbnailCandidateId(candidate.id)}
                        className={`rounded-lg overflow-hidden border ${selected ? "border-primary" : "border-border"}`}
                      >
                        <img src={candidate.previewUrl} alt="Thumbnail option" className="w-full aspect-video object-cover" />
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void onApplySelectedThumbnail()}
                  disabled={applyingThumbnail || !thumbnailCandidates.find((item) => item.id === selectedThumbnailCandidateId)?.file}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {applyingThumbnail ? "Applying..." : "Apply selected thumbnail"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
