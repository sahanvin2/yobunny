import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import VideoGrid from "@/components/video/VideoGrid";
import { fetchAllVideos, fetchPosts, type ApiPost } from "@/lib/api";
import { sortFeedVideos, splitFeedVideos } from "@/lib/videoFeed";

const LANDSCAPE_ROWS = 12;
const CLIPS_CAROUSEL = 80;

export default function HomePage() {
  const [allVideos, setAllVideos] = useState<Awaited<ReturnType<typeof fetchAllVideos>>>([]);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError("");
      setLoading(true);

      try {
        const videos = await fetchAllVideos({
          sort: "latest",
          limitPerPage: 80,
          maxPages: 3
        });

        if (!cancelled) {
          setAllVideos(videos);
        }
      } catch (err) {
        if (!cancelled) {
          setAllVideos([]);
          setError(err instanceof Error ? err.message : "Failed to load videos");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      try {
        const data = await fetchPosts({ page: 1, limit: 8, sort: "latest" });
        if (!cancelled) {
          setPosts(data.items);
        }
      } catch {
        if (!cancelled) {
          setPosts([]);
        }
      }
    };

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedVideos = useMemo(() => sortFeedVideos(allVideos, "popular"), [allVideos]);
  const { clips, landscape } = useMemo(() => splitFeedVideos(sortedVideos), [sortedVideos]);
  const landscapeVideos = landscape.slice(0, 15);
  const moreLandscapeVideos = landscape.slice(15);
  const clipsCarousel = clips.slice(0, CLIPS_CAROUSEL);

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto animate-fade-in relative z-10">
      <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent opacity-60 pointer-events-none -z-10 rounded-t-[3rem]" />
      
      {loading && (
        <div className="flex flex-col items-center justify-center p-32 space-y-5">
           <div className="relative w-16 h-16">
             <div className="absolute inset-0 rounded-full border-[3px] border-white/10"></div>
             <div className="absolute inset-0 rounded-full border-[3px] border-white border-t-transparent animate-spin"></div>
           </div>
           <p className="text-sm font-bold text-white/50 tracking-widest uppercase">Curating content</p>
        </div>
      )}
      
      {error && (
        <div className="p-10 rounded-3xl bg-red-500/10 border border-red-500/20 text-center">
            <p className="text-red-400 font-medium">{error}</p>
        </div>
      )}

      {!loading && !error && landscapeVideos.length > 0 && (
        <div className="space-y-6 pt-2">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Popular Videos</h2>
          </div>
          <VideoGrid videos={landscapeVideos} />
        </div>
      )}

      {!loading && !error && clipsCarousel.length > 0 && (
        <div className="space-y-6 pt-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Trending Clips</h2>
          </div>
          <div className="overflow-x-auto pb-4 -mx-4 lg:-mx-8 px-4 lg:px-8 custom-scrollbar">
            <div className="flex gap-3 min-w-max">
              {clipsCarousel.map((clip) => (
                <Link key={clip.id} to={`/clips/${clip.id}`} className="group flex-shrink-0 rounded-[1.5rem] overflow-hidden border border-white/10 hover:border-white/30 transition-all duration-300 w-44 h-64 md:w-52 md:h-72">
                  <div className="relative w-full h-full">
                    <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-sm font-semibold text-white line-clamp-2 md:text-base leading-snug">{clip.title}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="space-y-6 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Latest Posts</h2>
            <Link to="/posts" className="text-sm text-white/70 hover:text-white">View all</Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <Link key={post.id} to={`/posts?open=${post.id}`} className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 min-h-[220px] flex flex-col">
                <p className="text-sm text-white/60">@{post.user?.username || "creator"}</p>
                <h3 className="text-base font-semibold text-white mt-2 line-clamp-2">{post.title}</h3>
                <p className="text-sm text-white/70 mt-3 line-clamp-5">{post.content}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && moreLandscapeVideos.length > 0 && (
        <div className="space-y-6 pt-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">More Videos</h2>
          </div>
          <VideoGrid videos={moreLandscapeVideos} />
        </div>
      )}

      {!loading && !error && landscapeVideos.length === 0 && clipsCarousel.length === 0 && (
         <div className="p-20 text-center">
            <p className="text-base font-medium text-white/40">No videos available right now.</p>
         </div>
      )}
    </div>
  );
}
