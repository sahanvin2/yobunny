import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchMe, updateMe, uploadProfileMedia } from "@/lib/api";
import { buildPrimaryChannel, loadChannels, saveChannels, type CreatorChannel } from "@/lib/channels";

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ChannelSettingsPage() {
  const { channelId } = useParams();
  const navigate = useNavigate();

  const [userId, setUserId] = useState("");
  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [channel, setChannel] = useState<CreatorChannel | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchMe()
      .then((user) => {
        const primary = buildPrimaryChannel(user);
        const nextChannels = loadChannels(user.id, primary);
        setUserId(user.id);
        setChannels(nextChannels);
        setChannel(nextChannels.find((item) => item.id === channelId) || null);
      })
      .catch(() => {
        setUserId("");
        setChannels([]);
        setChannel(null);
      });
  }, [channelId]);

  if (!channel) {
    return (
      <div className="p-4 lg:p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Channel not found.</p>
        <Link to="/my-channels" className="text-sm text-primary hover:underline">Back to My Channels</Link>
      </div>
    );
  }

  const updateChannel = (patch: Partial<CreatorChannel>) => {
    const next = { ...channel, ...patch };
    setChannel(next);
    const updated = channels.map((item) => (item.id === next.id ? next : item));
    setChannels(updated);
    if (userId) saveChannels(userId, updated);
  };

  const isPrimaryChannel = userId ? channel.id === `primary-${userId}` : false;

  const notifyProfileUpdated = () => {
    window.dispatchEvent(new CustomEvent("yobunny:user-profile-updated"));
  };

  const onSave = async () => {
    if (!channel) return;

    if (!isPrimaryChannel) {
      setStatus("Channel settings saved.");
      window.setTimeout(() => setStatus(""), 1200);
      return;
    }

    try {
      setSaving(true);
      setStatus("Saving channel settings...");
      await updateMe({
        displayName: channel.name,
        username: channel.handle,
        bio: channel.bio
      });
      notifyProfileUpdated();
      setStatus("Channel settings saved.");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save channel settings");
    } finally {
      setSaving(false);
    }
  };

  const onUploadPrimaryMedia = async (kind: "avatar" | "banner", file: File) => {
    if (!channel) return;
    try {
      setSaving(true);
      setStatus(kind === "avatar" ? "Uploading avatar..." : "Uploading banner...");
      const { item } = await uploadProfileMedia(kind, file);
      const nextAvatarUrl = item.avatarUrl || item.profileImageUrl || "";
      const nextBannerUrl = item.bannerUrl || "";
      updateChannel({
        avatarUrl: nextAvatarUrl || undefined,
        bannerUrl: nextBannerUrl || undefined
      });
      notifyProfileUpdated();
      setStatus(kind === "avatar" ? "Avatar updated." : "Banner updated.");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channel Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Customize your channel identity and artwork.</p>
        </div>
        <button type="button" onClick={() => navigate("/my-channels")} className="h-10 px-4 rounded-xl border border-white/15 text-sm text-foreground">
          Back
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="relative h-40 bg-gradient-to-r from-primary/20 via-cyan-500/10 to-transparent">
          {channel.bannerUrl && <img src={channel.bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />}
          <label className="absolute top-3 right-3 h-9 px-3 rounded-lg border border-white/15 bg-black/40 text-xs text-white inline-flex items-center cursor-pointer">
            Change banner
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (isPrimaryChannel) {
                  await onUploadPrimaryMedia("banner", file);
                } else {
                  void toDataUrl(file).then((bannerUrl) => updateChannel({ bannerUrl }));
                }
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-4">
            <img
              src={channel.avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-background"
            />
            <label className="h-9 px-3 rounded-lg border border-white/15 text-xs text-foreground inline-flex items-center cursor-pointer">
              Change avatar
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (isPrimaryChannel) {
                    await onUploadPrimaryMedia("avatar", file);
                  } else {
                    void toDataUrl(file).then((avatarUrl) => updateChannel({ avatarUrl }));
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Channel name</label>
            <input
              value={channel.name}
              onChange={(e) => updateChannel({ name: e.target.value })}
              className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Handle</label>
            <input
              value={channel.handle}
              onChange={(e) => updateChannel({ handle: e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "_") })}
              className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bio</label>
            <textarea
              value={channel.bio}
              onChange={(e) => updateChannel({ bio: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-foreground text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void onSave()} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
              {saving ? "Saving..." : "Save channel settings"}
            </button>
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
