import { createContext, useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { signInLocal } from "@/lib/auth";

type AuthModalContextType = {
  openAuthModal: (redirectTo?: string) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextType | null>(null);

type AuthModalProviderProps = {
  children: React.ReactNode;
};

export default function AuthModalProvider({ children }: AuthModalProviderProps) {
  const [open, setOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string>("/");
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const value = useMemo<AuthModalContextType>(() => ({
    openAuthModal: (path?: string) => {
      setRedirectTo(path || `${location.pathname}${location.search}` || "/");
      setOpen(true);
    },
    closeAuthModal: () => setOpen(false)
  }), [location.pathname, location.search]);

  const onSubmit = () => {
    signInLocal();
    setOpen(false);
    navigate(redirectTo || "/");
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}

      {open && (
        <div className="fixed inset-0 z-[120]">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 space-y-5 relative">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                x
              </button>

              <h2 className="text-lg font-semibold text-foreground text-center">
                {isLogin ? "Welcome back" : "Create account"}
              </h2>

              <button onClick={onSubmit} className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <button onClick={onSubmit} className="w-full py-2.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-surface-hover transition-colors">
                {isLogin ? "Sign In" : "Create Account"}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button onClick={() => setIsLogin((v) => !v)} className="text-foreground font-medium hover:underline">
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error("useAuthModal must be used inside AuthModalProvider");
  }
  return context;
}
