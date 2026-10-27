// Staff directory numbers belong to the selected organization, not the user's
// personal or separately assigned calling/SMS line.
const STAFF_MAIN_PHONES = Object.freeze({ itsco: '719-657-7444', nlu: '719-377-6577' });

export function staffWorkPhone(agency, individualWorkPhone) {
  const slug = String(agency?.slug || '').trim().toLowerCase();
  return STAFF_MAIN_PHONES[slug] || individualWorkPhone || agency?.phone_number || null;
}

// Store only the extension value. Normalize legacy labels at read boundaries too
// so callers can safely add their own single localized label.
export function normalizePhoneExtension(value) {
  return String(value ?? '').trim().replace(/^(?:(?:extension|ext\.?|x)\s*[:.#-]?\s*)+/i, '').trim() || null;
}
