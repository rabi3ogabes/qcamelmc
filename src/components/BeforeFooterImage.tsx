import { useEffect, useState } from "react";

/**
 * Pre-footer image: rendered at its natural size (no stretching or cropping)
 * and tiled horizontally across the full row width.
 */
export const BeforeFooterImage = ({ src, alt }: { src: string; alt: string }) => {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!dims) return null;

  return (
    <div
      role="img"
      aria-label={alt}
      className="public-pre-footer w-full"
      style={{
        backgroundImage: `url(${src})`,
        height: `${dims.h}px`,
      }}
    />
  );
};
