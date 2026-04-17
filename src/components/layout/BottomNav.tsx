import { Link, useLocation } from "react-router-dom";
import { Home, Search, Plus, Users, Scissors } from "lucide-react";
import ProtectedLink from "@/components/auth/ProtectedLink";

const items = [
  { icon: Scissors, label: "Home", path: "/" },
  { icon: Home, label: "Discover", path: "/discover" },
  { icon: Plus, label: "Upload", path: "/upload", isUpload: true, protected: true },
  { icon: Users, label: "Subs", path: "/subscriptions" },
  { icon: Search, label: "Search", path: "/search" },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(var(--bottom-nav-h)+var(--safe-bottom))] bg-background/95 backdrop-blur-md border-t border-border z-40 flex items-start justify-around px-2 pt-2 pb-[max(8px,var(--safe-bottom))]">
      {items.map(({ icon: Icon, label, path, isUpload, protected: isProtected }) => {
        const active = path === "/"
          ? location.pathname === "/" || location.pathname === "/home" || location.pathname === "/clips" || location.pathname.startsWith("/clips/")
          : location.pathname === path;
        if (isUpload) {
          return (
            <ProtectedLink
              key={path}
              to={path}
              className="flex flex-col items-center justify-center -mt-3 min-h-11 min-w-11"
              aria-label={label}
            >
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-black/30">
                <Icon size={24} className="text-primary-foreground" />
              </div>
            </ProtectedLink>
          );
        }

        if (isProtected) {
          return (
            <ProtectedLink
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 min-h-11 min-w-11 rounded-xl transition-colors ${
                active ? "text-foreground bg-surface" : "text-text-tertiary"
              }`}
              aria-label={label}
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </ProtectedLink>
          );
        }

        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 min-h-11 min-w-11 rounded-xl transition-colors ${
              active ? "text-foreground bg-surface" : "text-text-tertiary"
            }`}
            aria-label={label}
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
