import { Link } from "react-router-dom";
import { Clock, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatRelativeTime, formatViewCount, type VideoData } from "@/lib/mockData";
import { openSmartlinkAd } from "@/lib/smartlinkAd";

interface ClipGridProps {
  clips: VideoData[];
  mode?: "grid" | "row";
  hasMoreFromServer?: boolean;
  loadingMore?: boolean;
  onReachEnd?: () => void | Promise<void>;
}

export default function ClipGrid({ clips, mode = "grid", hasMoreFromServer = false, loadingMore = false, onReachEnd }: ClipGridProps) {
  const INITIAL_COUNT = 24;
  const LOAD_MORE_COUNT = 24;
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestLockRef = useRef(false);
  const isRow = mode === "row";
  const visibleClips = useMemo(() => clips.slice(0, visibleCount), [clips, visibleCount]);
  const hasMoreLocal = visibleCount < clips.length;
  const canRequestMore = Boolean(onReachEnd && hasMoreFromServer);

  useEffect(() => {
    if (isRow) return;
    if (!hasMoreLocal && !canRequestMore) return;
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        if (hasMoreLocal) {
          setVisibleCount((count) => Math.min(count + LOAD_MORE_COUNT, clips.length));
          return;
        }

        if (canRequestMore && !loadingMore && !requestLockRef.current) {
          requestLockRef.current = true;
          Promise.resolve(onReachEnd?.()).finally(() => {
            requestLockRef.current = false;
          });
        }
      },
      {
        rootMargin: "800px 0px"
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [canRequestMore, clips.length, hasMoreLocal, isRow, loadingMore, onReachEnd]);

  return (
    <section>
      <div className={isRow ? "overflow-x-auto pb-2" : ""}>
        <div className={isRow ? "flex gap-4 min-w-max snap-x snap-mandatory" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"}>
          {visibleClips.map((clip) => (
            <Link
              key={clip.id}
              to={`/clips/${clip.id}`}
              onClick={() => openSmartlinkAd()}
              className={`group rounded-[1.75rem] overflow-hidden border border-border/60 bg-surface/70 hover:bg-surface-hover transition-colors shadow-sm ${isRow ? "w-[190px] sm:w-[220px] flex-shrink-0 snap-start" : ""}`}
            >
              <div className="relative aspect-[9/16] bg-black overflow-hidden">
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full min-h-[220px] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  loading="lazy"
                  decoding="async"
                  width={360}
                  height={640}
                  sizes={isRow ? "220px" : "(min-width: 1280px) 16vw, (min-width: 1024px) 18vw, (min-width: 640px) 25vw, 50vw"}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                    <Clock size={12} />
                    {formatDuration(clip.duration)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
                    <PlayCircle size={12} /> Open
                  </span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-5">{clip.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{formatViewCount(clip.viewCount)} views · {formatRelativeTime(clip.publishedAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
      {!isRow && (hasMoreLocal || canRequestMore) && <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />}
    </section>
  );
}
