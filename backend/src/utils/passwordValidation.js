/**
 * Shared password validation — enforces the financial-data / payments API credential policy.
 *
 * Rules enforced here (complementing DB-level and rate-limit checks):
 *  - Min 6 / max 128 characters
 *  - Must contain at least one letter (a-z / A-Z)
 *  - Must not be a commonly used / dictionary password (zxcvbn score 0 or 1)
 *  - Must not contain the user's account ID as a substring (including basic leet-speak)
 *
 * Returns { valid: true } or { valid: false, message: string }.
 */

let _zxcvbn = null;
async function getZxcvbn() {
  if (!_zxcvbn) {
    const mod = await import('zxcvbn');
    _zxcvbn = mod.default || mod;
  }
  return _zxcvbn;
}

/** Normalize a string by replacing common leet-speak substitutions with their base letter. */
function normalizeLeet(str) {
  return String(str)
    .toLowerCase()
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/\|/g, 'i')
    .replace(/7/g, 't');
}

/**
 * @param {string} password
 * @param {object} [options]
 * @param {string} [options.accountId]  Username / email of the account (for similarity check)
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
export async function validatePasswordStrength(password, { accountId } = {}) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }

  if (password.length > 128) {
    return { valid: false, message: 'Password must be no more than 128 characters' };
  }

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter (a–z or A–Z)' };
  }

  // Account ID similarity check (substring after leet normalization)
  if (accountId && typeof accountId === 'string') {
    const normalizedPassword = normalizeLeet(password);
    // Strip domain from email for the check (e.g. fred@example.com → fred)
    const localPart = accountId.split('@')[0];
    const normalizedAccount = normalizeLeet(localPart);
    if (normalizedAccount.length >= 3 && normalizedPassword.includes(normalizedAccount)) {
      return { valid: false, message: 'Password must not contain your username or account ID' };
    }
  }

  // Dictionary / common-password check via zxcvbn
  try {
    const zxcvbn = await getZxcvbn();
    const inputs = accountId ? [accountId.split('@')[0]] : [];
    const result = zxcvbn(password, inputs);
    if (result.score <= 1) {
      const suggestion =
        result.feedback?.suggestions?.[0] ||
        result.feedback?.warning ||
        'Try a longer or less common password';
      return {
        valid: false,
        message: `Password is too common or easily guessed. ${suggestion}`
      };
    }
  } catch {
    // If zxcvbn fails for any reason, do not block the user — log and continue
    console.warn('[passwordValidation] zxcvbn check failed, skipping dictionary check');
  }

  return { valid: true };
}
