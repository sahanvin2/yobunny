import { Link } from "react-router-dom";
import { Play, MoreVertical, Clock, MinusCircle, UserX, Share2, AlertCircle, Facebook, Twitter, MessageCircle, Link as LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VideoData, formatViewCount, formatDuration, formatRelativeTime } from "@/lib/mockData";

interface VideoCardProps {
  video: VideoData;
}

const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff";

export default function VideoCard({ video }: VideoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [video.id, video.thumbnailUrl]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setShowShareOptions(false);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [menuOpen]);

  const runShare = async () => {
    const url = `${window.location.origin}/watch/${video.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied!");
      setTimeout(() => setShareStatus(""), 2000);
    } catch {
      setShareStatus("Copy failed");
      setTimeout(() => setShareStatus(""), 2000);
    }
  };

  return (
    <div className="relative group/card animate-fade-in">
      <Link to={`/watch/${video.id}`} className="group block">
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-surface mb-3">
          {!thumbnailFailed ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-surface to-background flex items-center justify-center text-xs text-muted-foreground">
              Thumbnail unavailable
            </div>
          )}
          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-background/80 flex items-center justify-center">
                <Play size={20} className="text-foreground ml-0.5" fill="currentColor" />
              </div>
            </div>
          </div>
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium bg-background/80 text-foreground flex items-center gap-1">
            <Clock size={12} />
            {formatDuration(video.duration)}
          </span>
        </div>
      </Link>
      
      <div className="flex gap-3 relative">
        <Link to={`/channel/${video.channel.username}`} className="flex-shrink-0">
          <img
            src={video.channel.avatarUrl}
            alt={video.channel.displayName}
            className="w-9 h-9 rounded-full bg-surface object-cover"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.src = FALLBACK_AVATAR;
            }}
          />
        </Link>
        <Link to={`/watch/${video.id}`} className="flex-1 min-w-0 pr-6 group-hover/card:underline decoration-transparent hover:decoration-foreground">
          <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-5">
            {video.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {video.channel.displayName}
            {video.channel.isVerified && (
              <span className="ml-1 text-text-tertiary">✓</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatViewCount(video.viewCount)} views · {formatRelativeTime(video.publishedAt)}
          </p>
        </Link>

        <div ref={menuRef} className="absolute top-0 right-0 z-20">
          <button
            className="p-1.5 rounded-full bg-background/80 backdrop-blur text-muted-foreground hover:bg-surface-hover md:opacity-0 md:group-hover/card:opacity-100 transition-opacity"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            aria-label="Open video actions"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && !showShareOptions && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-2xl bg-surface border border-border shadow-xl p-2 space-y-0.5 animate-fade-in origin-top-right">
              <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><Clock size={16} /> Watch later</button>
              <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><MinusCircle size={16} /> Not interesting</button>
              <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><UserX size={16} /> Don't recommend channel</button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowShareOptions(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"
              >
                <div className="flex items-center gap-3"><Share2 size={16} /> Share</div>
              </button>
              <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover rounded-xl text-sm transition-colors text-foreground"><AlertCircle size={16} /> Report</button>
            </div>
          )}

          {menuOpen && showShareOptions && (
             <div className="absolute right-0 top-full mt-1 w-[260px] p-4 bg-surface border border-border shadow-2xl rounded-3xl z-50 animate-fade-in origin-top-right">
               <div className="flex items-center justify-between mb-3">
                 <h4 className="text-sm font-semibold text-foreground">Share this video</h4>
                 <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowShareOptions(false); }} className="text-xs text-muted-foreground hover:text-foreground">Back</button>
               </div>
               <div className="flex gap-2 mb-3">
                 <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + '/watch/' + video.id)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity"><Facebook size={18} /></a>
                 <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.origin + '/watch/' + video.id)}&text=${encodeURIComponent(video.title)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:opacity-90 transition-opacity"><Twitter size={18} /></a>
                 <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(video.title + " " + window.location.origin + '/watch/' + video.id)}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity"><MessageCircle size={18} /></a>
                 <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void runShare(); }} className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:opacity-90 transition-opacity border border-border"><LinkIcon size={18} /></button>
               </div>
               {shareStatus && <p className="text-xs font-medium text-primary text-center">{shareStatus}</p>}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
