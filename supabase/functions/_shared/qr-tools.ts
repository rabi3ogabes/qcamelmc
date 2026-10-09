// Shared by every function that produces ticket QR pictures.

import type { AuthDeps } from "./auth.ts";
import { qrObjectName } from "./qr.ts";
import type { QrStorage, Repo } from "./repo.ts";

export interface QrToolDeps {
  repo: Repo;
  auth: AuthDeps;
  storage: QrStorage;
  generateQr: (text: string) => Promise<Uint8Array>;
}

/**
 * Render the picture for one ticket code, store it and record its URL.
 * The code itself is never modified. Throws on any failure.
 */
export async function renderTicketQr(
  deps: Pick<QrToolDeps, "repo" | "storage" | "generateQr">,
  holder: { id: string; qr_code: string },
): Promise<string> {
  const objectName = qrObjectName(holder.qr_code);
  if (!objectName) throw new Error("not a valid ticket code");
  const url = await deps.storage.uploadPng(objectName, await deps.generateQr(holder.qr_code));
  await deps.repo.setQrImageUrl(holder.id, url);
  return url;
}
