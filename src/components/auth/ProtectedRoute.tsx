import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { openAuthModal } = useAuthModal();
  const authenticated = isAuthenticated();
  const redirectPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!authenticated) {
      openAuthModal(redirectPath);
    }
  }, [authenticated, openAuthModal, redirectPath]);

  if (!authenticated) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Sign in required</h2>
        <p className="text-sm text-muted-foreground">Please sign in to continue.</p>
      </div>
    );
  }

  return <>{children}</>;
}
