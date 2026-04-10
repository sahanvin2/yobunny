import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main className="pt-[calc(var(--header-h)+var(--safe-top))] pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+8px)] lg:pb-0 lg:pl-[var(--sidebar-w,220px)] transition-[padding] duration-200">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
