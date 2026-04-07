import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MainLayout from "@/components/layout/MainLayout";
import Index from "./pages/Index";
import WatchPage from "./pages/WatchPage";
import UploadPage from "./pages/UploadPage";
import SearchPage from "./pages/SearchPage";
import ChannelPage from "./pages/ChannelPage";
import DashboardPage from "./pages/DashboardPage";
import DashboardCommentsPage from "./pages/DashboardCommentsPage";
import EditVideoPage from "./pages/EditVideoPage";
import SettingsPage from "./pages/SettingsPage";
import HistoryPage from "./pages/HistoryPage";
import SavedPage from "./pages/SavedPage";
import NotificationsPage from "./pages/NotificationsPage";
import LoginPage from "./pages/LoginPage";
import TrendingPage from "./pages/TrendingPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import LikedPage from "./pages/LikedPage";
import ClipsPage from "./pages/ClipsPage";
import ShortsPage from "./pages/ShortsPage";
import StreamsPage from "./pages/StreamsPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import MyChannelsPage from "./pages/MyChannelsPage";
import ChannelSettingsPage from "./pages/ChannelSettingsPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AuthModalProvider from "./components/auth/AuthModalProvider";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const GlobalHooks = () => {
  usePushNotifications();
  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GlobalHooks />
        <AuthModalProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<MainLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/watch/:id" element={<WatchPage />} />
              <Route
                path="/upload"
                element={
                  <ProtectedRoute>
                    <UploadPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/channel/:username" element={<ChannelPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/videos/:id/comments"
                element={
                  <ProtectedRoute>
                    <DashboardCommentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/videos/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditVideoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/saved"
                element={
                  <ProtectedRoute>
                    <SavedPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/trending" element={<TrendingPage />} />
              <Route path="/clips" element={<ClipsPage />} />
              <Route path="/shorts" element={<ShortsPage />} />
              <Route path="/shorts/:id" element={<ShortsPage />} />
              <Route path="/streams" element={<StreamsPage />} />
              <Route path="/live" element={<StreamsPage />} />
              <Route
                path="/playlists"
                element={
                  <ProtectedRoute>
                    <PlaylistsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-channels"
                element={
                  <ProtectedRoute>
                    <MyChannelsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-channels/:channelId/settings"
                element={
                  <ProtectedRoute>
                    <ChannelSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/kids" element={<Index />} />
              <Route path="/movies" element={<Index />} />
              <Route path="/shows" element={<Index />} />
              <Route path="/sports" element={<Index />} />
              <Route path="/series" element={<Index />} />
              <Route path="/gaming" element={<Index />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route
                path="/liked"
                element={
                  <ProtectedRoute>
                    <LikedPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthModalProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
