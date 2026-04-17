import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MainLayout from "@/components/layout/MainLayout";
import AuthModalProvider from "./components/auth/AuthModalProvider";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const ChannelPage = lazy(() => import("./pages/ChannelPage"));
const ChannelSettingsPage = lazy(() => import("./pages/ChannelSettingsPage"));
const DashboardCommentsPage = lazy(() => import("./pages/DashboardCommentsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const EditVideoPage = lazy(() => import("./pages/EditVideoPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const Index = lazy(() => import("./pages/Index"));
const LikedPage = lazy(() => import("./pages/LikedPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MyChannelsPage = lazy(() => import("./pages/MyChannelsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ModelPage = lazy(() => import("./pages/ModelPage"));
const PlaylistsPage = lazy(() => import("./pages/PlaylistsPage"));
const SavedPage = lazy(() => import("./pages/SavedPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ClipsPage = lazy(() => import("./pages/ClipsPage"));
const StreamsPage = lazy(() => import("./pages/StreamsPage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const TrendingPage = lazy(() => import("./pages/TrendingPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));

const GlobalHooks = () => {
  usePushNotifications();
  return null;
};

const queryClient = new QueryClient();

const RouteLoadingFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-sm text-white/60">Loading...</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GlobalHooks />
        <AuthModalProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<MainLayout />}>
                <Route path="/" element={<ClipsPage />} />
                <Route path="/home" element={<ClipsPage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/watch/:id" element={<Navigate to="/clips" replace />} />
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
                <Route path="/clips/:id" element={<ClipsPage />} />
                <Route path="/models/:slug" element={<ModelPage />} />
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
                <Route path="/kids" element={<ClipsPage />} />
                <Route path="/movies" element={<ClipsPage />} />
                <Route path="/shows" element={<ClipsPage />} />
                <Route path="/sports" element={<ClipsPage />} />
                <Route path="/series" element={<ClipsPage />} />
                <Route path="/gaming" element={<ClipsPage />} />
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
          </Suspense>
        </AuthModalProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
