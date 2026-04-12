export const CATEGORIES = [
  "All", "Entertainment", "Music", "Gaming", "Education", "Technology",
  "Sports", "News", "Travel", "Food", "Fashion", "Health", "Comedy",
  "Film", "Cars", "Pets", "DIY", "Science", "Vlogs"
] as const;

export interface VideoData {
  id: string;
  title: string;
  thumbnailUrl: string;
  hlsBaseUrl?: string;
  duration: number;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt: string;
  channel: {
    username: string;
    displayName: string;
    avatarUrl: string;
    subscriberCount: number;
    isVerified: boolean;
  };
  category: string;
  tags: string[];
}

export interface CommentData {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  user: {
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  replies: {
    id: string;
    body: string;
    createdAt: string;
    user: {
      username: string;
      displayName: string;
      avatarUrl: string;
    };
  }[];
}

export function formatViewCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatSubscriberCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M subscribers`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K subscribers`;
  return `${count} subscribers`;
}
