import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";

type HlsVideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
};

function isHlsSource(src: string) {
  return /\.m3u8($|\?)/i.test(src);
}

const HlsVideoPlayer = forwardRef<HTMLVideoElement, HlsVideoPlayerProps>(function HlsVideoPlayer(
  { src, ...props },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;

    if (isHlsSource(src)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30
        });

        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls?.loadSource(src);
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            hls?.destroy();
            hls = null;
            video.dispatchEvent(new Event("error"));
          }
        });
      } else {
        video.src = src;
      }
    } else {
      video.src = src;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return <video ref={videoRef} {...props} />;
});

export default HlsVideoPlayer;