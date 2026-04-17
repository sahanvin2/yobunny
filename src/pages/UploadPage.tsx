import { Upload, Film, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES } from "@/lib/mockData";
import { fetchMe, uploadVideoFile } from "@/lib/api";

const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

async function generateThumbnailCandidatesFromFile(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = sourceUrl;
  video.muted = true;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video for thumbnail generation"));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) return [] as File[];

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
          reject(new Error("Failed to seek video frame"));
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
      if (!ctx) throw new Error("Failed to create thumbnail canvas context");
      ctx.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((next) => {
          if (!next) {
            reject(new Error("Failed to capture thumbnail frame"));
            return;
          }
          resolve(next);
        }, "image/jpeg", 0.9);
      });

      return new File([blob], `thumbnail-${index + 1}.jpg`, { type: "image/jpeg" });
    };

    const generated: File[] = [];
    for (let i = 0; i < points.length && generated.length < 3; i += 1) {
      const thumb = await captureAt(points[i], i);
      generated.push(thumb);
    }

    return generated;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
}

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailCandidates, setThumbnailCandidates] = useState<File[]>([]);
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState(0);
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("ENTERTAINMENT");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [modelNames, setModelNames] = useState("");
  const [tags, setTags] = useState("");
  const [selectedChannelId, setSelectedChannelIdState] = useState("");

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedId, setUploadedId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const uploadLockRef = useRef(false);

  const resetThumbnailCandidates = () => {
    setThumbnailCandidates([]);
    setSelectedThumbnailIndex(0);
  };

  const generateVideoThumbnails = async (videoFile: File) => {
    try {
      setGeneratingThumbnails(true);
      const generated = await generateThumbnailCandidatesFromFile(videoFile);
      if (generated.length > 0) {
        setThumbnailCandidates(generated);
        setSelectedThumbnailIndex(0);
        setThumbnail(generated[0]);
        setStatus("Generated thumbnails from your video. Pick one you like.");
      } else {
        resetThumbnailCandidates();
        setStatus("Upload will continue without a thumbnail unless you choose one.");
      }
    } catch {
      resetThumbnailCandidates();
      setStatus("Could not auto-generate thumbnails from this file. You can still upload or choose one manually.");
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  const handleFile = async (next: File) => {
    if (uploading) return;
    if (!next.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }

    if (next.size > MAX_VIDEO_UPLOAD_BYTES) {
      setError(`Video is too large. Max allowed size is ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`);
      return;
    }

    // Get video metadata
    try {
      const url = URL.createObjectURL(next);
      const video = document.createElement("video");
      
      const onLoadedMetadata = () => {
        setVideoMeta({
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0
        });
        URL.revokeObjectURL(url);
      };

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.src = url;

      setTimeout(() => {
        if (!video.duration) {
          URL.revokeObjectURL(url);
          setVideoMeta({ duration: 0, width: 0, height: 0 });
        }
      }, 3000);
    } catch {
      setVideoMeta({ duration: 0, width: 0, height: 0 });
    }

    setFile(next);
    setThumbnail(null);
    resetThumbnailCandidates();
    setTitle(next.name.replace(/\.[^.]+$/, ""));
    setStatus("File ready for upload");
    setError("");
    setProgress(0);
    setUploadedId("");
    const generatedSessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setUploadSessionId(generatedSessionId);
    void generateVideoThumbnails(next);
  };

  const videoPreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const thumbnailPreviewUrl = useMemo(() => (thumbnail ? URL.createObjectURL(thumbnail) : ""), [thumbnail]);
  const candidatePreviewUrls = useMemo(() => thumbnailCandidates.map((item) => URL.createObjectURL(item)), [thumbnailCandidates]);

  useEffect(() => {
    void fetchMe()
      .then((user) => {
        setSelectedChannelIdState(`primary-${user.id}`);
        setModelNames((prev) => prev.trim() || user.displayName || "Leia Von");
      })
      .catch(() => {
        setSelectedChannelIdState("");
      });
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
      for (const url of candidatePreviewUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [videoPreviewUrl, thumbnailPreviewUrl, candidatePreviewUrls]);

  const toCategoryEnum = (value: string) => value.toUpperCase().replace(/\s+/g, "_");

  const onPublish = async () => {
    if (!file || uploadLockRef.current || uploading) return;

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!selectedChannelId) {
      setError("Model profile not ready yet. Please sign in again.");
      return;
    }

    const parsedModels = modelNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (parsedModels.length === 0) {
      setError("Please add at least one model name.");
      return;
    }

    try {
      uploadLockRef.current = true;
      setUploading(true);
      setError("");
      setStatus("Uploading video...");
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);
      if (thumbnail) formData.append("thumbnail", thumbnail);
      formData.append("title", title.trim());
      formData.append("category", toCategoryEnum(category));
      formData.append("visibility", visibility);
      formData.append("description", description.trim());
      const formattedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      if (selectedChannelId) {
        formData.append("creatorChannelId", selectedChannelId);
        formattedTags.push(`__CHANNEL__:${selectedChannelId}`);
      }
      formData.append("modelNames", parsedModels.join(","));
      formData.append("tags", formattedTags.join(","));
      if (videoMeta) {
        formData.append("videoDuration", String(Math.round(videoMeta.duration || 0)));
        formData.append("videoWidth", String(videoMeta.width || 0));
        formData.append("videoHeight", String(videoMeta.height || 0));
      }
      if (uploadSessionId) {
        formData.append("uploadSessionId", uploadSessionId);
      }

      const result = await uploadVideoFile(
        formData,
        (percent) => setProgress(percent),
        { uploadSessionId }
      );
      setProgress(100);
      setStatus("✓ Uploaded successfully. Your video is now live!");
      setUploadedId(result.item.id);
      setTimeout(() => {
        window.location.href = `/dashboard`;
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("");
    } finally {
      uploadLockRef.current = false;
      setUploading(false);
    }
  };

  if (!file) {
    return (
      <div className="p-4 lg:p-10 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-3 tracking-tight">Upload Video</h1>
          <p className="text-base text-muted-foreground/80">Share your content with the world</p>
        </div>
        <div
          onDragOver={(e) => {
            if (uploading) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (uploading) return;
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className={`group relative overflow-hidden rounded-[2rem] border-2 border-dashed p-16 text-center transition-all duration-500 cursor-pointer ${
            dragOver ? "border-primary bg-primary/10 shadow-[0_0_40px_rgba(255,255,255,0.1)] scale-[1.02]" : "border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.04] shadow-2xl"
          }`}
          onClick={() => {
            if (uploading) return;
            document.getElementById("upload-file-input")?.click();
          }}
        >
          {/* Subtle animated gradient background when hovering */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />
          
          <div className="relative z-10 flex flex-col items-center justify-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-lg group-hover:scale-110 transition-transform duration-500 ease-out">
               <Upload size={40} className="text-white/80 group-hover:text-white transition-colors duration-300" />
            </div>
            <h2 className="text-2xl font-semibold text-white tracking-tight mb-3">Drag and drop your video here</h2>
            <p className="text-base text-white/50 mb-8 max-w-sm mx-auto">Or click the button below to browse files from your computer</p>
            
            <button className="px-8 py-3.5 rounded-full bg-white text-black font-semibold text-sm hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              Select video file
            </button>
            <p className="text-xs font-medium text-white/40 mt-8 uppercase tracking-widest">One video at a time • Supported: MP4, WebM, MOV • Max 100MB</p>
          </div>
          <input
            id="upload-file-input"
            type="file"
            accept="video/*"
            disabled={uploading}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
      
      <div className="relative z-10 flex items-center justify-between mb-8">
         <h1 className="text-3xl font-bold tracking-tight text-white">Video Details</h1>
         <div className="px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-medium text-white/70 backdrop-blur-md">
            Draft
         </div>
      </div>

      {/* Video Info Card */}
      <div className="mb-8 p-5 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="relative z-10 flex items-start gap-5">
          <div className="flex-shrink-0">
            <Film size={24} className="text-muted-foreground mt-1" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground mb-1 truncate">{file.name}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                📦 {formatBytes(file.size)}
              </span>
              {videoMeta?.duration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {formatDuration(videoMeta.duration)}
                </span>
              )}
              {videoMeta?.width && videoMeta?.height && (
                <span className="flex items-center gap-1">
                  📹 {videoMeta.width}x{videoMeta.height}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Progress Bar */}
      {uploading && (
        <div className="mb-6 p-4 bg-surface rounded-2xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">Uploading</p>
            <p className="text-sm font-semibold text-primary">{progress}%</p>
          </div>
          <div className="w-full h-2.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{status}</p>
        </div>
      )}

      {/* Status Messages */}
      {(status || error) && !uploading && (
        <div className="mb-6 p-4 rounded-2xl border border-border flex items-start gap-3"
          style={{
            backgroundColor: error ? "rgba(220, 38, 38, 0.1)" : "rgba(34, 197, 94, 0.1)",
            borderColor: error ? "rgba(220, 38, 38, 0.3)" : "rgba(34, 197, 94, 0.3)"
          }}
        >
          {error ? (
            <AlertCircle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm" style={{ color: error ? "#dc2626" : "#22c55e" }}>
            {status || error}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10 shadow-xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <div className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium text-white border border-white/10">Preview</div>
          </div>
          <p className="text-sm text-white/60 mb-4 font-semibold uppercase tracking-wider">Video</p>
          <div className="rounded-2xl overflow-hidden border border-white/5 shadow-inner bg-black aspect-video relative">
            <video src={videoPreviewUrl} controls className="w-full h-full object-contain" />
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10 shadow-xl relative group">
          <p className="text-sm text-white/60 mb-4 font-semibold uppercase tracking-wider">Thumbnail</p>
          {thumbnailPreviewUrl ? (
            <img
              src={thumbnailPreviewUrl}
              alt="Thumbnail preview"
              className="w-full aspect-video rounded-xl object-cover bg-background mb-3"
              loading="lazy"
              decoding="async"
              width={1280}
              height={720}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full aspect-video rounded-xl bg-background border border-border mb-3 flex items-center justify-center text-xs text-muted-foreground">
              No thumbnail selected
            </div>
          )}

          {candidatePreviewUrls.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-muted-foreground">Generated from video:</p>
              <div className="grid grid-cols-3 gap-2">
                {candidatePreviewUrls.map((previewUrl, index) => (
                  <button
                    key={previewUrl}
                    type="button"
                    onClick={() => {
                      setSelectedThumbnailIndex(index);
                      setThumbnail(thumbnailCandidates[index]);
                    }}
                    className={`rounded-lg overflow-hidden border ${selectedThumbnailIndex === index ? "border-primary" : "border-border"}`}
                  >
                    <img
                      src={previewUrl}
                      alt={`Generated thumbnail ${index + 1}`}
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                      decoding="async"
                      width={320}
                      height={180}
                      sizes="(min-width: 1024px) 10vw, 28vw"
                      onError={(event) => {
                        event.currentTarget.style.opacity = "0.4";
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!file || generatingThumbnails}
              onClick={() => file && void generateVideoThumbnails(file)}
              className="inline-flex items-center px-4 h-9 rounded-full bg-secondary text-secondary-foreground text-xs font-medium hover:bg-surface-hover disabled:opacity-60"
            >
              {generatingThumbnails ? "Generating..." : "Generate from video"}
            </button>

            <label className="inline-flex items-center px-4 h-9 rounded-full bg-secondary text-secondary-foreground text-xs font-medium cursor-pointer hover:bg-surface-hover">
              Choose thumbnail
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  if (!next) return;
                  setThumbnail(next);
                  resetThumbnailCandidates();
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative z-10">
        <div>
          <label className="block text-sm font-semibold text-white mb-2 ml-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all placeholder:text-white/20 shadow-inner"
            placeholder="Give your video a catchy title..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2 ml-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={5000}
            className="w-full px-5 py-4 rounded-2xl bg-black/40 border border-white/10 text-white text-base resize-none focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all placeholder:text-white/20 shadow-inner"
            placeholder="Tell viewers about your video..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-2 ml-1">Upload to model profile</label>
            <input
              value={modelNames.split(",")[0]?.trim() || "Leia Von"}
              disabled
              className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white/80 text-base shadow-inner"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2 ml-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 transition-all shadow-inner appearance-none relative"
              style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
            >
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <option key={c} value={c} className="bg-background text-white">{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2 ml-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 transition-all shadow-inner appearance-none relative"
              style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
            >
              <option value="PUBLIC" className="bg-background text-white">Public - Anyone can find and view</option>
              <option value="UNLISTED" className="bg-background text-white">Unlisted - Anyone with link can view</option>
              <option value="PRIVATE" className="bg-background text-white">Private - Only you can view</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2 ml-1">Models (required)</label>
          <input
            value={modelNames}
            onChange={(e) => setModelNames(e.target.value)}
            placeholder="Leia Von"
            className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 transition-all placeholder:text-white/20 shadow-inner"
          />
          <p className="text-xs text-white/45 mt-2 ml-1">Every upload must include at least one model tag. Cherry Moon is treated as Leia Von.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2 ml-1">Tags</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="gaming, tutorial, 2026 (comma separated)"
            className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 transition-all placeholder:text-white/20 shadow-inner"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-end mt-8 pt-6 border-t border-white/10">
          <button
            disabled={uploading || !selectedChannelId}
            onClick={onPublish}
            className="w-full sm:w-auto px-10 py-4 rounded-full bg-white text-black text-base font-bold hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
            {uploading ? (
               <span className="flex items-center gap-2">
                 <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                 Uploading...
               </span>
            ) : "Publish Video"}
          </button>

          {uploadedId && (
            <Link to={`/clips/${uploadedId}`} className="text-sm text-foreground underline underline-offset-4">
              View uploaded video
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
