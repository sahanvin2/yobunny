import { useEffect, useRef, useState } from "react";
import { User, Shield, Bell, Upload, Link as LinkIcon, Twitter, Youtube } from "lucide-react";
import { fetchMe, updateMe, uploadProfileMedia } from "@/lib/api";

const tabs = [
  { id: "profile", label: "Profile Settings", icon: User },
  { id: "playback", label: "Playback & Quality", icon: Shield },
  { id: "network", label: "Data & Network", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "cookies", label: "Privacy & Cookies", icon: Shield }
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<string>("profile");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMe()
      .then((user) => {
        setDisplayName(user.displayName || "");
        setUsername(user.username || "");
        setBio(user.bio || "");
        setEmail(user.email || "");
        setAvatarUrl(user.avatarUrl || user.profileImageUrl || "");
        setBannerUrl(user.bannerUrl || "");
      })
      .catch(() => undefined);
  }, []);

  const uploadMedia = async (kind: "avatar" | "banner", file: File) => {
    try {
      if (kind === "avatar") {
        setUploadingAvatar(true);
      } else {
        setUploadingBanner(true);
      }

      setStatus(kind === "avatar" ? "Uploading avatar..." : "Uploading banner...");
      const { item } = await uploadProfileMedia(kind, file);
      const nextAvatarUrl = item.avatarUrl || item.profileImageUrl || "";
      const nextBannerUrl = item.bannerUrl || "";
      setAvatarUrl(nextAvatarUrl ? `${nextAvatarUrl}${nextAvatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}` : "");
      setBannerUrl(nextBannerUrl ? `${nextBannerUrl}${nextBannerUrl.includes("?") ? "&" : "?"}v=${Date.now()}` : "");
      window.dispatchEvent(new CustomEvent("yobunny:user-profile-updated"));
      setStatus(kind === "avatar" ? "Avatar updated" : "Banner updated");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
      setUploadingBanner(false);
    }
  };

  const onSave = async () => {
    try {
      setStatus("Saving...");
      await updateMe({ displayName, username, bio });
      window.dispatchEvent(new CustomEvent("yobunny:user-profile-updated"));
      setStatus("Saved successfully");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="p-4 lg:p-10 max-w-4xl mx-auto animate-fade-in relative z-10 space-y-8">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[100px] pointer-events-none opacity-40" />

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm mb-2">Settings</h1>
        <p className="text-white/50 text-sm">Manage your profile, account details, and preferences.</p>
      </div>

      <div className="flex gap-4 mb-8 overflow-x-auto scrollbar-hide pb-2 border-b border-white/10">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2.5 pb-3 px-2 text-sm font-bold uppercase tracking-wide transition-all relative whitespace-nowrap ${
              tab === id ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <Icon size={18} /> {label}
            {tab === id && (
              <span className="absolute bottom-0 left-0 w-full h-1 bg-white rounded-t-full shadow-[0_-2px_10px_rgba(255,255,255,0.5)]" />
            )}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10 space-y-6">
            <div className="relative mb-12">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void uploadMedia("banner", file);
                  }
                }}
              />
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void uploadMedia("avatar", file);
                  }
                }}
              />

              <div className="w-full h-32 md:h-48 rounded-2xl bg-black/40 border border-white/10 overflow-hidden relative shadow-inner">
                {bannerUrl ? (
                  <img src={bannerUrl} alt="Banner preview" className="absolute inset-0 h-full w-full object-cover" onError={() => setBannerUrl("")} loading="lazy" decoding="async" width={1600} height={400} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent z-0" />
                )}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpdGg9IjQiIGhlaWdodD0iNCI+CjxyZWN0IHdpdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjA1Ii8+Cjwvc3ZnPg==')] opacity-20 z-0" />
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white backdrop-blur-sm z-10 bg-black/40">
                  <button type="button" onClick={() => bannerInputRef.current?.click()} className="flex flex-col items-center justify-center">
                    <Upload size={24} className="mb-2" />
                    <span className="text-sm font-bold tracking-wide">{uploadingBanner ? "Uploading..." : "Change Banner"}</span>
                  </button>
                </div>
              </div>

              <div className="absolute -bottom-10 left-8 group/avatar cursor-pointer">
                <div className="relative">
                  <img src={avatarUrl || "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff"} className="w-24 h-24 rounded-full border-4 border-black object-cover shadow-2xl relative z-10 transition-transform duration-300 group-hover/avatar:scale-105" alt="Avatar" onError={() => setAvatarUrl("")} loading="lazy" decoding="async" width={96} height={96} />
                  <button type="button" onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-full bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity text-white">
                    <Upload size={20} />
                    <span className="mt-1 text-[11px] font-bold tracking-wide">{uploadingAvatar ? "Uploading..." : "Change"}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-8">
              <label className="block text-sm font-semibold text-white mb-2 ml-1">Display Name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2 ml-1">Username (required)</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full h-14 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2 ml-1">Bio & Description</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Tell us about yourself and your content..." className="w-full px-5 py-4 rounded-2xl bg-black/40 border border-white/10 text-white text-base resize-none focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
            </div>

            <div className="pt-6 border-t border-white/10">
              <h3 className="text-lg font-bold text-white tracking-tight mb-4">Social Links</h3>
              <div className="space-y-4">
                <div className="relative">
                  <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" size={18} />
                  <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="Personal Website URL" className="w-full h-14 pl-12 pr-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
                </div>
                <div className="relative">
                  <Twitter className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" size={18} />
                  <input value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="Twitter / X Profile URL" className="w-full h-14 pl-12 pr-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
                </div>
                <div className="relative">
                  <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" size={18} />
                  <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="YouTube Channel URL" className="w-full h-14 pl-12 pr-5 rounded-2xl bg-black/40 border border-white/10 text-white text-base focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all shadow-inner" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              {status ? (
                <p className="text-sm font-bold tracking-wide text-green-400 bg-green-400/10 px-4 py-2 rounded-xl border border-green-400/20">{status}</p>
              ) : <div />}
              <button onClick={onSave} className="px-10 py-4 rounded-full bg-white text-black text-sm font-bold tracking-wide shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all duration-300 w-full sm:w-auto">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "playback" && (
        <div className="space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <h2 className="text-xl font-bold text-white tracking-tight mb-4">Playback & Quality</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div>
                <p className="text-base font-semibold text-white">Default Video Quality</p>
                <p className="text-sm text-white/50 mt-1">Set the preferred quality for streaming</p>
              </div>
              <select className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-4 py-2 focus:outline-none">
                <option className="bg-black text-white">Auto (Recommended)</option>
                <option className="bg-black text-white">1080p HD</option>
                <option className="bg-black text-white">720p HD</option>
                <option className="bg-black text-white">Data Saver</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div>
                <p className="text-base font-semibold text-white">Download Quality</p>
                <p className="text-sm text-white/50 mt-1">Quality of videos saved for offline viewing</p>
              </div>
              <select className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-4 py-2 focus:outline-none">
                <option className="bg-black text-white">Ask Each Time</option>
                <option className="bg-black text-white">1080p (Large size)</option>
                <option className="bg-black text-white">720p (Medium size)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div>
                <p className="text-base font-semibold text-white">Autoplay next video</p>
                <p className="text-sm text-white/50 mt-1">Automatically start the next recommended video</p>
              </div>
              <div className="w-12 h-7 rounded-full bg-primary relative cursor-pointer shadow-lg transition-all hover:scale-105 active:scale-95">
                <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-black shadow-sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "network" && (
        <div className="space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <h2 className="text-xl font-bold text-white tracking-tight mb-4">Data & Network</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div>
                <p className="text-base font-semibold text-white">Stream over Wi-Fi only</p>
                <p className="text-sm text-white/50 mt-1">Reduce mobile data usage by preventing streaming on cellular networks</p>
              </div>
              <div className="w-12 h-7 rounded-full bg-white/20 relative cursor-pointer outline outline-1 outline-white/10 transition-all hover:scale-105 active:scale-95">
                <div className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow-sm" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div>
                <p className="text-base font-semibold text-white">Download over Wi-Fi only</p>
                <p className="text-sm text-white/50 mt-1">Wait for a Wi-Fi connection to download videos</p>
              </div>
              <div className="w-12 h-7 rounded-full bg-primary relative cursor-pointer shadow-lg transition-all hover:scale-105 active:scale-95">
                <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-black shadow-sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "cookies" && (
        <div className="space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <h2 className="text-xl font-bold text-white tracking-tight mb-4">Privacy & Cookies</h2>

          <p className="text-white/70 text-sm mb-6 leading-relaxed">
            We use cookies to enhance your experience, analyze platform traffic, and serve tailored content.
            You can adjust your cookie preferences below at any time.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div className="pr-6">
                <p className="text-base font-semibold text-white">Strictly Necessary Cookies</p>
                <p className="text-sm text-white/50 mt-1">Required for the platform to function properly. Cannot be disabled.</p>
              </div>
              <div className="px-3 py-1 bg-white/10 rounded-lg text-white/50 text-xs font-bold uppercase tracking-wider">Always On</div>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div className="pr-6">
                <p className="text-base font-semibold text-white">Analytical Cookies</p>
                <p className="text-sm text-white/50 mt-1">Help us understand how you use YoBunny so we can improve the platform.</p>
              </div>
              <div className="w-12 h-7 rounded-full bg-primary relative cursor-pointer shadow-lg transition-all hover:scale-105 active:scale-95">
                <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-black shadow-sm" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/10">
              <div className="pr-6">
                <p className="text-base font-semibold text-white">Personalization Cookies</p>
                <p className="text-sm text-white/50 mt-1">Used to remember your preferences and tailor your experience.</p>
              </div>
              <div className="w-12 h-7 rounded-full bg-primary relative cursor-pointer shadow-lg transition-all hover:scale-105 active:scale-95">
                <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-black shadow-sm" />
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/10 flex gap-4">
              <button className="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]">Save Preferences</button>
              <button className="flex-1 py-3 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-all">Reject Optional</button>
            </div>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="space-y-4">
          {[
            "New subscriber",
            "Comment on video",
            "Reply to comment",
            "Video processing complete"
          ].map((item) => (
            <div key={item} className="flex items-center justify-between bg-white/5 backdrop-blur-xl rounded-full p-5 px-8 border border-white/10 shadow-lg hover:border-white/30 transition-all duration-300">
              <span className="text-sm font-bold text-white tracking-wide">{item}</span>
              <div className="w-12 h-7 rounded-full bg-white relative cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.3)] opacity-100 transition-all hover:scale-105 active:scale-95">
                <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-black shadow-sm" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
