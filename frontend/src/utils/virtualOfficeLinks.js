export const AURICWELL_OFFICE_ORIGIN = 'https://auricwell.com';

export function virtualOfficeGuestUrl(slug, origin = AURICWELL_OFFICE_ORIGIN) {
  if (!slug) return '';
  return `${String(origin || AURICWELL_OFFICE_ORIGIN).replace(/\/$/, '')}/join/my-room/${encodeURIComponent(slug)}`;
}
