import { useEffect, useRef, useState, useCallback } from "react";
import { createStream, updateStreamStatus } from "@/lib/api";
import { Camera, MonitorUp, Mic, MicOff, Video, VideoOff, Settings, Radio, StopCircle } from "lucide-react";

export default function StreamsPage() {
  const [streamData, setStreamData] = useState<{ title: string; description: string }>({ title: "", description: "" });
  const [status, setStatus] = useState<"IDLE" | "READY" | "LIVE" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState("");
  
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [activeSource, setActiveSource] = useState<"CAMERA" | "SCREEN" | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActiveSource(null);
    setIsCameraOn(false);
    setIsMicOn(false);
  }, []);

  const enableCamera = async () => {
    try {
      stopMediaTracks();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActiveSource("CAMERA");
      setIsCameraOn(true);
      setIsMicOn(true);
      setStatus("READY");
      setErrorMessage("");
    } catch (err) {
      console.error(err);
      setStatus("ERROR");
      setErrorMessage("Please allow camera and microphone access to start streaming.");
    }
  };

  const enableScreenShare = async () => {
    try {
      stopMediaTracks();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActiveSource("SCREEN");
      setIsCameraOn(true); 
      setIsMicOn(stream.getAudioTracks().length > 0);
      setStatus("READY");
      setErrorMessage("");

      stream.getVideoTracks()[0].onended = () => {
         stopMediaTracks();
         setStatus("IDLE");
      };
    } catch (err) {
      console.error(err);
      setStatus("ERROR");
      setErrorMessage("Screen sharing was canceled or is unsupported.");
    }
  };

  const toggleVideo = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const goLive = async () => {
    if (!streamData.title.trim()) {
       setErrorMessage("A Stream Title is strictly required to go live!");
       return;
    }
    try {
       const newStream = await createStream({ title: streamData.title, description: streamData.description });
       await updateStreamStatus(newStream.id, "LIVE");
       setActiveStreamId(newStream.id);
       setStatus("LIVE");
       setErrorMessage("");
    } catch (err) {
       setStatus("ERROR");
       setErrorMessage("Failed to start the broadcast on the server.");
    }
  };

  const endStream = async () => {
    if (activeStreamId) {
       try { await updateStreamStatus(activeStreamId, "ENDED"); } catch (e) { /* ignore */ }
    }
    stopMediaTracks();
    setActiveStreamId(null);
    setStatus("IDLE");
    setStreamData({ title: "", description: "" });
  };

  useEffect(() => {
    return () => {
      stopMediaTracks();
    };
  }, [stopMediaTracks]);

  return (
    <div className="p-4 lg:p-10 max-w-7xl mx-auto animate-fade-in text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Live Studio</h1>
        <p className="text-white/50 text-sm">Configure your broadcast settings and go live natively in the browser.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
         {/* LEFT PANEL: Preview and Media Controls */}
         <div className="lg:col-span-2 space-y-4">
             <div className="group relative w-full aspect-video bg-black/80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center backdrop-blur-3xl transition-all h-[55vh] lg:h-auto">
                 {status === "LIVE" && (
                    <div className="absolute top-6 left-6 z-40 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.5)]">
                       <Radio size={16} className="animate-ping absolute opacity-70" />
                       <Radio size={16} /> ON AIR
                    </div>
                 )}
                 <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className={`w-full h-full object-contain ${(activeSource === 'CAMERA' || activeSource === 'SCREEN') ? 'opacity-100' : 'opacity-0'} transition-opacity duration-700`} 
                 />
                 {!activeSource && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 space-y-6 z-10 p-8 text-center bg-gradient-to-t from-black/80 to-transparent">
                        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-2 shadow-inner border border-white/10">
                            <Camera size={40} className="opacity-50" />
                        </div>
                        <p className="text-base font-semibold uppercase tracking-widest text-white/40">Offline</p>
                        <p className="text-sm">Select 'Web Camera' or 'Share Screen' below to initialize preview.</p>
                     </div>
                 )}
             </div>

             <div className="bg-white/5 backdrop-blur-xl p-4 md:p-6 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                 <div className="flex flex-wrap justify-center md:justify-start gap-3 w-full md:w-auto">
                     <button onClick={enableCamera} disabled={status === "LIVE"} className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${activeSource === "CAMERA" ? "bg-white text-black ring-4 ring-white/20" : "bg-white/10 hover:bg-white/20"}`}>
                        <Camera size={18} /> Web Camera
                     </button>
                     <button onClick={enableScreenShare} disabled={status === "LIVE"} className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${activeSource === "SCREEN" ? "bg-blue-600 text-white ring-4 ring-blue-600/30" : "bg-white/10 hover:bg-white/20 hover:text-blue-400"}`}>
                        <MonitorUp size={18} /> Share Screen
                     </button>
                 </div>
                 
                 {activeSource && (
                     <div className="flex bg-black/60 rounded-2xl p-1.5 border border-white/10 w-full md:w-auto justify-center">
                         <button onClick={toggleVideo} className={`flex-1 md:flex-none p-3 px-6 md:px-3 rounded-xl transition-all flex justify-center items-center ${!isCameraOn ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "hover:bg-white/10 text-white/80 hover:text-white"}`}>
                             {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                         </button>
                         <div className="w-[1px] bg-white/10 mx-1"></div>
                         <button onClick={toggleAudio} className={`flex-1 md:flex-none p-3 px-6 md:px-3 rounded-xl transition-all flex justify-center items-center ${!isMicOn ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "hover:bg-white/10 text-white/80 hover:text-white"}`}>
                             {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                         </button>
                     </div>
                 )}
             </div>
         </div>

         {/* RIGHT PANEL: Stream Details */}
         <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-3xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col h-full">
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />
                
                <div className="flex items-center gap-3 pb-6 border-b border-white/10 relative z-10">
                    <div className="p-2 bg-white/10 rounded-lg">
                        <Settings size={18} className="text-white" />
                    </div>
                    <h2 className="font-bold text-xl text-white">Broadcast Tools</h2>
                </div>
                
                <div className="flex-1 space-y-6 mt-6 relative z-10">
                    {errorMessage && (
                        <div className="px-5 py-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl font-medium flex items-start gap-3 shadow-inner">
                            <span className="flex-shrink-0 bg-red-500/20 rounded-full w-5 h-5 flex items-center justify-center font-bold">!</span>
                            <p>{errorMessage}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="group">
                            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2 group-focus-within:text-blue-400 transition-colors">Stream Title</label>
                            <input 
                                value={streamData.title}
                                onChange={e => setStreamData(s => ({ ...s, title: e.target.value }))}
                                disabled={status === "LIVE"}
                                placeholder="Catchy title for the viewers!"
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 transition-all shadow-inner"
                            />
                        </div>
                        <div className="group">
                            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2 group-focus-within:text-blue-400 transition-colors">Description</label>
                            <textarea 
                                value={streamData.description}
                                onChange={e => setStreamData(s => ({ ...s, description: e.target.value }))}
                                disabled={status === "LIVE"}
                                placeholder="Tell us what this broadcast is about..."
                                rows={5}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 transition-all shadow-inner"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-white/10 mt-6 relative z-10">
                    {status === "LIVE" ? (
                        <button onClick={endStream} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-all active:scale-95 text-base">
                            <StopCircle size={22} /> End Broadcast Safely
                        </button>
                    ) : (
                        <button 
                            onClick={goLive}
                            disabled={status !== "READY" || !streamData.title.trim()} 
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:border-white/10 disabled:text-white/30 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(37,99,235,0.4)] disabled:shadow-none transition-all active:scale-95 border border-transparent text-base relative overflow-hidden group/btn"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-150%] skew-x-[-15deg] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                            <Radio size={22} /> Go Live Instantly
                        </button>
                    )}
                </div>
            </div>
         </div>
      </div>
    </div>
  );
}