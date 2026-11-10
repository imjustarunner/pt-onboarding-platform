export function savedInsuranceCard(preview, slot) {
  const match = typeof preview === 'string' && preview.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 7 * 1024 * 1024) return null;
  try {
    const raw = atob(match[2]);
    if (!raw.length || raw.length > 5 * 1024 * 1024) return null;
    return new File([Uint8Array.from(raw, ch => ch.charCodeAt(0))], `${slot}.${match[1] === 'image/png' ? 'png' : 'jpg'}`, { type: match[1] });
  } catch { return null; }
}
