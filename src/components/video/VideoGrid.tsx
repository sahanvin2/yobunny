import { VideoData } from "@/lib/mockData";
import VideoCard from "./VideoCard";

interface VideoGridProps {
  videos: VideoData[];
  title?: string;
}

export default function VideoGrid({ videos, title }: VideoGridProps) {
  return (
    <section>
      {title && (
        <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}
