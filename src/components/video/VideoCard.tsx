import { Link } from "react-router-dom";
import { Play, MoreVertical, Clock, MinusCircle, UserX, Share2, AlertCircle, Facebook, Twitter, MessageCircle, Link as LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VideoData, formatViewCount, formatDuration, formatRelativeTime } from "@/lib/mockData";

interface VideoCardProps {
  video: VideoData;
  priority?: boolean;
}

const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=YB&backgroundColor=111111&textColor=ffffff";

export default function VideoCard({ video, priority = false }: VideoCardProps) {
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
    <div className="relative group/card animate-fade-in transition-all duration-500 hover:-translate-y-2 hover:z-10">
      <Link to={`/watch/${video.id}`} className="group block">
        <div className="relative aspect-video rounded-[1.5rem] overflow-hidden bg-[#111] mb-4 border border-white/5 shadow-lg group-hover/card:shadow-[0_20px_50px_rgba(0,0,0,0.5)] group-hover/card:border-white/10 transition-all duration-500">
          {!thumbnailFailed ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-110"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              width={1280}
              height={720}
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 540px) 50vw, 100vw"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] flex items-center justify-center text-[10px] uppercase tracking-widest text-white/30 font-bold">
              Thumbnail unavailable
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none">
            <div className="opacity-0 group-hover/card:opacity-100 transition-all duration-500 transform translate-y-4 group-hover/card:translate-y-0">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-xl border border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                <Play size={24} className="text-white ml-1" fill="currentColor" />
              </div>
            </div>
          </div>
          <span className="absolute bottom-3 right-3 px-2 py-1 rounded-lg text-[10px] font-bold bg-black/60 text-white backdrop-blur-md flex items-center gap-1 shadow-sm opacity-100 group-hover/card:opacity-0 transition-opacity duration-300">
            <Clock size={12} />
            {formatDuration(video.duration)}
          </span>
        </div>
      </Link>
      
      <div className="flex gap-3 relative px-1">
        <Link to={`/channel/${video.channel.username}`} className="flex-shrink-0 relative group/avatar z-10">
          <div className="absolute inset-0 bg-primary/20 blur-md rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500" />
          <img
            src={video.channel.avatarUrl}
            alt={video.channel.displayName}
            className="w-10 h-10 rounded-full bg-[#111] object-cover border border-white/10 relative z-10 group-hover/avatar:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
            width={40}
            height={40}
            onError={(event) => {
              event.currentTarget.src = FALLBACK_AVATAR;
            }}
          />
        </Link>
        <Link to={`/watch/${video.id}`} className="flex-1 min-w-0 pr-6 group-hover/card:drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all">
          <h3 className="text-[15px] font-bold text-white line-clamp-2 leading-[1.3] tracking-tight group-hover/card:text-white/90">
            {video.title}
          </h3>
          <p className="text-[13px] font-medium text-white/50 mt-1 hover:text-white/80 transition-colors inline-block">
            {video.channel.displayName}
            {video.channel.isVerified && (
              <span className="ml-1 text-white/40">✓</span>
            )}
          </p>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] font-bold tracking-widest uppercase text-white/40">
            <span>{formatViewCount(video.viewCount)} views</span>
            <span className="w-1 h-1 rounded-full bg-white/20 mx-1" />
            <span>{formatRelativeTime(video.publishedAt)}</span>
          </div>
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
