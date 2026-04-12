import { useSearchParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { formatViewCount, formatDuration, formatRelativeTime, type VideoData } from "@/lib/mockData";
import { fetchSearchChannels, fetchSearchVideos } from "@/lib/api";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreMatch(haystack: string, query: string) {
  const normalizedHaystack = normalize(haystack);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  if (normalizedHaystack === normalizedQuery) return 200;
  if (normalizedHaystack.startsWith(normalizedQuery)) return 150;
  if (normalizedHaystack.includes(normalizedQuery)) return 100;

  let score = 0;
  for (const token of normalizedQuery.split(/\s+/).filter(Boolean)) {
    if (normalizedHaystack.startsWith(token)) score += 20;
    else if (normalizedHaystack.includes(token)) score += 10;
  }
  return score;
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
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
          fetchSearchVideos(query, "relevance"),
          fetchSearchChannels(query)
        ]);
        if (!cancelled) {
          const rankedVideos = videos
            .filter((video) => scoreMatch([video.title, video.channel.displayName, video.channel.username, ...(video.tags || [])].join(" "), query) > 0)
            .sort((a, b) => scoreMatch([b.title, b.channel.displayName, b.channel.username, ...(b.tags || [])].join(" "), query) - scoreMatch([a.title, a.channel.displayName, a.channel.username, ...(a.tags || [])].join(" "), query))
            .slice(0, 24);
          const rankedChannels = channels
            .filter((channel) => scoreMatch([channel.displayName, channel.username].join(" "), query) > 0)
            .sort((a, b) => scoreMatch([b.displayName, b.username].join(" "), query) - scoreMatch([a.displayName, a.username].join(" "), query))
            .slice(0, 24);

          setVideoResults(rankedVideos);
          setChannelResults(rankedChannels);
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
  }, [query]);

  const visibleVideoResults = useMemo(() => videoResults.slice(0, 24), [videoResults]);
  const visibleChannelResults = useMemo(() => channelResults.slice(0, 24), [channelResults]);

  return (
    <div className="p-4 lg:p-6 max-w-5xl space-y-6">
      <section className="rounded-[2rem] border border-border/60 bg-gradient-to-br from-surface via-background to-background p-5 lg:p-6 shadow-sm">
        <h1 className="text-2xl lg:text-3xl font-semibold text-foreground">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Type a video title, creator name, channel handle, or tag. Results are ranked to favor exact matches first.</p>
      </section>

      <div className="flex gap-3">
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos, channels, tags..."
          className="flex-1 h-10 px-4 rounded-full bg-surface border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
      </div>

      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm text-muted-foreground">
          {type === "videos" ? visibleVideoResults.length : visibleChannelResults.length} results{query && ` for "${query}"`}
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

        {type === "videos" && visibleVideoResults.map((v) => (
          <Link key={v.id} to={`/watch/${v.id}`} className="flex gap-4 group rounded-2xl p-2 hover:bg-surface transition-colors">
            <div className="relative w-56 sm:w-64 aspect-video min-h-[126px] sm:min-h-[144px] rounded-2xl overflow-hidden bg-surface flex-shrink-0 border border-border/60 block">
              <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" loading="lazy" decoding="async" width={640} height={360} sizes="(min-width: 640px) 256px, 224px" />
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
                <img src={v.channel.avatarUrl} alt={v.channel.displayName} className="w-6 h-6 rounded-full bg-surface" loading="lazy" decoding="async" width={24} height={24} />
                <span className="text-xs text-muted-foreground">{v.channel.displayName}</span>
              </div>
            </div>
          </Link>
        ))}

        {type === "channels" && visibleChannelResults.map((channel) => (
          <Link key={channel.username} to={`/channel/${channel.username}`} className="flex items-center gap-4 p-3 rounded-2xl bg-surface hover:bg-surface-hover transition-colors border border-border/60">
            <img src={channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"} alt={channel.displayName} className="w-14 h-14 rounded-full bg-background border border-border/60 object-cover" loading="lazy" decoding="async" width={56} height={56} />
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

        {type === "channels" && visibleChannelResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No channels found.</p>
        )}

        {type === "videos" && visibleVideoResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No videos found.</p>
        )}
      </div>
    </div>
  );
}
