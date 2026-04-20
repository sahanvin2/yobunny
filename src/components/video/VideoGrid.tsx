import { VideoData } from "@/lib/mockData";
import VideoCard from "./VideoCard";
import { useEffect, useMemo, useRef, useState } from "react";

interface VideoGridProps {
  videos: VideoData[];
  title?: string;
  hasMoreFromServer?: boolean;
  loadingMore?: boolean;
  onReachEnd?: () => void | Promise<void>;
}

export default function VideoGrid({ videos, title, hasMoreFromServer = false, loadingMore = false, onReachEnd }: VideoGridProps) {
  const INITIAL_COUNT = 24;
  const LOAD_MORE_COUNT = 24;
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestLockRef = useRef(false);

  const visibleVideos = useMemo(() => videos.slice(0, visibleCount), [videos, visibleCount]);
  const hasMoreLocal = visibleCount < videos.length;
  const canRequestMore = Boolean(onReachEnd && hasMoreFromServer);

  useEffect(() => {
    if (!hasMoreLocal && !canRequestMore) return;
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        if (hasMoreLocal) {
          setVisibleCount((count) => Math.min(count + LOAD_MORE_COUNT, videos.length));
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
  }, [hasMoreLocal, canRequestMore, loadingMore, onReachEnd, videos.length]);

  return (
    <section>
      {title && (
        <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>
      )}
      <div className="grid grid-cols-1 min-[540px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
        {visibleVideos.map((video, index) => (
          <VideoCard key={video.id} video={video} priority={index < 3} />
        ))}
      </div>
      {(hasMoreLocal || canRequestMore) && <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />}
    </section>
  );
}
