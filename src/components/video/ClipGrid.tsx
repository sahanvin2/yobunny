import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
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
            to={`/shorts/${clip.id}`}
            className={`group rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors ${isRow ? "w-[180px] sm:w-[210px] flex-shrink-0 snap-start" : ""}`}
          >
            <div className="relative aspect-[9/16] bg-black">
              <img
                src={clip.thumbnailUrl}
                alt={clip.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium bg-background/85 text-foreground flex items-center gap-1">
                <Clock size={12} />
                {formatDuration(clip.duration)}
              </span>
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
