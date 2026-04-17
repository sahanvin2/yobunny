import type { VideoData, CommentData } from "@/lib/mockData";

// Use relative /api path in development to use Vite proxy, or fallback to env URL in production
const rawApiBase = typeof window !== "undefined" && !window.location.hostname.includes("localhost")
  ? (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "/api")
  : "/api";
export const API_BASE = rawApiBase.replace(/\/$/, "");
export const AUTO_CLIP_TAG = "__AUTO_CLIP__";

type ApiUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  profileImageUrl?: string | null;
  subscriberCount: number;
  isVerified?: boolean;
};

type ApiVideo = {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  hlsBaseUrl?: string | null;
  duration?: number | null;
  status?: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "SCHEDULED";
  visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED";
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt?: string | null;
  createdAt: string;
  category: string;
  tags: string[];
  user?: ApiUser;
};

export type ApiLivestream = {
  id: string;
  title: string;
  description?: string | null;
  roomId: string;
  status: "LIVE" | "OFFLINE" | "ENDED";
  startedAt?: string | null;
  endedAt?: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  user?: ApiUser;
};

export type ApiModelSummary = {
  slug: string;
  name: string;
  videoCount: number;
  creatorCount?: number;
  totalViews: number;
  thumbnailUrl: string | null;
  primaryAccountUsername?: string | null;
  age?: number | null;
  bodyMeasurements?: string | null;
  height?: string | null;
  profileBio?: string | null;
};

export type ApiModelProfile = {
  slug: string;
  name: string;
  videoCount: number;
  creatorCount: number;
  totalViews: number;
  thumbnailUrl: string | null;
  primaryAccountUsername?: string | null;
  age?: number | null;
  bodyMeasurements?: string | null;
  height?: string | null;
  profileBio?: string | null;
};

export type ApiCreatorSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  subscriberCount: number;
  isVerified?: boolean;
  videoCount: number;
  totalViews: number;
  previewThumbnailUrl: string | null;
};

function mapUserToChannel(user?: ApiUser): VideoData["channel"] {
  return {
    username: user?.username || "unknown",
    displayName: user?.displayName || "Unknown Creator",
    avatarUrl: user?.avatarUrl || user?.profileImageUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff",
    subscriberCount: user?.subscriberCount || 0,
    isVerified: Boolean(user?.isVerified)
  };
}

export function mapApiVideoToVideoData(video: ApiVideo): VideoData {
  const thumbVersion = encodeURIComponent(video.publishedAt || video.createdAt || "0");
  const fallbackThumb = `${API_BASE}/videos/${video.id}/thumbnail?v=${thumbVersion}`;
  return {
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl || fallbackThumb,
    hlsBaseUrl: video.hlsBaseUrl || undefined,
    duration: video.duration || 0,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    publishedAt: video.publishedAt || video.createdAt,
    category: video.category,
    tags: video.tags || [],
    channel: mapUserToChannel(video.user)
  };
}

export function isAutoClipVideo(video: VideoData): boolean {
  return Boolean(video.duration > 0 && video.duration <= 60 && video.tags.includes(AUTO_CLIP_TAG));
}

function hasPortraitTag(video: VideoData): boolean {
  const tags = (video.tags || []).map((tag) => String(tag).toLowerCase());
  return tags.includes("__portrait__") || tags.includes("portrait");
}

export function isClipLikeVideo(video: VideoData): boolean {
  return isAutoClipVideo(video) || hasPortraitTag(video);
}

const orientationCache = new Map<string, boolean>();

async function detectPortraitFromThumbnail(video: VideoData): Promise<boolean> {
  const key = video.id || video.thumbnailUrl;
  if (orientationCache.has(key)) {
    return orientationCache.get(key)!;
  }

  const isPortrait = await new Promise<boolean>((resolve) => {
    const image = new Image();
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image.naturalHeight > image.naturalWidth);
    image.onerror = () => resolve(false);
    image.src = video.thumbnailUrl;
  });

  orientationCache.set(key, isPortrait);
  return isPortrait;
}

function hasClipTag(video: VideoData): boolean {
  const tags = video.tags.map((tag) => tag.toLowerCase());
  return tags.includes(AUTO_CLIP_TAG.toLowerCase()) || tags.includes("__portrait__") || tags.includes("portrait");
}

