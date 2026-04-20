import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHistoryVideosPage, mapApiVideoToVideoData } from "@/lib/api";
import { formatViewCount, formatDuration, formatRelativeTime, type VideoData } from "@/lib/mockData";

type HistoryItem = {
  video: VideoData;
  watchedAt: string;
  watchPercent: number;
};

export default function HistoryPage() {
  const PAGE_SIZE = 80;
  const INITIAL_COUNT = 40;
  const LOAD_MORE_COUNT = 40;
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMoreServer, setHasMoreServer] = useState(true);
  const [loadingMoreServer, setLoadingMoreServer] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchHistoryVideosPage({ page: 1, limit: PAGE_SIZE })
      .then((result) => {
        setItems(result.items.map((row) => ({ video: mapApiVideoToVideoData(row.video), watchedAt: row.watchedAt, watchPercent: row.watchPercent })));
        setPage(1);
        setHasMoreServer(result.hasMore);
      })
      .catch(() => {
        setItems([]);
        setHasMoreServer(false);
      });
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_COUNT);
  }, [items]);

  useEffect(() => {
    if (visibleCount >= items.length && !hasMoreServer) return;
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;

      if (visibleCount < items.length) {
        setVisibleCount((count) => Math.min(count + LOAD_MORE_COUNT, items.length));
        return;
      }

      if (!hasMoreServer || loadingMoreServer) return;
      const nextPage = page + 1;
      setLoadingMoreServer(true);
      void fetchHistoryVideosPage({ page: nextPage, limit: PAGE_SIZE })
        .then((result) => {
          setItems((prev) => {
            const merged = [...prev, ...result.items.map((row) => ({ video: mapApiVideoToVideoData(row.video), watchedAt: row.watchedAt, watchPercent: row.watchPercent }))];
            const seen = new Set<string>();
            return merged.filter((item) => {
              const key = `${item.video.id}:${item.watchedAt}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          });
          setPage(nextPage);
          setHasMoreServer(result.hasMore);
        })
        .catch(() => {
          setHasMoreServer(false);
        })
        .finally(() => {
          setLoadingMoreServer(false);
        });
    }, { rootMargin: "500px 0px" });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreServer, items.length, loadingMoreServer, page, visibleCount]);

  const grouped = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of items.slice(0, visibleCount)) {
      const day = new Date(item.watchedAt).toLocaleDateString();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return Array.from(map.entries()).map(([label, videos]) => ({ label, videos }));
  }, [items, visibleCount]);

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Watch History</h1>
      </div>

      {grouped.length === 0 && <p className="text-sm text-muted-foreground">No watch history yet.</p>}

      <div className="space-y-8">
        {grouped.map(({ label, videos }) => (
          <div key={label}>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{label}</h3>
            <div className="space-y-3">
              {videos.map((entry) => {
                const v = entry.video;
                return (
                  <Link key={`${label}-${v.id}-${entry.watchedAt}`} to={`/clips/${v.id}`} className="flex gap-4 group">
                    <div className="relative w-44 aspect-video min-h-[99px] rounded-2xl overflow-hidden bg-surface flex-shrink-0 block">
                      <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" loading="lazy" decoding="async" width={640} height={360} sizes="176px" />
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium bg-background/80 text-foreground">
                        {formatDuration(v.duration)}
                      </span>
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
                        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, entry.watchPercent * 100))}%` }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:underline">{v.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{v.channel.displayName}</p>
                      <p className="text-xs text-muted-foreground">{formatViewCount(v.viewCount)} views · {formatRelativeTime(v.publishedAt)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {(visibleCount < items.length || hasMoreServer) && <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />}
    </div>
  );
}
