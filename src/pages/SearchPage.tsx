import { useSearchParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { formatViewCount, formatDuration, formatRelativeTime, type VideoData } from "@/lib/mockData";
import { fetchSearchChannels, fetchSearchVideos } from "@/lib/api";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("relevance");
  const [type, setType] = useState<"videos" | "channels">("videos");
  const [videoResults, setVideoResults] = useState<VideoData[]>([]);
  const [channelResults, setChannelResults] = useState<Array<{ username: string; displayName: string; avatarUrl: string | null; subscriberCount: number; isVerified?: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) {
      setVideoResults([]);
      setChannelResults([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const [videos, channels] = await Promise.all([
          fetchSearchVideos(query, sort as "relevance" | "views" | "date"),
          fetchSearchChannels(query)
        ]);
        if (!cancelled) {
          setVideoResults(videos);
          setChannelResults(channels);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, sort]);

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      <div className="flex gap-3 mb-6">
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos, channels, tags..."
          className="flex-1 h-10 px-4 rounded-full bg-surface border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="h-10 px-4 rounded-full bg-surface border border-border text-foreground text-sm focus:outline-none">
          <option value="relevance">Relevance</option>
          <option value="views">Most views</option>
          <option value="date">Newest</option>
        </select>
      </div>

      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm text-muted-foreground">
          {type === "videos" ? videoResults.length : channelResults.length} results{query && ` for "${query}"`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setType("videos")}
            className={`h-8 px-3 rounded-full text-xs font-medium ${type === "videos" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            Videos
          </button>
          <button
            onClick={() => setType("channels")}
            className={`h-8 px-3 rounded-full text-xs font-medium ${type === "channels" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            Channels
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Searching...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {type === "videos" && videoResults.map((v) => (
          <Link key={v.id} to={`/watch/${v.id}`} className="flex gap-4 group">
            <div className="relative w-64 aspect-video rounded-lg overflow-hidden bg-surface flex-shrink-0">
              <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-xs font-medium bg-background/80 text-foreground">
                {formatDuration(v.duration)}
              </span>
            </div>
            <div className="flex-1 min-w-0 py-1">
              <h3 className="text-base font-medium text-foreground line-clamp-2 group-hover:underline">{v.title}</h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                {formatViewCount(v.viewCount)} views · {formatRelativeTime(v.publishedAt)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <img src={v.channel.avatarUrl} alt={v.channel.displayName} className="w-6 h-6 rounded-full bg-surface" />
                <span className="text-xs text-muted-foreground">{v.channel.displayName}</span>
              </div>
            </div>
          </Link>
        ))}

        {type === "channels" && channelResults.map((channel) => (
          <Link key={channel.username} to={`/channel/${channel.username}`} className="flex items-center gap-4 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
            <img src={channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"} alt={channel.displayName} className="w-14 h-14 rounded-full bg-background" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {channel.displayName}
                {channel.isVerified && <span className="ml-1 text-text-tertiary">✓</span>}
              </p>
              <p className="text-xs text-muted-foreground">@{channel.username}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatViewCount(channel.subscriberCount)} subscribers</p>
            </div>
          </Link>
        ))}

        {type === "channels" && channelResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No channels found.</p>
        )}

        {type === "videos" && videoResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No videos found.</p>
        )}
      </div>
    </div>
  );
}
