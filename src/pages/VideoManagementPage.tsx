import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { deleteVideo, fetchMyManageVideos, retryVideoUpload, type ManageVideoItem } from "@/lib/api";
import { formatViewCount, formatRelativeTime, formatDuration } from "@/lib/mockData";
import { Edit2, Trash2, Eye, Plus, LayoutDashboard, RefreshCw } from "lucide-react";

export default function VideoManagementPage() {
   const [videos, setVideos] = useState<ManageVideoItem[]>([]);
   const [message, setMessage] = useState("");
   const [error, setError] = useState("");
   const [workingId, setWorkingId] = useState("");

   const load = () => {
      fetchMyManageVideos().then(setVideos).catch(() => setVideos([]));
   };

  useEffect(() => {
      load();
  }, []);

   const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this video?")) {
         try {
            setWorkingId(id);
            await deleteVideo(id);
            setVideos((v) => v.filter((vid) => vid.id !== id));
            setError("");
            setMessage("Video deleted.");
         } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete video");
         } finally {
            setWorkingId("");
         }
    }
  };

   const canRetry = (video: ManageVideoItem) => video.status === "FAILED" || video.status === "UPLOADING" || video.status === "PROCESSING";

   const handleRetry = async (id: string) => {
      try {
         setWorkingId(id);
         setError("");
         setMessage("");
         await retryVideoUpload(id);
         setMessage("Retry triggered. Refreshing status...");
         load();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Retry failed");
      } finally {
         setWorkingId("");
      }
   };

   const statusBadgeClass = (status: ManageVideoItem["status"]) => {
      if (status === "READY") return "bg-green-500/10 text-green-500";
      if (status === "FAILED") return "bg-red-500/10 text-red-500";
      if (status === "PROCESSING") return "bg-amber-500/10 text-amber-500";
      if (status === "UPLOADING") return "bg-blue-500/10 text-blue-500";
      return "bg-muted text-muted-foreground";
   };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channel Content</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage, edit, and supervise your uploaded videos.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="px-5 py-2.5 rounded-full bg-surface border border-border text-foreground hover:bg-surface-hover text-sm font-medium transition-colors flex items-center gap-2">
            <LayoutDashboard size={16} /> Dashboard
          </Link>
          <Link to="/upload" className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
            <Plus size={18} /> Upload Video
          </Link>
        </div>
      </div>

         {(message || error) && (
            <div className="space-y-1">
               {message && <p className="text-sm text-green-500">{message}</p>}
               {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
         )}

      <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-sm">
         <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
               <thead>
                  <tr className="border-b border-border text-sm text-muted-foreground">
                    <th className="px-6 py-4 font-medium sticky left-0 bg-surface z-10 w-[40%]">Video</th>
                              <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Visibility</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Views</th>
                    <th className="px-6 py-4 font-medium">Comments</th>
                    <th className="px-6 py-4 font-medium text-right w-[150px]">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {videos.map(v => (
                     <tr key={v.id} className="group hover:bg-surface-hover transition-colors">
                        <td className="px-6 py-3 sticky left-0 bg-surface group-hover:bg-surface-hover z-10 transition-colors">
                           <div className="flex items-start gap-4">
                              <div className="relative w-32 aspect-video bg-background rounded-lg overflow-hidden flex-shrink-0 border border-border/50">
                                                                           <img src={v.thumbnailUrl || `https://placehold.co/320x180?text=${encodeURIComponent("No Thumbnail")}`} className="w-full h-full object-cover" alt="thumb" loading="lazy" decoding="async" width={320} height={180} sizes="128px" />
                                <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 text-[10px] rounded font-medium text-white">{formatDuration(v.duration)}</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-tight">{v.title}</h3>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{v.description || "No description provided."}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeClass(v.status)}`}>
                              {v.status}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
                              <Eye size={12} /> {v.visibility}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex flex-col">
                              <span className="text-sm text-foreground">{new Date(v.publishedAt || v.createdAt).toLocaleDateString()}</span>
                              <span className="text-xs text-muted-foreground">{formatRelativeTime(v.publishedAt || v.createdAt)}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">{formatViewCount(v.viewCount)}</td>
                        <td className="px-6 py-4 text-sm text-foreground">-</td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Link to={`/dashboard/videos/${v.id}/edit`} className="p-2 aspect-square rounded-full bg-secondary text-secondary-foreground hover:bg-surface-hover-dark transition-colors" title="Edit">
                                <Edit2 size={16} />
                              </Link>
                              {canRetry(v) && (
                                <button
                                  onClick={() => void handleRetry(v.id)}
                                  disabled={workingId === v.id}
                                  className="p-2 aspect-square rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                  title="Retry Upload"
                                >
                                  <RefreshCw size={16} />
                                </button>
                              )}
                              <Link to={`/clips/${v.id}`} className="p-2 aspect-square rounded-full bg-secondary text-secondary-foreground hover:bg-surface-hover-dark transition-colors" title="Watch on YoBunny">
                                <Eye size={16} />
                              </Link>
                              <button onClick={() => void handleDelete(v.id)} disabled={workingId === v.id} className="p-2 aspect-square rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50" title="Delete">
                                <Trash2 size={16} />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
            {videos.length === 0 && (
               <div className="py-20 text-center text-muted-foreground text-sm flex flex-col items-center justify-center">
                  <p>You haven't uploaded any videos yet.</p>
                  <Link to="/upload" className="mt-4 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Get Started</Link>
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