export async function partitionVideosByFormat(videos: VideoData[]) {
  const clips: VideoData[] = [];
  const regularVideos: VideoData[] = [];

  const checks = await Promise.all(videos.map(async (video) => {
    let isClip = hasClipTag(video);
    if (!isClip) {
      isClip = await detectPortraitFromThumbnail(video);
    }
    return { video, isClip };
  }));

  for (const { video, isClip } of checks) {
    if (isClip) {
      clips.push(video);
    } else {
      regularVideos.push(video);
    }
  }

  return { clips, regularVideos };
}

export async function fetchVideos(params?: { category?: string; sort?: "latest" | "views"; page?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "All") query.set("category", params.category.toUpperCase());
  if (params?.sort) query.set("sort", params.sort);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  const url = `${API_BASE}/videos?${query.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json() as { items: ApiVideo[] };
    return data.items.map(mapApiVideoToVideoData);
  } catch (error) {
    console.error(`[API] Failed to fetch videos from ${url}:`, error);
    throw error;
  }
}

export async function fetchAllVideos(params?: { category?: string; sort?: "latest" | "views"; limitPerPage?: number; maxPages?: number }) {
  const limitPerPage = Math.min(Math.max(params?.limitPerPage ?? 60, 1), 200);
  const maxPages = Math.max(params?.maxPages ?? 5, 1);
  const all: VideoData[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const items = await fetchVideos({
      category: params?.category,
      sort: params?.sort,
      page,
      limit: limitPerPage
    });

    let added = 0;
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
      added += 1;
    }

    if (items.length < limitPerPage || added === 0) {
      break;
    }
  }

  return all;
}

export async function fetchTrendingVideos() {
  const res = await fetch(`${API_BASE}/videos/trending`);
  if (!res.ok) throw new Error("Failed to fetch trending videos");
  const data = await res.json() as { items: ApiVideo[] };
  return data.items.map(mapApiVideoToVideoData);
}

export async function fetchSearchVideos(query: string, sort: "relevance" | "views" | "date") {
  if (!query.trim()) return [] as VideoData[];
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&type=videos&sort=${sort}&page=1`);
  if (!res.ok) throw new Error("Failed to search videos");
  const data = await res.json() as { items: ApiVideo[] };
  return data.items.map(mapApiVideoToVideoData);
}

export async function fetchSearchChannels(query: string) {
  if (!query.trim()) return [] as ApiUser[];
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&type=users&sort=relevance&page=1`);
  if (!res.ok) throw new Error("Failed to search channels");
  const data = await res.json() as { items: ApiUser[] };
  return data.items;
}

export async function fetchSearchModels(query: string) {
  if (!query.trim()) return [] as ApiModelSummary[];
  const res = await fetch(`${API_BASE}/videos/models?q=${encodeURIComponent(query)}&limit=24`);
  if (!res.ok) throw new Error("Failed to search models");
  const data = await res.json() as { items: ApiModelSummary[] };
  return data.items;
}

export async function fetchModelSummaries(params?: { q?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.q?.trim()) query.set("q", params.q.trim());
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  const res = await fetch(`${API_BASE}/videos/models${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch models");
  const data = await res.json() as { items: ApiModelSummary[] };
  return data.items;
}

export async function fetchModelVideos(modelSlug: string) {
  const res = await fetch(`${API_BASE}/videos/models/${encodeURIComponent(modelSlug)}`);
  if (!res.ok) throw new Error("Model not found");
  const data = await res.json() as { model: ApiModelProfile; items: ApiVideo[] };
  return {
    model: data.model,
    items: data.items.map(mapApiVideoToVideoData)
  };
}

export async function fetchCreatorSummaries(params?: { category?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "All") {
    query.set("category", params.category.toUpperCase());
  }
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  const res = await fetch(`${API_BASE}/users/creators${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch creators");
  const data = await res.json() as { items: ApiCreatorSummary[] };
  return data.items;
}

export async function fetchVideoById(id: string) {
  const res = await fetch(`${API_BASE}/videos/${id}`);
  if (!res.ok) throw new Error("Video not found");
  const data = await res.json() as { item: ApiVideo & { user?: ApiUser; qualities?: Array<{ resolution: string; hlsUrl: string }> } };
  return {
    video: mapApiVideoToVideoData(data.item),
    playbackUrl: data.item.hlsBaseUrl || "",
    qualities: data.item.qualities || [],
    description: data.item.description || "",
    channel: mapUserToChannel(data.item.user)
  };
}

export async function fetchVideoComments(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/comments`);
  if (!res.ok) throw new Error("Failed to load comments");
  const data = await res.json() as { items: CommentData[] };
  return data.items;
}

export async function addComment(videoId: string, body: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
  if (!res.ok) throw new Error("Failed to add comment");
}

export async function toggleLike(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/like`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to toggle like");
  return res.json() as Promise<{ liked: boolean }>;
}

export async function toggleSave(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/save`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to toggle save");
  return res.json() as Promise<{ saved: boolean }>;
}

export async function fetchVideoInteractions(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/interactions`);
  if (!res.ok) throw new Error("Failed to fetch video interactions");
  return res.json() as Promise<{ liked: boolean; saved: boolean }>;
}

export async function reportVideoWatch(videoId: string, watchPercent: number) {
  const normalized = Math.max(0, Math.min(1, watchPercent));
  const res = await fetch(`${API_BASE}/videos/${videoId}/watch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watchPercent: normalized }),
    keepalive: true
  });

  if (!res.ok) {
    throw new Error("Failed to report watch progress");
  }
}

