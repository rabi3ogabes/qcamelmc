import { useEffect, useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { preFooterDisplay } from "@/lib/preFooterDisplay";

/**
 * Pre-footer image: rendered at its natural size (no stretching or cropping)
 * with dashboard-controlled repetition and opacity.
 */
export const BeforeFooterImage = ({ src, alt }: { src: string; alt: string }) => {
  const { settings } = useSettings();
  const display = preFooterDisplay(settings?.before_footer_image_repeat, settings?.before_footer_image_opacity);
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
        backgroundRepeat: display.repeat,
        backgroundSize: `${dims.w}px ${dims.h}px`,
        opacity: display.opacity,
        height: `${dims.h * (display.repeat === "repeat-y" ? 2 : 1)}px`,
      }}
    />
  );
};
