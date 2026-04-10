import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMe, fetchMyVideos, uploadProfileMedia } from "@/lib/api";
import { buildPrimaryChannel, loadChannels, saveChannels, getSelectedChannelId, setSelectedChannelId, type CreatorChannel } from "@/lib/channels";
import type { VideoData } from "@/lib/mockData";
import { Camera, Image as ImageIcon, Settings, CheckCircle2, Plus, ArrowRight, UserCircle } from "lucide-react";

function getChannelTag(video: VideoData) {
  return video.tags.find((tag) => tag.startsWith("__CHANNEL__:")) || "";
}

function toDataUrl(file: File, maxWidth = 800) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          const ratio = width / height;
          width = maxWidth;
          height = width / ratio;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(String(e.target?.result || ""));
      img.src = String(e.target?.result || "");
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function MyChannelsPage() {
  const [userId, setUserId] = useState("");
  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [activeChannelId, setActiveChannelId] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [newBio, setNewBio] = useState("");
  const [status, setStatus] = useState("");
  const effectiveUserId = userId || "local-user";

  const notifyProfileUpdated = () => {
    window.dispatchEvent(new CustomEvent("yobunny:user-profile-updated"));
  };

  useEffect(() => {
    void fetchMe()
      .then((user) => {
        const primary = buildPrimaryChannel(user);
        const nextChannels = loadChannels(user.id, primary);
        setUserId(user.id);
        setChannels(nextChannels);
        setActiveChannelId(getSelectedChannelId(user.id, nextChannels));
      })
      .catch(() => {
        setUserId("");
        const fallback = loadChannels("local-user", {
          id: "primary-local-user",
          name: "My Channel",
          handle: "my_channel",
          bio: "",
          createdAt: new Date().toISOString()
        });
        setChannels(fallback);
        setActiveChannelId(getSelectedChannelId("local-user", fallback));
      });

    void fetchMyVideos().then(setVideos).catch(() => setVideos([]));
  }, []);

  const statsByChannelId = useMemo(() => {
    const stats = new Map<string, { videos: number; views: number }>();
    for (const channel of channels) {
      stats.set(channel.id, { videos: 0, views: 0 });
    }
    for (const video of videos) {
      const tag = getChannelTag(video);
      const channelId = tag ? tag.replace("__CHANNEL__:", "") : channels[0]?.id;
      if (!channelId) continue;
      if (!stats.has(channelId)) stats.set(channelId, { videos: 0, views: 0 });
      const current = stats.get(channelId)!;
      current.videos += 1;
      current.views += video.viewCount;
    }
    return stats;
  }, [channels, videos]);

  const onCreateChannel = () => {
    const name = newName.trim();
    const handle = newHandle.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "_");

    if (!name || !handle) {
      setStatus("Channel name and handle are absolutely required.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }

    if (channels.some((channel) => channel.handle.toLowerCase() === handle.toLowerCase())) {
      setStatus("This handle is already taken in your channel list.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }

    const next: CreatorChannel = {
      id: `ch-${Date.now()}`,
      name,
      handle,
      bio: newBio.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = [...channels, next];
    setChannels(updated);
    saveChannels(effectiveUserId, updated);
    setSelectedChannelId(effectiveUserId, next.id);
    setActiveChannelId(next.id);
    setNewName("");
    setNewHandle("");
    setNewBio("");
    setStatus("Channel created successfully!");
    setTimeout(() => setStatus(""), 3000);
  };

  const onUploadAvatar = async (channelId: string, file: File) => {
    try {
      const isPrimaryChannel = userId && channelId === `primary-${userId}`;
      if (isPrimaryChannel) {
        const { item } = await uploadProfileMedia("avatar", file);
        const remoteAvatar = item.avatarUrl || item.profileImageUrl || "";
        const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, avatarUrl: remoteAvatar || undefined } : channel));
        setChannels(updated);
        saveChannels(effectiveUserId, updated);
        notifyProfileUpdated();
        setStatus("Primary channel avatar updated.");
        setTimeout(() => setStatus(""), 1800);
        return;
      }

      const dataUrl = await toDataUrl(file, 400); // 400px max for avatar
      const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, avatarUrl: dataUrl } : channel));
      setChannels(updated);
      saveChannels(effectiveUserId, updated);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to upload avatar");
      setTimeout(() => setStatus(""), 2200);
    }
  };

  const onUploadBanner = async (channelId: string, file: File) => {
    try {
      const isPrimaryChannel = userId && channelId === `primary-${userId}`;
      if (isPrimaryChannel) {
        const { item } = await uploadProfileMedia("banner", file);
        const remoteBanner = item.bannerUrl || "";
        const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, bannerUrl: remoteBanner || undefined } : channel));
        setChannels(updated);
        saveChannels(effectiveUserId, updated);
        notifyProfileUpdated();
        setStatus("Primary channel banner updated.");
        setTimeout(() => setStatus(""), 1800);
        return;
      }

      const dataUrl = await toDataUrl(file, 1200); // 1200px max for banner
      const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, bannerUrl: dataUrl } : channel));
      setChannels(updated);
      saveChannels(effectiveUserId, updated);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to upload banner");
      setTimeout(() => setStatus(""), 2200);
    }
  };

  const selectActiveChannel = (channelId: string) => {
    setSelectedChannelId(effectiveUserId, channelId);
    setActiveChannelId(channelId);
  };

  return (
    <div className="p-4 lg:p-10 max-w-7xl mx-auto space-y-12 animate-fade-in relative z-10 w-full overflow-hidden">
      {/* Dynamic Background Effect */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none rounded-t-[3rem]" />
      
      <div className="relative z-10">
        <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight drop-shadow-sm mb-2">My Channels Network</h1>
        <p className="text-base text-white/50 max-w-2xl">Create and manage multiple distinct identities. Easily toggle between custom channels to organize, brand, and upload your content to distinct audiences.</p>
      </div>

      <section className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-8 lg:p-10 border border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-50" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-10 lg:gap-16">
            <div className="lg:w-1/3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(37,99,235,0.4)]">
                    <Plus size={28} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Create New Channel</h2>
                <p className="text-white/50 text-sm leading-relaxed">Establish an entirely new creator identity. Need one for Gaming and another for Tech Vlogs? Create them instantly here and switch freely.</p>
            </div>
            
            <div className="lg:w-2/3 flex flex-col gap-6">
                <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest pl-1">Channel Name</label>
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g. YoBunny Gaming"
                            className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest pl-1">Target Handle</label>
                        <input
                            value={newHandle}
                            onChange={(e) => setNewHandle(e.target.value)}
                            placeholder="yobunny_gaming"
                            className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-white/50 uppercase tracking-widest pl-1">Channel Description</label>
                    <textarea
                        value={newBio}
                        onChange={(e) => setNewBio(e.target.value)}
                        placeholder="What is this channel about? You can customize images later."
                        rows={3}
                        className="w-full p-5 rounded-2xl bg-black/40 border border-white/10 text-white placeholder-white/30 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                    />
                </div>
                
                <div className="flex items-center justify-between pt-2">
                    <p className={`text-sm font-semibold transition-opacity duration-300 ${status.includes('required') || status.includes('taken') ? 'text-red-400' : 'text-emerald-400'} ${status ? 'opacity-100' : 'opacity-0'}`}>
                        {status || "Ready to connect"}
                    </p>
                    <button type="button" onClick={onCreateChannel} className="h-14 px-8 rounded-2xl bg-white hover:bg-white/90 text-black font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 transition-all">
                        Deploy Channel <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-8">
            <h2 className="text-2xl font-bold text-white relative z-10">Your Network</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"></div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
            {channels.map((channel) => {
            const stats = statsByChannelId.get(channel.id) || { videos: 0, views: 0 };
            const isActive = activeChannelId === channel.id;
            
            return (
                <article key={channel.id} className={`group rounded-[2rem] bg-white/[0.02] border backdrop-blur-xl overflow-hidden transition-all duration-300 ${isActive ? 'border-primary shadow-[0_0_30px_rgba(var(--primary-rgb),0.15)] ring-1 ring-primary' : 'border-white/10 hover:border-white/20'}`}>
                    
                    {/* Banner Area */}
                    <div className="relative h-36 bg-gradient-to-br from-primary/30 via-black to-zinc-900 group/banner">
                        {channel.bannerUrl && <img src={channel.bannerUrl} alt="banner" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm z-10">
                            <label className="cursor-pointer bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-2xl transition-colors">
                                <ImageIcon size={16} /> Update Banner Cover
                                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadBanner(channel.id, f); e.currentTarget.value = ""; }} />
                            </label>
                        </div>
                        {isActive && (
                            <div className="absolute top-4 right-4 z-20 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
                                <CheckCircle2 size={14} /> ACTIVE
                            </div>
                        )}
                    </div>

                    {/* Content Profile Area */}
                    <div className="px-6 pb-8 relative">
                        {/* Avatar Overlay */}
                        <div className="relative w-24 h-24 -mt-12 mb-4 group/avatar inline-block z-20">
                            <img
                                src={channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"}
                                alt="avatar"
                                className="w-full h-full rounded-2xl border-4 border-[#070707] object-cover bg-black shadow-xl"
                            />
                            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-2xl flex items-center justify-center cursor-pointer backdrop-blur-[2px]">
                                <Camera className="text-white" size={24} />
                                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadAvatar(channel.id, f); e.currentTarget.value = ""; }} />
                            </label>
                        </div>

                        {/* Texts */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xl font-bold text-white truncate">{channel.name}</h3>
                                <p className="text-sm font-semibold text-blue-400">@{channel.handle}</p>
                            </div>
                            
                            <p className="text-sm text-white/60 line-clamp-2 min-h-[40px] leading-relaxed">
                                {channel.bio || "No description provided. Click the settings icon to customize this channel's biography and connect with viewers."}
                            </p>

                            {/* Stats Line */}
                            <div className="flex items-center gap-6 py-4 border-y border-white/5">
                                <div>
                                    <p className="text-xs text-white/40 uppercase tracking-widest font-bold mb-1">Videos</p>
                                    <p className="text-lg font-bold text-white">{stats.videos}</p>
                                </div>
                                <div className="w-px h-8 bg-white/10"></div>
                                <div>
                                    <p className="text-xs text-white/40 uppercase tracking-widest font-bold mb-1">Views</p>
                                    <p className="text-lg font-bold text-white">{stats.views}</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-2 flex gap-3">
                                {isActive ? (
                                    <button disabled className="flex-1 h-12 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-bold flex items-center justify-center gap-2">
                                        <CheckCircle2 size={18} /> Currently Active
                                    </button>
                                ) : (
                                    <button onClick={() => selectActiveChannel(channel.id)} className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-[0_0_20px_rgba(37,99,235,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2">
                                        <UserCircle size={18} /> Switch to Channel
                                    </button>
                                )}
                                <Link to={`/my-channels/${channel.id}/settings`} className="h-12 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all group-hover:border-white/20">
                                    <Settings size={20} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </article>
            );
            })}
        </div>
      </section>
    </div>
  );
}