export async function reportVideoView(videoId: string) {
  try {
    await fetch(`${API_BASE}/videos/${videoId}/view`, {
      method: "POST",
      keepalive: true
    });
  } catch {
    // Best-effort endpoint; swallow network errors so playback stays smooth.
  }
}

export async function fetchSavedVideos() {
  const res = await fetch(`${API_BASE}/users/me/saved`);
  if (!res.ok) throw new Error("Failed to fetch saved videos");
  const data = await res.json() as { items: Array<{ video: ApiVideo }> };
  return data.items.map((item) => mapApiVideoToVideoData(item.video));
}

export async function fetchLikedVideos() {
  const res = await fetch(`${API_BASE}/users/me/liked`);
  if (!res.ok) throw new Error("Failed to fetch liked videos");
  const data = await res.json() as { items: Array<{ video: ApiVideo }> };
  return data.items.map((item) => mapApiVideoToVideoData(item.video));
}

export async function fetchHistoryVideos() {
  const res = await fetch(`${API_BASE}/users/me/history`);
  if (!res.ok) throw new Error("Failed to fetch history");
  const data = await res.json() as { items: Array<{ video: ApiVideo; watchedAt: string; watchPercent: number }> };
  return data.items;
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error("Failed to fetch current user");
  const data = await res.json() as { user: ApiUser & { bio?: string | null; email?: string } };
  return data.user;
}

export async function updateMe(payload: { displayName?: string; username?: string; bio?: string; avatarUrl?: string; bannerUrl?: string; profileImageUrl?: string }) {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to save profile" }));
    throw new Error(data.error || "Failed to save profile");
  }

  return res.json();
}

export async function uploadProfileMedia(kind: "avatar" | "banner", file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/users/me/${kind}`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to upload image" }));
    throw new Error(data.error || "Failed to upload image");
  }

  return res.json() as Promise<{ item: ApiUser & { bio?: string | null; email?: string } }>;
}

export async function fetchNotifications() {
  const res = await fetch(`${API_BASE}/users/me/notifications`);
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return (await res.json()) as { items: Array<{ id: string; message: string; type: string; createdAt: string; isRead: boolean }> };
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${API_BASE}/users/me/notifications/read-all`, { method: "PATCH" });
  if (!res.ok) throw new Error("Failed to mark notifications as read");
}

