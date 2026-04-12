import { isClipLikeVideo } from "@/lib/api";
import type { VideoData } from "@/lib/mockData";

export type FeedSortMode = "latest" | "oldest" | "popular" | "best" | "mostViewed" | "leastViewed";

export const FEED_SORT_OPTIONS: Array<{ value: FeedSortMode; label: string }> = [
  { value: "latest", label: "Latest" },
  { value: "popular", label: "Popular" },
  { value: "best", label: "Best" }
];

function getPublishedTime(video: VideoData) {
  return new Date(video.publishedAt || video.createdAt || 0).getTime();
}

function getAgeDays(video: VideoData) {
  const ageMs = Math.max(Date.now() - getPublishedTime(video), 0);
  return Math.max(ageMs / (1000 * 60 * 60 * 24), 1);
}

function getPopularScore(video: VideoData) {
  return video.viewCount / getAgeDays(video);
}

function getBestScore(video: VideoData) {
  const ageDays = getAgeDays(video);
  const freshness = 100 / Math.max(Math.sqrt(ageDays), 1);
  return Math.log10(video.viewCount + 1) * 120 + freshness;
}

export function sortFeedVideos(videos: VideoData[], mode: FeedSortMode) {
  const items = [...videos];

  const comparePublishedDesc = (a: VideoData, b: VideoData) => getPublishedTime(b) - getPublishedTime(a) || b.viewCount - a.viewCount;
  const comparePublishedAsc = (a: VideoData, b: VideoData) => getPublishedTime(a) - getPublishedTime(b) || a.viewCount - b.viewCount;

  switch (mode) {
    case "oldest":
      return items.sort(comparePublishedAsc);
    case "popular":
      return items.sort((a, b) => getPopularScore(b) - getPopularScore(a) || comparePublishedDesc(a, b));
    case "best":
      return items.sort((a, b) => getBestScore(b) - getBestScore(a) || comparePublishedDesc(a, b));
    case "mostViewed":
      return items.sort((a, b) => b.viewCount - a.viewCount || comparePublishedDesc(a, b));
    case "leastViewed":
      return items.sort((a, b) => a.viewCount - b.viewCount || comparePublishedAsc(a, b));
    case "latest":
    default:
      return items.sort(comparePublishedDesc);
  }
}

export function splitFeedVideos(videos: VideoData[]) {
  const clips: VideoData[] = [];
  const landscape: VideoData[] = [];

  for (const video of videos) {
    if (isClipLikeVideo(video)) {
      clips.push(video);
    } else {
      landscape.push(video);
    }
  }

  return { clips, landscape };
}

function getEngagementScore(video: VideoData) {
  const likeScore = video.likeCount || 0;
  const commentScore = video.commentCount || 0;
  const shareScore = video.shareCount || 0;
  return likeScore * 3 + commentScore * 2 + shareScore * 4;
}

export function sortShortsVideos(videos: VideoData[]) {
  return [...videos].sort((a, b) => {
    const engagementDelta = getEngagementScore(b) - getEngagementScore(a);
    if (engagementDelta !== 0) return engagementDelta;

    const likesDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likesDelta !== 0) return likesDelta;

    const sharesDelta = (b.shareCount || 0) - (a.shareCount || 0);
    if (sharesDelta !== 0) return sharesDelta;

    const ageDelta = new Date(b.publishedAt || b.createdAt || 0).getTime() - new Date(a.publishedAt || a.createdAt || 0).getTime();
    if (ageDelta !== 0) return ageDelta;

    return b.viewCount - a.viewCount;
  });
}