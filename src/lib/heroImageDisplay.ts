export type HeroImagePosition = "top" | "center" | "bottom";

export function heroImageDisplay(position?: unknown, height?: unknown) {
  const resolvedPosition: HeroImagePosition = position === "top" || position === "bottom" ? position : "center";
  const resolvedHeight = typeof height === "number" && Number.isFinite(height)
    ? Math.round(Math.min(800, Math.max(300, height))) : 600;
  return { position: resolvedPosition, height: resolvedHeight };
}