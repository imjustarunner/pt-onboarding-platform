const fail = message => { const error = new Error(message); error.status = 400; throw error; };
export const CARD_STAFF_ROLES = ['super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant', 'supervisor', 'intern', 'intern_plus', 'facilitator', 'tutor', 'clinician', 'school_staff'];
export const canManageBusinessCards = user => ['super_admin', 'admin', 'support'].includes(String(user?.role || '').toLowerCase());
export function normalizeBusinessCardSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Invalid card template.');
  const result = { version: 1, organization: {}, print: {} };
  const source = raw.organization || {};
  const fields = { organization: 100, website: 100, phone: 50, extension: 12, address: 320, qrUrl: 300, backCaption: 80, logo: 6000000 };
  for (const [key, max] of Object.entries(fields)) {
    if (typeof source[key] !== 'string' || source[key].length > max) fail(`Invalid ${key} on card template.`);
    result.organization[key] = source[key].trim();
  }
  for (const key of ['primary', 'accent']) {
    if (!/^#[0-9a-f]{6}$/i.test(source[key] || '')) fail(`Invalid ${key} color.`);
    result.organization[key] = source[key];
  }
  for (const key of ['primaryText', 'accentText']) {
    if (!/^(auto|#[0-9a-f]{6})$/i.test(source[key] || '')) fail('Choose automatic, white, or a valid text color.');
    result.organization[key] = source[key];
  }
  if (source.logo && !/^(data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+|https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']+)$/i.test(source.logo)) fail('Invalid logo.');
  if (source.watermarkLogo !== undefined) {
    if (typeof source.watermarkLogo !== 'string' || source.watermarkLogo.length > 6000000 || (source.watermarkLogo && !/^(data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+|https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']+)$/i.test(source.watermarkLogo))) fail('Invalid watermark logo.');
    result.organization.watermarkLogo = source.watermarkLogo.trim();
  }
  if (source.logoCrop !== undefined) {
    if (typeof source.logoCrop !== 'string') fail('Invalid logo framing.');
    const parts = source.logoCrop.trim().split(/\s+/).map(Number);
    const [x,y,w,h,iw,ih] = parts;
    if (source.logoCrop && (parts.length !== 6 || parts.some(v => !Number.isFinite(v) || v < 0 || v > 10000) || !w || !h || !iw || !ih || x+w > iw || y+h > ih)) fail('Invalid logo framing.');
    result.organization.logoCrop = source.logoCrop.trim();
  }
  if (source.qrUrl) {
    let url; try { url = new URL(source.qrUrl); } catch { fail('Enter a complete website URL for the QR code.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('Use an HTTP or HTTPS QR destination without credentials.');
  }
  for (const [key, min, max, fallback] of [
    ['offsetX', -.125, .125, 0], ['offsetY', -.125, .125, 0], ['topRowOffsetY', -.125, .125, 0],
    ['backOffsetX', -.125, .125, 0], ['backOffsetY', -.125, .125, 0],
    ['bleed', 0, .125, .0625], ['bottomBleed', 0, .125, .0625]
  ]) {
    const value = raw.print?.[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`Invalid ${key} print adjustment.`);
    result.print[key] = value;
  }
  const p = result.print;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) for (const back of [false, true]) {
    const frontX = .25 + col * 2.75 + p.offsetX;
    const x = back ? 8.5 - frontX - 2.5 + p.backOffsetX : frontX;
    const y = .875 + row * 3.375 + p.offsetY + (row === 0 ? p.topRowOffsetY : 0) + (back ? p.backOffsetY : 0);
    if (x - p.bleed < 0 || x + 2.5 + p.bleed > 8.5 || y - p.bleed < 0 || y + 2.5 + p.bottomBleed > 11) fail('Combined print adjustments extend beyond the Letter page.');
  }
  return result;
}
