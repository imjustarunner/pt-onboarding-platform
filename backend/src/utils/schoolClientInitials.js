/**
 * School client initials: first 3 letters of first name + first 3 letters of last name, uppercase.
 * Example: "Harry Potter" -> "HARPOT"
 */
export function deriveSchoolClientInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';

  const take3 = (token) => String(token || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const first = take3(parts[0]);
  const lastToken = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const last = take3(lastToken);

  return `${first}${last}`;
}

export function isValidSchoolClientInitials(value) {
  return /^[A-Z]{6}$/.test(String(value || '').trim().toUpperCase());
}
