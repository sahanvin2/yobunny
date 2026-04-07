import { Link, useLocation } from "react-router-dom";
import { Home, Search, Plus, Users, User } from "lucide-react";
import ProtectedLink from "@/components/auth/ProtectedLink";

const items = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Search", path: "/search" },
  { icon: Plus, label: "Upload", path: "/upload", isUpload: true, protected: true },
  { icon: Users, label: "Subs", path: "/subscriptions" },
  { icon: User, label: "Profile", path: "/settings", protected: true },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-background border-t border-border z-40 flex items-center justify-around px-2">
      {items.map(({ icon: Icon, label, path, isUpload, protected: isProtected }) => {
        const active = location.pathname === path;
        if (isUpload) {
          return (
            <ProtectedLink
              key={path}
              to={path}
              className="flex flex-col items-center justify-center -mt-4"
              aria-label={label}
            >
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg">
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
              className={`flex flex-col items-center justify-center gap-0.5 py-1 ${
                active ? "text-foreground" : "text-text-tertiary"
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
            className={`flex flex-col items-center justify-center gap-0.5 py-1 ${
              active ? "text-foreground" : "text-text-tertiary"
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
