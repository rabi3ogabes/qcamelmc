/** Secure UUID fallback for browsers without randomUUID; never use Math.random. */
export function secureUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void | Promise<void> };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

export function fullscreenActive(doc: Document = document): boolean {
  return !!(doc.fullscreenElement || (doc as FullscreenDocument).webkitFullscreenElement);
}

export async function toggleBrowserFullscreen(doc: Document = document): Promise<void> {
  const compat = doc as FullscreenDocument;
  if (fullscreenActive(doc)) {
    const exit = doc.exitFullscreen ?? compat.webkitExitFullscreen;
    if (!exit) throw new Error("Fullscreen unavailable");
    await exit.call(doc);
  } else {
    const element = doc.documentElement as FullscreenElement;
    const enter = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!enter) throw new Error("Fullscreen unavailable");
    await enter.call(element);
  }
}