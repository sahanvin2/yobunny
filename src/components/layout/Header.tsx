import { Link } from "react-router-dom";
import { Search, Bell, Upload, Menu, Users, LayoutDashboard, Database, Settings, Moon, HelpCircle, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import ProtectedLink from "@/components/auth/ProtectedLink";
import { isAuthenticated, signOutLocal } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { fetchMe } from "@/lib/api";

export default function Header() {
  const fallbackAvatar = "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [, setAuthTick] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("YoBunny User");
  const [email, setEmail] = useState("user@yobunny.com");
  const [avatarUrl, setAvatarUrl] = useState(fallbackAvatar);
  const { openAuthModal } = useAuthModal();
  const authenticated = isAuthenticated();

  useEffect(() => {
    if (!authenticated) return;
    const loadProfile = () => {
      fetchMe()
        .then((user) => {
          setDisplayName(user.displayName || "YoBunny User");
          setEmail(user.email || "user@yobunny.com");
          setAvatarUrl(user.avatarUrl || user.profileImageUrl || fallbackAvatar);
        })
        .catch(() => undefined);
    };

    loadProfile();
    window.addEventListener("focus", loadProfile);
    window.addEventListener("yobunny:user-profile-updated", loadProfile as EventListener);

    return () => {
      window.removeEventListener("focus", loadProfile);
      window.removeEventListener("yobunny:user-profile-updated", loadProfile as EventListener);
    };
  }, [authenticated, fallbackAvatar]);

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-[var(--sidebar-w,220px)] transition-[left] duration-200 h-[calc(var(--header-h)+var(--safe-top))] bg-background/95 backdrop-blur-sm border-b border-border z-30 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 pt-[var(--safe-top)]">
      <button className="hidden p-2 rounded-xl hover:bg-accent text-foreground" aria-label="Menu">
        <Menu size={20} />
      </button>

      <Link to="/" className="lg:hidden flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="YoBunny" className="w-8 h-8 rounded-md" />
        <span className="text-foreground font-bold text-lg tracking-tight">YoBunny</span>
      </Link>

      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-[560px] hidden sm:block">
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            className="w-full h-10 pl-4 pr-10 rounded-full bg-surface border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors relative z-50"
          />
          <Link
            to={searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : "/search"}
            className="absolute right-1 top-1 p-2 rounded-full hover:bg-surface-hover text-muted-foreground transition-colors z-50"
            aria-label="Search"
          >
            <Search size={16} />
          </Link>

          {searchFocused && (
            <div className="absolute top-0 left-0 right-0 pt-12 pb-2 bg-surface rounded-3xl border border-border shadow-2xl z-40 overflow-hidden animate-fade-in">
              <div className="px-2">
                <Link to={`/search?q=${searchQuery}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl transition-colors">
                  <Search size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{searchQuery || "Trending now"}</span>
                </Link>
                <Link to={`/search?q=${searchQuery} gaming`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl transition-colors">
                  <Search size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{searchQuery || "Gaming"} videos</span>
                </Link>
                <Link to={`/search?q=${searchQuery} update`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl transition-colors">
                  <Search size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{searchQuery} update</span>
                </Link>
                <Link to={`/search?q=${searchQuery} original series`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl transition-colors">
                  <img src="https://api.dicebear.com/7.x/shapes/svg?seed=Show" className="w-8 h-5 rounded object-cover flex-shrink-0 bg-secondary" alt="thumb"/>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{searchQuery} original series</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        <Link
          to={searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : "/search"}
          className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface border border-border text-muted-foreground"
          aria-label="Search"
        >
          <Search size={18} />
        </Link>
      </div>

      <div className="flex items-center gap-1">
        <ProtectedLink
          to="/upload"
          className="hidden md:flex p-2.5 rounded-2xl hover:bg-accent text-foreground transition-colors"
          aria-label="Upload"
        >
          <Upload size={20} />
        </ProtectedLink>
        <ProtectedLink
          to="/notifications"
          className="p-2.5 rounded-2xl hover:bg-accent text-foreground transition-colors relative min-h-11 min-w-11 inline-flex items-center justify-center"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-foreground rounded-full" />
        </ProtectedLink>
        {authenticated ? (
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="ml-2 w-9 h-9 rounded-full bg-surface border border-border overflow-hidden"
            >
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(fallbackAvatar)} />
            </button>
            
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] w-[260px] bg-surface border border-border shadow-2xl rounded-3xl p-3 z-50 animate-fade-in divide-y divide-border/50">
                <div className="pb-3 text-center">
                  <div className="w-16 h-16 rounded-full mx-auto mb-2 overflow-hidden border-2 border-border relative">
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(fallbackAvatar)} />
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-yellow-500 rounded-full border border-black flex items-center justify-center text-[10px] font-bold text-black">!</div>
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground">{displayName}</h3>
                  <p className="text-xs text-muted-foreground truncate px-2">{email}</p>
                  <Link to="/settings" onClick={() => setProfileOpen(false)} className="mt-3 block w-full text-center bg-secondary hover:bg-surface-hover text-foreground text-sm font-semibold py-2 rounded-2xl transition-colors">
                    Profile settings <span className="ml-1 bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">ID</span>
                  </Link>
                </div>
                <div className="pt-2 pb-2 space-y-1">
                  <Link to="/subscriptions" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <Users size={18} className="text-muted-foreground" /> My channels
                  </Link>
                  <Link to="/dashboard" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <LayoutDashboard size={18} className="text-muted-foreground" /> Creator dashboard
                  </Link>
                  <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <span className="flex items-center gap-3"><Database size={18} className="text-muted-foreground" /> Votes</span>
                    <span className="text-muted-foreground">0</span>
                  </button>
                  <Link to="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <Settings size={18} className="text-muted-foreground" /> Settings
                  </Link>
                  <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <Moon size={18} className="text-muted-foreground" /> Mode: <span className="text-blue-500">System</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <HelpCircle size={18} className="text-muted-foreground" /> Help
                  </button>
                </div>
                <div className="pt-2">
                  <button onClick={() => { signOutLocal(); setAuthTick((v) => v + 1); setProfileOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground">
                    <LogOut size={18} className="text-muted-foreground" /> Sign out
                  </button>
                </div>
              </div>
            </>
            )}
          </div>
        ) : (
          <button
            onClick={() => openAuthModal()}
            className="hidden md:flex ml-2 px-4 py-2 text-sm font-medium rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity items-center"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
