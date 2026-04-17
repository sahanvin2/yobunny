import { Link } from "react-router-dom";
import { Eye, Users, Film, TrendingUp, Pencil, Trash2, Link2, Share2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteVideo, fetchDashboardStats, fetchMyVideos } from "@/lib/api";
import { formatViewCount, formatDuration, formatRelativeTime, type VideoData } from "@/lib/mockData";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalViews: 0, subscribers: 0, videoCount: 0 });
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [graphType, setGraphType] = useState<'trend' | 'video'>('trend');
  const [timeFilter, setTimeFilter] = useState<'1h' | '1d' | '7d' | '1m' | '1y'>('1m');
  const [trendData, setTrendData] = useState<{ name: string; views: number }[]>([]);

  const filteredVideos = videos;
  const effectiveStats = stats;

  const chartData = filteredVideos.map(v => ({
    name: v.title.length > 15 ? v.title.substring(0, 15) + "..." : v.title,
    fullTitle: v.title,
    views: v.viewCount
  })).reverse();

  useEffect(() => {
    fetchDashboardStats().then((data) => {
      setStats(data.item);
    }).catch(() => undefined);
    fetchMyVideos().then(setVideos).catch(() => setVideos([]));
  }, []);

  useEffect(() => {
    if (filteredVideos.length === 0) return;

    const now = Date.now();
    let cutoff = 0;
    if (timeFilter === '1h') cutoff = now - 60 * 60 * 1000;
    else if (timeFilter === '1d') cutoff = now - 24 * 60 * 60 * 1000;
    else if (timeFilter === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeFilter === '1m') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeFilter === '1y') cutoff = now - 365 * 24 * 60 * 60 * 1000;

    const olderVideos = filteredVideos.filter(v => new Date(v.publishedAt).getTime() < cutoff);
    let cumulative = olderVideos.reduce((acc, v) => acc + v.viewCount, 0);

    const recentVideos = filteredVideos.filter(v => new Date(v.publishedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

    const data = [];
    if (recentVideos.length === 0) {
      data.push({ name: 'Start', views: cumulative, fullTitle: 'Base View Count' });
      data.push({ name: 'Now', views: cumulative, fullTitle: 'Current' });
    } else {
      data.push({ name: 'Start', views: cumulative, fullTitle: 'Base View Count' });
      recentVideos.forEach(v => {
        cumulative += v.viewCount;
        data.push({
          name: new Date(v.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          fullTitle: v.title,
          views: cumulative
        });
      });
      data.push({ name: 'Now', views: cumulative, fullTitle: 'Current Total' });
    }
    setTrendData(data);
  }, [filteredVideos, timeFilter]);

  const removeVideo = async (videoId: string) => {
    const confirmed = window.confirm("Delete this video permanently?");
    if (!confirmed) return;

    try {
      setWorkingId(videoId);
      await deleteVideo(videoId);
      setVideos((prev) => prev.filter((video) => video.id !== videoId));
      setStats((prev) => ({ ...prev, videoCount: Math.max(0, prev.videoCount - 1) }));
      setError("");
      setMessage("Video deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete video");
    } finally {
      setWorkingId("");
    }
  };

  const copyVideoLink = async (videoId: string) => {
    try {
      const url = `${window.location.origin}/watch/${videoId}`;
      await navigator.clipboard.writeText(url);
      setError("");
      setMessage("Video link copied.");
    } catch {
      setError("Clipboard access failed.");
    }
  };

  const shareVideo = async (videoId: string, title: string) => {
    const url = `${window.location.origin}/watch/${videoId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    await copyVideoLink(videoId);
  };

  return (
    <div className="p-4 lg:p-10 max-w-6xl mx-auto space-y-8 animate-fade-in relative z-10">
      <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-primary/10 to-transparent opacity-30 pointer-events-none rounded-t-[3rem]" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-sm">Dashboard</h1>
          <p className="text-sm text-white/50 mt-1">Manage your content and analytics</p>
        </div>
        <div className="flex gap-2">
          <Link to="/upload" className="px-8 py-3 rounded-full bg-white text-black text-sm font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all duration-300 whitespace-nowrap text-center">
            Upload Video
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-6 border border-white/10 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Eye size={20} className="text-white/80" />
            </div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Total Views</p>
            <p className="text-4xl font-bold text-white tracking-tight">{formatViewCount(effectiveStats.totalViews)}</p>
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-6 border border-white/10 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Users size={20} className="text-white/80" />
            </div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Subscribers</p>
            <p className="text-4xl font-bold text-white tracking-tight">{formatViewCount(effectiveStats.subscribers)}</p>
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-6 border border-white/10 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Film size={20} className="text-white/80" />
            </div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Videos</p>
            <p className="text-4xl font-bold text-white tracking-tight">{effectiveStats.videoCount}</p>
          </div>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-8 border border-white/10 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <TrendingUp size={16} className="text-primary font-bold" />
            </div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Live Analytics Graph</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex bg-black/40 p-1 rounded-xl items-center border border-white/10">
              <button onClick={() => setGraphType('trend')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${graphType === 'trend' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>Total Views</button>
              <button onClick={() => setGraphType('video')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${graphType === 'video' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>Video Performance</button>
            </div>
            {graphType === 'trend' && (
              <div className="flex bg-black/40 p-1 rounded-xl items-center border border-white/10">
                {['1h', '1d', '7d', '1m', '1y'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTimeFilter(f as any)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === f ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="h-72 rounded-2xl bg-black/40 border border-white/5 shadow-inner p-4 relative overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            {graphType === 'video' ? (
              chartData.length > 0 ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#ffffff40"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#ffffff40"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value) => formatViewCount(value)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', borderColor: '#ffffff20', borderRadius: '12px', fontSize: '13px' }}
                    itemStyle={{ color: '#fff' }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle || ''}
                  />
                  <Bar dataKey="views" fill="#ffffff" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-medium">No video data available</div>
              )
            ) : (
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#ffffff40"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v, i) => (timeFilter === '1h' || timeFilter === '1m') ? (i % 5 === 0 ? v : '') : v}
                />
                <YAxis
                  stroke="#ffffff40"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(value) => formatViewCount(value)}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', borderColor: '#ffffff20', borderRadius: '12px', fontSize: '13px' }}
                  itemStyle={{ color: '#fff' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle || ''}
                />
                <Line type="monotone" dataKey="views" stroke="#ffffff" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#fff' }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-8 py-6 border-b border-white/10 bg-black/20">
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Your Videos</h3>
        </div>
        {(message || error) && (
          <div className="px-8 pt-6 space-y-2">
            {message && <p className="text-sm font-medium text-green-400 bg-green-400/10 px-4 py-2 rounded-xl border border-green-400/20">{message}</p>}
            {error && <p className="text-sm font-medium text-red-400 bg-red-400/10 px-4 py-2 rounded-xl border border-red-400/20">{error}</p>}
          </div>
        )}
        <div className="divide-y divide-white/5 flex flex-col">
          {filteredVideos.map((v) => (
            <div key={v.id} className="flex flex-col xl:flex-row xl:items-center gap-6 px-8 py-6 hover:bg-white/[0.02] transition-colors group">
              <Link to={`/watch/${v.id}`} className="relative group/thumb w-full xl:w-48 flex-shrink-0 block min-h-[108px]">
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-2xl flex items-center justify-center z-10 backdrop-blur-[2px]">
                  <Eye className="text-white w-8 h-8" />
                </div>
                <img src={v.thumbnailUrl} alt={v.title} className="w-full aspect-video rounded-2xl object-cover bg-black relative border border-white/10 shadow-lg" loading="lazy" decoding="async" width={640} height={360} sizes="(min-width: 1280px) 192px, 100vw" />
              </Link>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <Link to={`/watch/${v.id}`} className="text-base font-bold text-white truncate hover:underline underline-offset-4 mb-2">{v.title}</Link>
                <div className="flex items-center gap-4 text-xs font-semibold text-white/50 tracking-wide uppercase">
                  <span>{formatRelativeTime(v.publishedAt)}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{formatViewCount(v.viewCount)} views</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{formatDuration(v.duration)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 xl:pt-0">
                <Link to={`/dashboard/videos/${v.id}/edit`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl font-medium border border-white/10 hover:border-white/30 text-xs text-white hover:bg-white/10 transition-all">
                  <Pencil size={14} /> Edit
                </Link>
                <Link to={`/dashboard/videos/${v.id}/comments`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl font-medium border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all">
                  <MessageSquare size={14} /> Comments
                </Link>
                <button
                  onClick={() => void copyVideoLink(v.id)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl font-medium border border-white/10 hover:border-white/30 text-xs text-white hover:bg-white/10 transition-all"
                >
                  <Link2 size={14} /> Copy link
                </button>
                <button
                  onClick={() => void shareVideo(v.id, v.title)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl font-medium border border-white/10 hover:border-white/30 text-xs text-white hover:bg-white/10 transition-all"
                >
                  <Share2 size={14} /> Share
                </button>
                <button
                  onClick={() => void removeVideo(v.id)}
                  disabled={workingId === v.id}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl font-medium border border-red-500/30 text-xs text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
          {filteredVideos.length === 0 && <div className="px-8 py-10 text-center text-sm font-medium text-white/40">No videos uploaded in this channel yet.</div>}
        </div>
      </div>
    </div>
  );
}
