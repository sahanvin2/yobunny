import { useParams } from "react-router-dom";
import { formatSubscriberCount, formatViewCount, type VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import { useEffect, useState } from "react";
import { fetchMe, mapApiVideoToVideoData } from "@/lib/api";

function withCacheBust(url?: string | null) {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

export default function ChannelPage() {
  const { username } = useParams();
  const [channel, setChannel] = useState<{ username: string; displayName: string; avatarUrl: string | null; bannerUrl?: string | null; subscriberCount: number; isVerified?: boolean } | null>(null);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [tab, setTab] = useState<"videos" | "about">("videos");
  const [bannerFailed, setBannerFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!username) return;

    const base = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

    Promise.all([
      fetch(`${base}/users/${username}`).then((res) => res.ok ? res.json() : null),
      fetch(`${base}/users/${username}/videos`).then((res) => res.ok ? res.json() : { items: [] })
    ])
      .then(([userData, videoData]) => {
        setBannerFailed(false);
        setAvatarFailed(false);
        setChannel(userData?.item || null);
        setVideos((videoData.items || []).map((video: unknown) => mapApiVideoToVideoData(video as never)));

        void fetchMe()
          .then((me) => {
            if (me.username !== username) return;
            setChannel((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                avatarUrl: withCacheBust(me.avatarUrl || me.profileImageUrl || prev.avatarUrl),
                bannerUrl: withCacheBust(me.bannerUrl || prev.bannerUrl)
              };
            });
          })
          .catch(() => undefined);
      })
      .catch(() => {
        setChannel(null);
        setVideos([]);
      });
  }, [username]);

  if (!channel) {
    return <div className="p-6 text-center text-muted-foreground">Channel not found</div>;
  }

  return (
    <div>
      {/* Dynamic Animated Banner */}
      <div className="h-48 lg:h-64 relative overflow-hidden group">
        {channel.bannerUrl && !bannerFailed ? (
          <img src={channel.bannerUrl} alt={`${channel.displayName} banner`} className="absolute inset-0 h-full w-full object-cover" onError={() => setBannerFailed(true)} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-black to-black opacity-80" />
        )}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-[100px] group-hover:bg-primary/30 transition-colors duration-700" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-[80px]" />
      </div>

      {/* Channel info with Glassmorphism */}
      <div className="px-4 lg:px-10 pb-4 relative z-10">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 -mt-16 md:-mt-12 mb-8">
          <div className="relative group/avatar">
             <div className="absolute inset-0 bg-white/20 blur-xl rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500" />
             <img src={avatarFailed ? "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff" : (channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff")} alt={channel.displayName} className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background bg-card relative z-10 object-cover shadow-2xl transition-transform duration-500 group-hover/avatar:scale-105" onError={() => setAvatarFailed(true)} />
          </div>
          
          <div className="flex-1 text-center md:text-left pb-2">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2 drop-shadow-md">
              {channel.displayName}
              {channel.isVerified && <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[10px]">✓</span>}
            </h1>
            <p className="text-sm md:text-base text-white/60 font-medium tracking-wide">@{channel.username} <span className="mx-2 opacity-50">•</span> {formatSubscriberCount(channel.subscriberCount)} <span className="mx-2 opacity-50">•</span> {videos.length} videos</p>
          </div>
          
          <button
            onClick={() => setSubscribed(!subscribed)}
            className={`px-8 py-3.5 rounded-full text-sm font-bold tracking-wide transition-all duration-300 shadow-xl mb-2 w-full md:w-auto ${
              subscribed ? "bg-white/10 text-white hover:bg-white/20 border border-white/20" : "bg-white text-black hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            }`}
          >
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>
        </div>

        <div className="flex gap-8 mt-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {(["videos", "about"] as const).map((t) => (
            <button
               key={t}
               onClick={() => setTab(t)}
               className={`pb-4 text-sm font-semibold uppercase tracking-widest transition-all relative whitespace-nowrap ${
                 tab === t ? "text-white" : "text-white/40 hover:text-white/70"
               }`}
            >
               {t}
               {tab === t && (
                  <span className="absolute bottom-0 left-0 w-full h-1 bg-white rounded-t-full shadow-[0_-2px_10px_rgba(255,255,255,0.5)]" />
               )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 lg:p-10 animate-fade-in relative z-10">
        {tab === "videos" && (
           <div className="max-w-7xl mx-auto">
              {videos.length === 0 ? (
                 <div className="text-center py-20 text-white/40 font-medium">This channel hasn't uploaded any videos yet.</div>
              ) : (
                 <VideoGrid videos={videos} />
              )}
           </div>
        )}
        {tab === "about" && (
          <div className="max-w-3xl mx-auto bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-8 lg:p-12 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            <h3 className="text-2xl font-bold text-white mb-6 tracking-tight">About {channel.displayName}</h3>
            
            <div className="space-y-6 text-base text-white/70 leading-relaxed font-medium">
              <p>
                Welcome to {channel.displayName}'s channel. This is a demo channel page for the YoBunny platform, showcasing a premium and minimalist design.
              </p>
              
              <div className="pt-8 mt-8 border-t border-white/10 grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-1">Total Views</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{formatViewCount(videos.reduce((sum, v) => sum + v.viewCount, 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-1">Total Videos</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{videos.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
