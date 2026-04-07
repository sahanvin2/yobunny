import { Link, useLocation } from "react-router-dom";
import {
  Home, TrendingUp, Clock, Bookmark, ThumbsUp, LayoutDashboard,
  ChevronLeft, ChevronRight, Radio, Scissors, ListVideo,
  Smile, Film, Tv, Trophy, Gamepad2, MonitorPlay
} from "lucide-react";
import { useEffect, useState } from "react";
import ProtectedLink from "@/components/auth/ProtectedLink";

const navSections = [
  {
    items: [
      { icon: Radio, label: "Streams", path: "/streams" },
      { icon: Home, label: "Home", path: "/" },
      { icon: TrendingUp, label: "Trending", path: "/trending" },
      { icon: Scissors, label: "Shorts", path: "/shorts" },
    ]
  },
  {
    items: [
      { icon: Clock, label: "Watch history", path: "/history", protected: true },
      { icon: Bookmark, label: "Watch later", path: "/saved", protected: true },
      { icon: ThumbsUp, label: "Liked videos", path: "/liked", protected: true },
      { icon: ListVideo, label: "My playlists", path: "/playlists", protected: true },
      { icon: MonitorPlay, label: "My channels", path: "/my-channels", protected: true },
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
      { icon: Radio, label: "Live streams", path: "/live" },
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
      className={`hidden lg:flex flex-col fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border z-40 transition-all duration-200 ${
        collapsed ? "w-[72px]" : "w-[220px]"
      }`}
    >
      <div className="flex items-center justify-between h-[60px] px-4 gap-2">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
          <img src="/logo.png" alt="YoBunny" className="w-8 h-8 flex-shrink-0 rounded-md" />
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
                const active = location.pathname === path;
                const className = `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
