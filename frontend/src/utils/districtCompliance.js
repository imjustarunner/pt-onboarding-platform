/** Client-side District 11 label matching (mirrors backend/src/utils/districtCompliance.js). */

export const D11_BACKGROUND_EXPIRATION_YEARS = 3;

export const D11_SECURITY_OFFICE = {
  hours: 'Monday through Friday, 8:00am–4:00pm',
  address: '1104 North Franklin Street, Colorado Springs, CO 80903',
  addressLabel: 'Security Office Address',
};

export function normalizeDistrictName(districtName) {
  return String(districtName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDistrict11Name(districtName) {
  const n = normalizeDistrictName(districtName);
  if (!n) return false;
  if (/\bdistrict\s*12\b/.test(n) || /\bd12\b/.test(n)) return false;
  if (/\bdps\b/.test(n) || /\bdenver\s+public\s+schools?\b/.test(n)) return false;
  if (/\bdistrict\s*11\b/.test(n)) return true;
  if (/\bd11\b/.test(n)) return true;
  if (/^(csd|cs|school)?\s*11$/.test(n)) return true;
  return false;
}
