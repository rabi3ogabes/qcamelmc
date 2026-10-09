import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrImageProps {
  /** The ticket code the gate scanner reads. */
  code: string;
  /** A stored picture of that code, if one exists. */
  imageUrl?: string | null;
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * A scannable QR for a ticket. Uses the stored picture when there is one and
 * quietly falls back to drawing the code in the browser, so a ticket always
 * shows a working QR even if its image is missing or fails to load.
 */
export function QrImage({ code, imageUrl, size = 200, alt, className }: QrImageProps) {
  const [broken, setBroken] = useState(false);
  const [drawn, setDrawn] = useState<string | null>(null);
  const useStored = Boolean(imageUrl) && !broken;

  useEffect(() => {
    if (useStored) return;
    let active = true;
    QRCode.toDataURL(code, { width: size * 2, margin: 2 })
      .then((url) => active && setDrawn(url))
      .catch(() => active && setDrawn(null));
    return () => {
      active = false;
    };
  }, [code, size, useStored]);

  const src = useStored ? imageUrl! : drawn;
  if (!src) {
    return <div className={className} style={{ width: size, height: size }} aria-busy="true" />;
  }
  return (
    <img
      src={src}
      alt={alt ?? `QR ${code}`}
      width={size}
      height={size}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
