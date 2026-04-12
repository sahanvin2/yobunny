import { ImgHTMLAttributes, useEffect, useMemo, useRef, useState } from "react";

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
  srcSet?: string;
  sizes?: string;
};

const BLANK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23111111'/%3E%3C/svg%3E";

export default function SmartImage({ priority = false, src, srcSet, sizes, width, height, className, style, loading, decoding, fetchPriority, ...rest }: SmartImageProps) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [inView, setInView] = useState(priority);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (priority || inView) return;
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView, priority]);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const mergedStyle = useMemo(() => {
    const nextStyle = { ...(style || {}) } as Record<string, string | number>;
    if (width && height && !nextStyle.aspectRatio) {
      nextStyle.aspectRatio = `${width}/${height}`;
    }
    if (!nextStyle.display) {
      nextStyle.display = "block";
    }
    return nextStyle;
  }, [height, style, width]);

  return (
    <img
      ref={ref}
      src={inView && src ? src : BLANK_SVG}
      srcSet={inView ? srcSet : undefined}
      sizes={inView ? sizes : undefined}
      width={width}
      height={height}
      className={`${className || ""} ${loaded || priority ? "" : "blur-sm"}`.trim()}
      style={mergedStyle}
      loading={priority ? "eager" : (loading || "lazy")}
      decoding={decoding || "async"}
      fetchPriority={priority ? "high" : (fetchPriority || "auto")}
      onLoad={(event) => {
        setLoaded(true);
        if (typeof rest.onLoad === "function") {
          rest.onLoad(event);
        }
      }}
      {...rest}
    />
  );
}
