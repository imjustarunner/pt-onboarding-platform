/**
 * Strip non-digits for tel: links and NANP grouping.
 * @param {string|null|undefined} raw
 * @returns {string} digits only
 */
export function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Format a US-style phone for display. Returns plain string; extension shown separately.
 * @param {string|null|undefined} phone
 * @param {string|null|undefined} extension
 * @returns {{ display: string, telHref: string }}
 */
export function formatPhoneForDisplay(phone, extension) {
  const d = digitsOnly(phone);
  const ext = String(extension || '').trim().replace(/\D/g, '');

  let display = String(phone || '').trim();
  if (d.length === 10) {
    display = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  } else if (d.length === 11 && d.startsWith('1')) {
    display = `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  } else if (d.length >= 7 && d.length !== 10) {
    // Long toll-free or international-ish: group in threes for readability
    display = d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  }

  if (ext) {
    display = `${display} ext. ${ext}`;
  }

  const telCore = d.length === 11 && d.startsWith('1') ? d : d.length === 10 ? `1${d}` : d;
  const telHref = telCore ? `tel:+${telCore}${ext ? `;ext=${ext}` : ''}` : '';

  return { display, telHref };
}
