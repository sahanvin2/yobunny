import { Link, useLocation } from "react-router-dom";
import {
  Home, TrendingUp, Clock, Bookmark, ThumbsUp, LayoutDashboard,
  ChevronLeft, ChevronRight, Compass, ListVideo,
  Smile, Film, Tv, Trophy, Gamepad2, MonitorPlay
} from "lucide-react";
import { useEffect, useState } from "react";
import ProtectedLink from "@/components/auth/ProtectedLink";

const navSections = [
  {
    items: [
      { icon: Home, label: "Home", path: "/" },
      { icon: Compass, label: "Discover", path: "/discover" },
      { icon: TrendingUp, label: "Trending", path: "/trending" },
    ]
  },
  {
    items: [
      { icon: Clock, label: "Watch history", path: "/history", protected: true },
      { icon: Bookmark, label: "Watch later", path: "/saved", protected: true },
      { icon: ThumbsUp, label: "Liked videos", path: "/liked", protected: true },
      { icon: ListVideo, label: "My playlists", path: "/playlists", protected: true },
      { icon: LayoutDashboard, label: "Creator dashboard", path: "/dashboard", protected: true },
    ]
  },
  {
    items: [
      { icon: Smile, label: "For kids", path: "/kids" },
      { icon: Film, label: "Movies", path: "/movies" },
      { icon: MonitorPlay, label: "Shows", path: "/shows" },
      { icon: Trophy, label: "Sports", path: "/sports" },
      { icon: Tv, label: "TV series", path: "/series" },
      { icon: Gamepad2, label: "Esports and games", path: "/gaming" },
    ]
  }
];

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "72px" : "220px");
  }, [collapsed]);

  return (
    <aside
      className={`hidden lg:flex flex-col fixed left-0 top-0 h-full bg-black/40 backdrop-blur-[40px] border-r border-white/[0.05] z-40 transition-all duration-300 shadow-[20px_0_40px_rgba(0,0,0,0.3)] ${
        collapsed ? "w-[72px]" : "w-[240px]"
      }`}
    >
      <div className="flex items-center justify-between h-[60px] px-4 gap-2">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
          <img src="/logo.webp" alt="YoBunny" className="w-8 h-8 flex-shrink-0 rounded-md" width={32} height={32} loading="eager" decoding="async" />
          {!collapsed && (
            <span className="text-foreground font-bold text-lg tracking-tight group-hover:text-primary transition-colors">
              YoBunny
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors ml-auto"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto custom-scrollbar">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className={`mb-3 ${sIdx !== navSections.length - 1 ? 'pb-3 border-b border-sidebar-border' : ''}`}>
            <div className="space-y-0.5">
              {section.items.map(({ icon: Icon, label, path, protected: isProtected }) => {
                const active = path === "/"
                  ? location.pathname === "/" || location.pathname === "/home" || location.pathname === "/clips" || location.pathname.startsWith("/clips/")
                  : location.pathname === path;
                const className = `flex items-center gap-4 px-4 py-3 rounded-2xl text-[14px] font-bold tracking-wide transition-all duration-300 ${
                  active
                    ? "bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/[0.05] translate-x-1"
                    : "text-white/50 hover:bg-white/[0.03] hover:text-white/90 hover:translate-x-1 border border-transparent"
                }`;

                if (isProtected) {
                  return (
                    <ProtectedLink
                      key={path}
                      to={path}
                      className={className}
                      title={collapsed ? label : undefined}
                    >
                      <Icon size={20} className="flex-shrink-0" />
                      {!collapsed && <span>{label}</span>}
                    </ProtectedLink>
                  );
                }

                return (
                  <Link
                    key={path}
                    to={path}
                    className={className}
                    title={collapsed ? label : undefined}
                  >
                    <Icon size={20} className="flex-shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border">
        {!collapsed && (
          <p className="text-xs text-text-tertiary">© 2026 YoBunny</p>
        )}
      </div>
    </aside>
  );
}
