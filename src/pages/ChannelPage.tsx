import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Share2 } from "lucide-react";
import ClipGrid from "@/components/video/ClipGrid";
import { API_BASE, isClipLikeVideo, mapApiVideoToVideoData } from "@/lib/api";
import { formatSubscriberCount, formatViewCount, type VideoData } from "@/lib/mockData";
import { sortShortsVideos } from "@/lib/videoFeed";

const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff";

export default function ChannelPage() {
  const { username } = useParams();
  const [channel, setChannel] = useState<{ username: string; displayName: string; avatarUrl: string | null; bannerUrl?: string | null; subscriberCount: number; isVerified?: boolean } | null>(null);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!username) return;

    const candidates = Array.from(new Set([
      username,
      username.replace(/_/g, "-"),
      username.replace(/-/g, "_")
    ]));

    const load = async () => {
      for (const value of candidates) {
        const userRes = await fetch(`${API_BASE}/users/${value}`);
        if (!userRes.ok) continue;

        const userData = await userRes.json();
        const resolvedUser = userData?.item;
        if (!resolvedUser) continue;

        const videosRes = await fetch(`${API_BASE}/users/${resolvedUser.username}/videos`);
        const videosData = videosRes.ok ? await videosRes.json() : { items: [] };

        setBannerFailed(false);
        setAvatarFailed(false);
        setChannel(resolvedUser);
        setVideos((videosData.items || []).map((video: unknown) => mapApiVideoToVideoData(video as never)));
        return;
      }

      setChannel(null);
      setVideos([]);
    };

    void load();
  }, [username]);

  const shorts = useMemo(() => sortShortsVideos(videos.filter(isClipLikeVideo)), [videos]);
  const totalViews = useMemo(() => shorts.reduce((sum, video) => sum + video.viewCount, 0), [shorts]);

  if (!channel) {
    return <div className="p-8 text-center text-white/55">Channel not found.</div>;
  }

  return (
    <div className="space-y-8 pb-12 min-h-screen">
      <div className="h-[220px] sm:h-[280px] relative overflow-hidden">
        {channel.bannerUrl && !bannerFailed ? (
          <img
            src={channel.bannerUrl}
            alt={`${channel.displayName} banner`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            width={1600}
            height={300}
            onError={() => setBannerFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-black to-blue-950 opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="px-4 sm:px-6 lg:px-12 max-w-[1600px] mx-auto -mt-20 relative z-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 rounded-[2rem] border border-white/10 bg-black/35 backdrop-blur-2xl p-5 sm:p-6">
          <img
            src={avatarFailed ? FALLBACK_AVATAR : (channel.avatarUrl || FALLBACK_AVATAR)}
            alt={channel.displayName}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white/10 bg-card object-cover"
            loading="eager"
            decoding="async"
            width={112}
            height={112}
            onError={() => setAvatarFailed(true)}
          />

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 justify-center sm:justify-start">
              {channel.displayName}
              {channel.isVerified && <span className="text-white/70">✓</span>}
            </h1>
            <p className="text-sm text-white/60 mt-1">@{channel.username}</p>
            <p className="text-sm text-white/60 mt-2">
              {formatSubscriberCount(channel.subscriberCount)} · {shorts.length} videos · {formatViewCount(totalViews)} views
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setSubscribed((prev) => !prev)}
              className={`flex-1 sm:flex-none px-6 py-3 rounded-full text-sm font-bold transition-all border ${
                subscribed
                  ? "bg-black/40 text-white border-white/20 hover:bg-white/10"
                  : "bg-white text-black border-white hover:opacity-90"
              }`}
            >
              {subscribed ? "Following" : "Subscribe"}
            </button>
            <button className="w-11 h-11 rounded-full border border-white/20 bg-white/10 text-white inline-flex items-center justify-center hover:bg-white/20 transition-colors">
              <Share2 size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Videos</h2>
          <Link to="/discover" className="text-sm text-white/70 hover:text-white">Discover creators</Link>
        </div>

        <div className="mt-4">
          {shorts.length === 0 ? (
            <div className="text-center py-16 text-white/45">No videos available yet.</div>
          ) : (
            <ClipGrid clips={shorts} />
          )}
        </div>
      </div>
    </div>
  );
}
