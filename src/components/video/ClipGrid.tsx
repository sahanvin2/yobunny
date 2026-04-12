import { Link } from "react-router-dom";
import { Clock, PlayCircle } from "lucide-react";
import { formatDuration, formatRelativeTime, formatViewCount, type VideoData } from "@/lib/mockData";

interface ClipGridProps {
  clips: VideoData[];
  mode?: "grid" | "row";
}

export default function ClipGrid({ clips, mode = "grid" }: ClipGridProps) {
  const isRow = mode === "row";

  return (
    <section>
      <div className={isRow ? "overflow-x-auto pb-2" : ""}>
        <div className={isRow ? "flex gap-4 min-w-max snap-x snap-mandatory" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"}>
          {clips.map((clip) => (
            <Link
              key={clip.id}
              to={`/clips/${clip.id}`}
              className={`group rounded-[1.75rem] overflow-hidden border border-border/60 bg-surface/70 hover:bg-surface-hover transition-colors shadow-sm ${isRow ? "w-[190px] sm:w-[220px] flex-shrink-0 snap-start" : ""}`}
            >
              <div className="relative aspect-[9/16] bg-black overflow-hidden">
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  loading="lazy"
                  decoding="async"
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
    </section>
  );
}
