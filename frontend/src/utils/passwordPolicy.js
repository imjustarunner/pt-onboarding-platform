export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Client-side password checks (server enforces the same rules).
 * @returns {{ valid: boolean, message?: string }}
 */
export function checkPasswordBasics(password) {
  const value = String(password || '');
  if (!value) {
    return { valid: false, message: 'Password is required' };
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, message: `Password must be no more than ${MAX_PASSWORD_LENGTH} characters` };
  }
  if (!/[a-zA-Z]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one letter (a–z or A–Z)' };
  }
  if (!/[0-9]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one number (0–9)' };
  }
  return { valid: true };
}
