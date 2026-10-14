// Shared by the contact form and server completion checks. Drafts may remain incomplete.
export function isValidPersonalEmail(value) {
  return typeof value === 'string' && value.trim().length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
