export type ImageRepeat = "repeat-x" | "repeat-y";

export function preFooterDisplay(repeat: unknown, opacity: unknown) {
  return {
    repeat: (repeat === "repeat-y" ? "repeat-y" : "repeat-x") as ImageRepeat,
    opacity: typeof opacity === "number" && Number.isFinite(opacity)
      ? Math.min(100, Math.max(0, opacity)) / 100
      : 1,
  };
}