import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Film, Globe2, PlayCircle, Share2, Eye, Layout, MonitorPlay, ListVideo, Info } from "lucide-react";
import { formatSubscriberCount, formatViewCount, type VideoData } from "@/lib/mockData";
import VideoGrid from "@/components/video/VideoGrid";
import ClipGrid from "@/components/video/ClipGrid";
import { API_BASE, fetchMe, isClipLikeVideo, mapApiVideoToVideoData } from "@/lib/api";
import { FEED_SORT_OPTIONS, sortFeedVideos, type FeedSortMode } from "@/lib/videoFeed";

function withCacheBust(url?: string | null) {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

export default function ChannelPage() {
  const { username } = useParams();
  const [channel, setChannel] = useState<{ username: string; displayName: string; avatarUrl: string | null; bannerUrl?: string | null; subscriberCount: number; isVerified?: boolean } | null>(null);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [tab, setTab] = useState<"videos" | "clips" | "playlists" | "about">("videos");
  const [sortMode, setSortMode] = useState<FeedSortMode>("latest");
  const [bannerFailed, setBannerFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!username) return;

    const candidates = Array.from(new Set([
      username,
      username.replace(/_/g, "-"),
      username.replace(/-/g, "_")
    ]));

    const fetchUser = async () => {
      for (const value of candidates) {
        const res = await fetch(`${API_BASE}/users/${value}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.item) return data.item;
      }
      return null;
    };

    const fetchVideosForResolvedUser = async (resolvedUsername: string | undefined) => {
      if (!resolvedUsername) return { items: [] as unknown[] };
      const res = await fetch(`${API_BASE}/users/${resolvedUsername}/videos`);
      if (!res.ok) return { items: [] as unknown[] };
      return res.json();
    };

    fetchUser()
      .then(async (resolvedUser) => {
        const videoData = await fetchVideosForResolvedUser(resolvedUser?.username);
        setBannerFailed(false);
        setAvatarFailed(false);
        setChannel(resolvedUser || null);
        setVideos((videoData.items || []).map((video: unknown) => mapApiVideoToVideoData(video as never)));

        void fetchMe()
          .then((me) => {
            if (me.username !== resolvedUser?.username) return;
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

  const sortedVideos = useMemo(() => sortFeedVideos(videos, sortMode), [videos, sortMode]);
  const clipVideos = useMemo(() => sortedVideos.filter(isClipLikeVideo), [sortedVideos]);
  const landscapeVideos = useMemo(() => sortedVideos.filter((video) => !isClipLikeVideo(video)), [sortedVideos]);
  const spotlightVideos = landscapeVideos.slice(0, 2);
  const moreVideos = landscapeVideos.slice(2);
  const totalViews = videos.reduce((sum, video) => sum + video.viewCount, 0);
  const playlistCards = [
    { id: "featured", title: "Featured Mix", description: "Best and most viewed videos", count: Math.min(12, landscapeVideos.length), emoji: "✨" },
    { id: "latest", title: "Latest Uploads", description: "Newest landscape videos", count: landscapeVideos.length, emoji: "🚀" },
    { id: "clips", title: "Shorts", description: "Portrait clips only", count: clipVideos.length, emoji: "📱" }
  ];

  if (!channel) {
    return <div className="p-10 text-center text-white/50 text-lg font-medium">Channel not found or does not exist.</div>;
  }

  return (
    <div className="space-y-10 pb-16 min-h-screen">
      <div className="h-[250px] lg:h-[350px] relative overflow-hidden group">
        {channel.bannerUrl && !bannerFailed ? (
          <img src={channel.bannerUrl} alt={`${channel.displayName} banner`} className="absolute inset-0 h-full w-full object-cover transition-transform [transition-duration:10s] group-hover:scale-105" onError={() => setBannerFailed(true)} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-black to-blue-950 opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] mix-blend-overlay pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[150px] group-hover:bg-primary/30 transition-colors duration-1000 pointer-events-none" />
      </div>

      <div className="px-4 lg:px-12 relative z-10 max-w-[1700px] mx-auto">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-8 -mt-24 md:-mt-20 mb-10 w-full relative">
          <div className="relative group/avatar shrink-0 z-20">
             <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-primary/20 rounded-full opacity-30 blur-2xl group-hover/avatar:opacity-70 transition-opacity duration-700 animate-pulse" />
             <div className="absolute inset-0 bg-white/20 blur-xl rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500" />
             <img src={avatarFailed ? "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff" : (channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff")} alt={channel.displayName} className="w-[140px] h-[140px] md:w-[180px] md:h-[180px] rounded-full border-[6px] border-background bg-card relative z-10 object-cover shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-transform duration-700 ease-out group-hover/avatar:scale-[1.03]" onError={() => setAvatarFailed(true)} />
          </div>
          
          <div className="flex-1 text-center md:text-left pb-2 flex flex-col items-center md:items-start z-10">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-3 drop-shadow-lg flex items-center gap-3">
              {channel.displayName}
              {channel.isVerified && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs shadow-[0_0_15px_rgba(255,255,255,0.4)]">✓</span>}
            </h1>
            <div className="flex items-center gap-3 text-sm md:text-base text-muted-foreground font-semibold tracking-wide bg-white/[0.03] px-4 py-1.5 rounded-full border border-white/[0.05] shadow-inner mb-4">
               <span>@{channel.username}</span>
               <span className="w-1 h-1 rounded-full bg-white/30" />
               <span>{formatSubscriberCount(channel.subscriberCount)}</span>
               <span className="w-1 h-1 rounded-full bg-white/30" />
               <span>{videos.length} videos</span>
            </div>
            
            <p className="text-sm text-white/50 max-w-xl hidden md:block">Welcome to {channel.displayName}'s channel section. Subscribe to stay updated with amazing landscape, portrait content and mixes every time a new video arrives.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 justify-center md:justify-end shrink-0 w-full md:w-auto z-10">
            <button
              onClick={() => setSubscribed(!subscribed)}
              className={`px-10 py-4 rounded-3xl text-[15px] font-bold tracking-wider uppercase transition-all duration-300 w-full md:w-auto border flex items-center justify-center gap-2 ${
                subscribed ? "bg-black/40 text-white/80 hover:bg-white/10 hover:text-white border-white/20" : "bg-foreground text-background hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              }`}
            >
              {subscribed ? "Following" : "Subscribe"}
            </button>
            <button className="w-14 h-14 rounded-3xl border border-white/10 bg-white/5 text-foreground flex items-center justify-center hover:bg-white/20 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:scale-[1.05] active:scale-[0.95]">
              <Share2 size={20} />
            </button>
          </div>
        </div>

        <div className="flex justify-center md:justify-start mt-6">
           <div className="flex gap-2 p-1.5 bg-background/50 backdrop-blur-3xl border border-white/10 rounded-2xl w-full md:w-auto overflow-x-auto scrollbar-hide">
             {[
               { id: "videos", label: "Home", icon: <Layout size={16} /> },
               { id: "clips", label: "Clips", icon: <MonitorPlay size={16} /> },
               { id: "playlists", label: "Playlists", icon: <ListVideo size={16} /> },
               { id: "about", label: "About", icon: <Info size={16} /> }
             ].map((t) => (
               <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 relative whitespace-nowrap overflow-hidden ${
                    tab === t.id ? "bg-white/10 text-foreground shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/[0.05]" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
               >
                  {t.icon}
                  {t.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      <div className="px-4 lg:px-12 animate-fade-in relative z-10 max-w-[1700px] mx-auto mt-10">
        {tab === "videos" && (
          <div className="space-y-12">
            <div className="flex flex-wrap items-center gap-3 bg-white/[0.02] border border-white/5 p-2 w-max rounded-2xl">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40 ml-4 mr-2">Sort By</span>
              {FEED_SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortMode(option.value)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-bold tracking-wide whitespace-nowrap transition-all duration-300 ${
                    sortMode === option.value ? "bg-foreground text-background shadow-lg" : "bg-transparent text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <section>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3"><MonitorPlay size={28} className="text-primary" /> Spotlight</h3>
                  <p className="text-sm font-medium text-muted-foreground mt-1">Highlighted videos specifically for you.</p>
                </div>
              </div>
              {spotlightVideos.length === 0 ? (
                <div className="flex items-center justify-center py-24 bg-white/5 border border-white/5 rounded-3xl text-white/40 font-medium tracking-wide">No spotlight available.</div>
              ) : (
                <VideoGrid videos={spotlightVideos} />
              )}
            </section>

            <section className="relative">
              <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-primary/5 rounded-full blur-[100px] -z-10" />
              <div className="mb-6 flex flex-col sm:flex-row items-baseline justify-between gap-4">
                <div>
                  <h3 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">Portrait Magic</h3>
                  <p className="text-sm font-medium text-muted-foreground mt-1">Stunning short form content to enjoy.</p>
                </div>
                <button onClick={() => setTab("clips")} className="text-sm font-bold bg-white/10 text-foreground px-5 py-2.5 rounded-full hover:bg-white/20 transition-all border border-white/10">View all clips</button>
              </div>
              {clipVideos.length === 0 ? (
                <div className="flex items-center justify-center py-16 bg-white/5 border border-white/5 rounded-3xl text-white/40 font-medium tracking-wide">No clips available.</div>
               ) : (
                <ClipGrid clips={clipVideos.slice(0, 10)} />
              )}
            </section>

            <section>
              <div className="mb-6">
                <h3 className="text-3xl font-bold text-foreground tracking-tight mb-1">More content</h3>
                <p className="text-sm font-medium text-muted-foreground">Keep browsing amazing landscape videos.</p>
              </div>
              {moreVideos.length === 0 ? (
                <div className="flex items-center justify-center py-16 bg-white/5 border border-white/5 rounded-3xl text-white/40 font-medium tracking-wide">No more videos.</div>
               ) : (
                <VideoGrid videos={moreVideos} />
              )}
            </section>
          </div>
        )}
        
        {tab === "clips" && (
          <div className="space-y-6">
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-foreground tracking-tight mb-1">Channel Clips</h3>
              <p className="text-sm font-medium text-muted-foreground">Immersive portrait videos created by {channel.displayName}.</p>
            </div>
            {clipVideos.length === 0 ? <div className="text-center py-20 text-white/40 font-medium">No clips are available yet.</div> : <ClipGrid clips={clipVideos} />}
          </div>
        )}
        
        {tab === "playlists" && (
          <div className="space-y-6">
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-foreground tracking-tight mb-1">Curated Playlists</h3>
              <p className="text-sm font-medium text-muted-foreground">Explore videos bundled by topic or theme.</p>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {playlistCards.map((playlist) => (
                <Link
                  key={playlist.id}
                  to="/playlists"
                  className="group relative overflow-hidden rounded-[2.5rem] bg-card border border-white/10 p-8 min-h-[220px] flex flex-col justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(255,255,255,0.05)] hover:bg-surface-hover"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="flex items-start justify-between gap-4 relative z-10 w-full">
                    <div>
                      <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 text-foreground flex items-center justify-center text-2xl mb-5 shadow-inner backdrop-blur-xl group-hover:scale-110 transition-transform duration-500">{playlist.emoji}</div>
                      <h4 className="text-2xl font-bold text-foreground tracking-tight">{playlist.title}</h4>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                      <PlayCircle size={20} fill="currentColor" />
                    </div>
                  </div>
                  <div className="relative z-10">
                    <p className="text-sm font-medium text-muted-foreground mt-3">{playlist.description}</p>
                    <div className="w-full h-px bg-gradient-to-r from-white/20 to-transparent my-4 group-hover:from-white/40 transition-colors" />
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      <span>{playlist.count} clips & videos</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        
        {tab === "about" && (
          <div className="max-w-5xl mx-auto rounded-[3rem] bg-card border border-white/5 p-10 lg:p-16 shadow-[0_20px_80px_rgba(0,0,0,0.6)] relative overflow-hidden group">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/5 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            
            <div className="relative z-10 space-y-12">
              <div>
                <h3 className="text-3xl font-bold text-foreground mb-4 tracking-tight inline-flex items-center gap-3">
                   <Info className="text-primary" size={28} /> About {channel.displayName}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed font-medium">
                  Welcome back! This is the central hub for everything related to {channel.displayName}. Feel free to look around, check out the newest long-format content or dive right into some mind-blowing short vertical clips. Everything in one place.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 text-foreground border-y border-white/5 py-8">
                <a href={`/channel/${channel.username}`} className="group/link rounded-3xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.05] hover:border-white/20 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4 text-foreground group-hover/link:bg-foreground group-hover/link:text-background transition-colors"><Globe2 size={18} /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2">Direct Link</p>
                  <p className="text-sm font-semibold text-foreground break-all">{window.location.origin}/channel/{channel.username}</p>
                </a>
                <button className="group/btn text-left rounded-3xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.05] hover:border-white/20 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4 text-foreground group-hover/btn:bg-foreground group-hover/btn:text-background transition-colors"><Share2 size={18} /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2">Share With Friends</p>
                  <p className="text-sm font-semibold text-foreground">Click to copy channel handle.</p>
                </button>
              </div>

               <div className="grid grid-cols-2 gap-8">
                <div className="p-2">
                  <div className="flex items-center gap-3 mb-2 text-muted-foreground shrink-0">
                    <Eye size={18} /> <p className="text-xs uppercase tracking-widest font-bold">Total channel views</p>
                  </div>
                  <p className="text-4xl lg:text-5xl font-bold text-foreground tracking-tight">{formatViewCount(totalViews)}</p>
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-3 mb-2 text-muted-foreground shrink-0">
                    <Film size={18} /> <p className="text-xs uppercase tracking-widest font-bold">Total video count</p>
                  </div>
                  <p className="text-4xl lg:text-5xl font-bold text-foreground tracking-tight">{videos.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
