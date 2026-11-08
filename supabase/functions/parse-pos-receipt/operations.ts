export function receiptTicketPatch(field: unknown, value: unknown) {
  if (field === 'amount_qar') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error('Invalid receipt amount');
    return { amount_qar: Math.round(value * 100) / 100 };
  }
  if (field !== 'normal_tickets' && field !== 'vip_tickets' && field !== 'parking_tickets') throw new Error('Invalid ticket type');
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error('Invalid ticket quantity');
  return { [field]: value };
}

export function receiptImage(imageBase64: unknown) {
  if (typeof imageBase64 !== 'string' || imageBase64.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) throw new Error('Invalid image');
  const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('Use a JPG, PNG or WebP photo');
  return { bytes, mime: jpeg ? 'image/jpeg' : png ? 'image/png' : 'image/webp', ext: jpeg ? 'jpg' : png ? 'png' : 'webp' };
}