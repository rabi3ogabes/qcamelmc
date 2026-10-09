// QR code images for tickets. Rendered locally; a public QR web service is
// only a fallback if the rendering library cannot be loaded, so ticket codes
// are not sent to a third party in normal operation.

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** Storage object name for a ticket code, or null if the code is not a safe file name. */
export function qrObjectName(code: string): string | null {
  return typeof code === "string" && SAFE_NAME.test(code) ? `${code}.png` : null;
}

interface QrLib {
  toBuffer(text: string, options?: Record<string, unknown>): Promise<Uint8Array | ArrayBuffer>;
}

export interface QrDeps {
  /** e.g. () => import("npm:qrcode@1.5.4") — kept injectable because it is runtime specific. */
  loadLib: () => Promise<unknown>;
  fetch: typeof fetch;
}

const toBytes = (data: Uint8Array | ArrayBuffer): Uint8Array =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

export function makeQrGenerator(deps: QrDeps): (text: string) => Promise<Uint8Array> {
  let lib: QrLib | null | undefined;

  const library = async (): Promise<QrLib | null> => {
    if (lib !== undefined) return lib;
    try {
      const mod = (await deps.loadLib()) as { toBuffer?: QrLib["toBuffer"]; default?: QrLib };
      lib = typeof mod.toBuffer === "function" ? (mod as QrLib) : (mod.default ?? null);
    } catch {
      lib = null;
    }
    return lib;
  };

  return async (text: string) => {
    const local = await library();
    if (local) {
      try {
        return toBytes(await local.toBuffer(text, { type: "png", width: 800, margin: 2, errorCorrectionLevel: "M" }));
      } catch {
        /* fall through to the web service */
      }
    }
    try {
      const res = await deps.fetch(
        `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(text)}&format=png`,
      );
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* handled below */
    }
    throw new Error("QR generation failed");
  };
}
