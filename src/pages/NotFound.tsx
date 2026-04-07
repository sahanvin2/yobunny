import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full bg-surface/50 border border-border p-12 rounded-3xl backdrop-blur-sm shadow-xl">
        <h1 className="mb-4 text-6xl font-bold bg-gradient-to-br from-primary to-primary/50 text-transparent bg-clip-text">404</h1>
        <p className="mb-8 text-xl text-muted-foreground font-medium">We couldn't find this page.</p>
        <a href="/" className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
