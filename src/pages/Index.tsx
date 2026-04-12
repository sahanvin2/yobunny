import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import VideoGrid from "@/components/video/VideoGrid";
import { API_BASE, fetchAllVideos, fetchPosts, partitionVideosByFormat, type ApiPost } from "@/lib/api";
import { sortFeedVideos, splitFeedVideos } from "@/lib/videoFeed";
import { useIsMobile } from "@/hooks/use-mobile";
import SmartImage from "@/components/ui/SmartImage";

const CLIPS_CAROUSEL = 80;
const HOME_POST_LIMIT = 3;

export default function HomePage() {
  const isMobile = useIsMobile();
  const [desktopColumns, setDesktopColumns] = useState(5);
  const [allVideos, setAllVideos] = useState<Awaited<ReturnType<typeof fetchAllVideos>>>([]);
  const [feedSplit, setFeedSplit] = useState<{ clips: Awaited<ReturnType<typeof fetchAllVideos>>; landscape: Awaited<ReturnType<typeof fetchAllVideos>> }>({ clips: [], landscape: [] });
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
        const data = await fetchPosts({ page: 1, limit: HOME_POST_LIMIT, sort: "latest" });
        if (!cancelled) {
          setPosts(data.items.slice(0, HOME_POST_LIMIT));
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

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        setDesktopColumns(5);
      } else if (width >= 1024) {
        setDesktopColumns(4);
      } else if (width >= 768) {
        setDesktopColumns(3);
      } else {
        setDesktopColumns(2);
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const sortedVideos = useMemo(() => sortFeedVideos(allVideos, "popular"), [allVideos]);

  useEffect(() => {
    let cancelled = false;
    const baseSplit = splitFeedVideos(sortedVideos);

    setFeedSplit(baseSplit);

    if (baseSplit.clips.length > 0 || sortedVideos.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const detectByThumbnail = async () => {
      try {
        const { clips, regularVideos } = await partitionVideosByFormat(sortedVideos);
        if (!cancelled) {
          setFeedSplit({ clips, landscape: regularVideos });
        }
      } catch {
        // Keep tag-based split if thumbnail detection fails.
      }
    };

    void detectByThumbnail();

    return () => {
      cancelled = true;
    };
  }, [sortedVideos]);

  const firstVideoBlockSize = isMobile ? 5 : desktopColumns * 3;
  const landscapeVideos = feedSplit.landscape.slice(0, firstVideoBlockSize);
  const moreLandscapeVideos = feedSplit.landscape.slice(firstVideoBlockSize);
  const clipsCarousel = feedSplit.clips.slice(0, CLIPS_CAROUSEL);
  const skeletonCards = Math.max(Math.min(firstVideoBlockSize, 8), 4);

  useEffect(() => {
    if (loading || error || landscapeVideos.length === 0) return;

    const firstVideo = landscapeVideos[0];
    const firstThumb = firstVideo?.thumbnailUrl;
    if (!firstThumb) return;
    const responsiveSrcSet = firstVideo
      ? `${API_BASE}/videos/${firstVideo.id}/thumbnail?w=320 320w, ${API_BASE}/videos/${firstVideo.id}/thumbnail?w=640 640w, ${API_BASE}/videos/${firstVideo.id}/thumbnail?w=960 960w`
      : "";

    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "image";
    preload.href = firstThumb;
    preload.setAttribute("fetchpriority", "high");
    if (responsiveSrcSet) {
      preload.setAttribute("imagesrcset", responsiveSrcSet);
      preload.setAttribute("imagesizes", "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 540px) 50vw, 100vw");
    }
    document.head.appendChild(preload);

    return () => {
      preload.remove();
    };
  }, [landscapeVideos, loading, error]);

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto relative z-10">
      <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent opacity-60 pointer-events-none -z-10 rounded-t-[3rem]" />

      {loading && (
        <div className="space-y-8" aria-hidden="true">
          <div className="space-y-4">
            <div className="h-7 w-44 rounded bg-white/10" />
            <div className="grid grid-cols-1 min-[540px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {Array.from({ length: skeletonCards }).map((_, index) => (
                <div key={index} className="space-y-3">
                  <div className="aspect-video rounded-2xl bg-white/10" />
                  <div className="h-4 w-5/6 rounded bg-white/10" />
                  <div className="h-3 w-2/3 rounded bg-white/10" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="h-7 w-40 rounded bg-white/10" />
            <div className="h-28 rounded-2xl bg-white/10" />
          </div>
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

      {!loading && !error && (
        <div className="space-y-6 pt-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Trending Clips</h2>
          </div>
          {clipsCarousel.length > 0 ? (
            <div className="overflow-x-auto pb-4 -mx-4 lg:-mx-8 px-4 lg:px-8 custom-scrollbar">
              <div className="flex gap-3 min-w-max">
                {clipsCarousel.map((clip, index) => (
                  <Link key={clip.id} to={`/clips/${clip.id}`} className="group flex-shrink-0 rounded-[1.5rem] overflow-hidden border border-white/10 hover:border-white/30 transition-all duration-300 w-44 h-64 md:w-52 md:h-72">
                    <div className="relative w-full h-full block min-h-[256px] md:min-h-[288px]">
                      <SmartImage
                        src={clip.thumbnailUrl}
                        alt={clip.title}
                        priority={index === 0}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        loading={index < 3 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index === 0 ? "high" : "auto"}
                        width={208}
                        height={288}
                        sizes="(min-width: 768px) 208px, 176px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-sm font-semibold text-white line-clamp-2 md:text-base leading-snug">{clip.title}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
              No clips detected yet. Upload portrait videos or add the __portrait__ tag to surface clips here.
            </div>
          )}
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="space-y-6 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Latest Posts</h2>
            <Link to="/posts" className="text-sm text-white/70 hover:text-white">View all</Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:col-span-3">
              {posts.map((post) => (
                <Link key={post.id} to={`/posts?open=${post.id}`} className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 min-h-[220px] flex flex-col">
                  <h3 className="text-base font-semibold text-white line-clamp-2">{post.title}</h3>
                  <p className="text-sm text-white/70 mt-3 line-clamp-5">{post.content}</p>
                </Link>
              ))}
            </div>

            <div className="hidden lg:block rounded-2xl border border-white/10 bg-white/[0.03] min-h-[220px]" aria-hidden="true" />
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
