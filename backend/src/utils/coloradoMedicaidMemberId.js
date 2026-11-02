// Health First Colorado IDs contain one letter and six digits. Only correct the
// unambiguous leading OCR zero; other insurers and stored policies stay untouched.
// Source: https://hcpf.colorado.gov/member-communications-standards
export function coloradoMedicaidOcrMemberId(value, context = '') {
  const raw = String(value || '').trim();
  const colorado = /health\s*first\s*colorado|colorado\s+(?:access|medicaid)|\bSKCO[O0]\b/i.test(String(context));
  return colorado && /^0\d{6}$/.test(raw) ? `O${raw.slice(1)}` : raw;
}
