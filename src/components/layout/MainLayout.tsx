import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";

export default function MainLayout() {
  return (
    <div className="min-h-screen text-foreground relative selection:bg-primary/30 selection:text-white">
      {/* Premium Global Background */}
      <div className="fixed inset-0 -z-50 bg-[#060608] overflow-hidden">
        <div className="absolute top-[5%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-600/5 blur-[120px] mix-blend-screen pointer-events-none opacity-70 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-purple-600/5 blur-[140px] mix-blend-screen pointer-events-none opacity-60" />
        <div className="absolute top-[40%] right-[10%] w-[30vw] h-[30vw] rounded-full bg-indigo-600/5 blur-[100px] mix-blend-screen pointer-events-none opacity-50" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDE1Ii8+Cjwvc3ZnPg==')] pointer-events-none" />
      </div>

      <Sidebar />
      <Header />
      <main className="pt-[calc(var(--header-h)+var(--safe-top))] pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+8px)] lg:pb-0 lg:pl-[var(--sidebar-w,220px)] transition-[padding] duration-200">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