export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/users/me/dashboard`);
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return (await res.json()) as { item: { totalViews: number; subscribers: number; videoCount: number } };
}

export async function fetchMyVideos() {
  const res = await fetch(`${API_BASE}/users/me/videos`);
  if (!res.ok) throw new Error("Failed to fetch creator videos");
  const data = await res.json() as { items: ApiVideo[] };
  return data.items.filter((item) => item.status === "READY").map(mapApiVideoToVideoData);
}

export type ManageVideoItem = {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  viewCount: number;
  publishedAt?: string | null;
  createdAt: string;
  category: string;
  visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "SCHEDULED";
};

export async function fetchMyManageVideos() {
  const res = await fetch(`${API_BASE}/users/me/videos`);
  if (!res.ok) throw new Error("Failed to fetch creator videos");
  const data = await res.json() as { items: ApiVideo[] };
  return data.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    duration: item.duration,
    viewCount: item.viewCount,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    category: item.category,
    visibility: item.visibility || "PUBLIC",
    status: item.status || "READY"
  } satisfies ManageVideoItem));
}

export async function fetchManageVideo(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/manage`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to fetch video" }));
    throw new Error(data.error || "Failed to fetch video");
  }

  const data = await res.json() as {
    item: {
      id: string;
      title: string;
      description?: string | null;
      tags: string[];
      category: string;
      visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
      thumbnailUrl?: string | null;
      hlsBaseUrl?: string | null;
    };
  };

  return data.item;
}

export async function uploadVideoThumbnail(videoId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/videos/${videoId}/thumbnail`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to upload thumbnail" }));
    throw new Error(data.error || "Failed to upload thumbnail");
  }

  return res.json() as Promise<{ item: { thumbnailUrl?: string | null } }>;
}

export async function updateVideo(videoId: string, payload: { title?: string; description?: string; tags?: string[]; visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED"; category?: string; thumbnailUrl?: string }) {
  const res = await fetch(`${API_BASE}/videos/${videoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to update video" }));
    throw new Error(data.error || "Failed to update video");
  }
}

export async function retryVideoUpload(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/retry-upload`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to retry upload" }));
    throw new Error(data.error || "Failed to retry upload");
  }

  return res.json() as Promise<{ ok: boolean; item: ManageVideoItem; message?: string }>;
}

export async function deleteVideo(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to delete video" }));
    throw new Error(data.error || "Failed to delete video");
  }
}

export async function uploadVideoFile(
  formData: FormData,
  onProgress?: (percent: number) => void,
  options?: { uploadSessionId?: string }
) {
  return new Promise<{ item: ApiVideo }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/videos/upload-file`);

    if (options?.uploadSessionId) {
      xhr.setRequestHeader("X-Upload-Session-Id", options.uploadSessionId);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(percent);
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json as { item: ApiVideo });
        } else {
          reject(new Error(json.error || "Upload failed"));
        }
      } catch {
        reject(new Error("Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export async function fetchDownloadUrl(videoId: string) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/download-url`);
  if (!res.ok) throw new Error("Failed to get download url");
  const data = await res.json() as { url: string };
  return data.url;
}

export async function fetchLiveStreams() {
  const res = await fetch(`${API_BASE}/streams`);
  if (!res.ok) throw new Error("Failed to fetch streams");
  const data = await res.json() as { items: ApiLivestream[] };
  return data.items;
}

export async function fetchAllStreams() {
  const res = await fetch(`${API_BASE}/streams/all`);
  if (!res.ok) throw new Error("Failed to fetch streams");
  const data = await res.json() as { items: ApiLivestream[] };
  return data.items;
}

export async function fetchMyStreams() {
  const res = await fetch(`${API_BASE}/streams/me`);
  if (!res.ok) throw new Error("Failed to fetch your streams");
  const data = await res.json() as { items: ApiLivestream[] };
  return data.items;
}

export async function createStream(payload: { title: string; description?: string }) {
  const res = await fetch(`${API_BASE}/streams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to create stream" }));
    throw new Error(data.error || "Failed to create stream");
  }
  const data = await res.json() as { item: ApiLivestream };
  return data.item;
}

export async function updateStreamStatus(streamId: string, status: "LIVE" | "OFFLINE" | "ENDED") {
  const res = await fetch(`${API_BASE}/streams/${streamId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to update stream status" }));
    throw new Error(data.error || "Failed to update stream status");
  }
  const data = await res.json() as { item: ApiLivestream };
  return data.item;
}
