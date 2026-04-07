import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMe, fetchMyVideos } from "@/lib/api";
import { buildPrimaryChannel, loadChannels, saveChannels, setSelectedChannelId, type CreatorChannel } from "@/lib/channels";
import type { VideoData } from "@/lib/mockData";

function getChannelTag(video: VideoData) {
  return video.tags.find((tag) => tag.startsWith("__CHANNEL__:")) || "";
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function MyChannelsPage() {
  const [userId, setUserId] = useState("");
  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [status, setStatus] = useState("");
  const effectiveUserId = userId || "local-user";

  useEffect(() => {
    void fetchMe()
      .then((user) => {
        const primary = buildPrimaryChannel(user);
        const nextChannels = loadChannels(user.id, primary);
        setUserId(user.id);
        setChannels(nextChannels);
      })
      .catch(() => {
        setUserId("");
        setChannels(loadChannels("local-user", {
          id: "primary-local-user",
          name: "My Channel",
          handle: "my_channel",
          bio: "",
          createdAt: new Date().toISOString()
        }));
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
      if (!stats.has(channelId)) {
        stats.set(channelId, { videos: 0, views: 0 });
      }
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
      setStatus("Channel name and handle are required.");
      return;
    }

    if (channels.some((channel) => channel.handle.toLowerCase() === handle.toLowerCase())) {
      setStatus("Handle already exists in your channels.");
      return;
    }

    const next: CreatorChannel = {
      id: `ch-${Date.now()}`,
      name,
      handle,
      bio: "",
      createdAt: new Date().toISOString()
    };

    const updated = [...channels, next];
    setChannels(updated);
    saveChannels(effectiveUserId, updated);
    setSelectedChannelId(effectiveUserId, next.id);
    setNewName("");
    setNewHandle("");
    setStatus("Channel created. You can select it during upload.");
  };

  const onUploadAvatar = async (channelId: string, file: File) => {
    const dataUrl = await toDataUrl(file);
    const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, avatarUrl: dataUrl } : channel));
    setChannels(updated);
    saveChannels(effectiveUserId, updated);
  };

  const onUploadBanner = async (channelId: string, file: File) => {
    const dataUrl = await toDataUrl(file);
    const updated = channels.map((channel) => (channel.id === channelId ? { ...channel, bannerUrl: dataUrl } : channel));
    setChannels(updated);
    saveChannels(effectiveUserId, updated);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Channels</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage multiple creator channels and switch channel identity before upload.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <h2 className="text-base font-semibold text-foreground">Create a channel</h2>
        <p className="text-xs text-muted-foreground">Create unlimited channels for different content styles and careers.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Channel name"
            className="h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm"
          />
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="handle_name"
            className="h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm"
          />
          <button type="button" onClick={onCreateChannel} className="h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            Add channel
          </button>
        </div>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
      </section>

      <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {channels.map((channel) => {
          const stats = statsByChannelId.get(channel.id) || { videos: 0, views: 0 };
          return (
            <article key={channel.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="h-24 relative bg-gradient-to-r from-primary/20 via-cyan-400/20 to-transparent">
                {channel.bannerUrl && <img src={channel.bannerUrl} alt={`${channel.name} banner`} className="absolute inset-0 h-full w-full object-cover" />}
              </div>
              <div className="p-4 -mt-8 space-y-3">
                <div className="flex items-start gap-3">
                  <img
                    src={channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"}
                    alt={channel.name}
                    className="w-16 h-16 rounded-full border-2 border-background object-cover"
                  />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{channel.name}</h3>
                    <p className="text-xs text-muted-foreground">@{channel.handle}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats.videos} videos · {stats.views} views</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannelId(effectiveUserId, channel.id);
                      setStatus(`Selected ${channel.name} for new uploads.`);
                    }}
                    className="h-9 px-3 rounded-lg border border-white/15 text-xs text-foreground"
                  >
                    Select for upload
                  </button>

                  <label className="h-9 px-3 rounded-lg border border-white/15 text-xs text-foreground inline-flex items-center cursor-pointer">
                    Avatar
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void onUploadAvatar(channel.id, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <label className="h-9 px-3 rounded-lg border border-white/15 text-xs text-foreground inline-flex items-center cursor-pointer">
                    Banner
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void onUploadBanner(channel.id, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <Link to={`/my-channels/${channel.id}/settings`} className="h-9 px-3 rounded-lg border border-white/15 text-xs text-foreground inline-flex items-center">
                    Settings
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
