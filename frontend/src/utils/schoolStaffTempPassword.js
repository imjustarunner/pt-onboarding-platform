const STOP_WORDS = new Set(['school', 'schools', 'of', 'the', 'and', '&']);

export const SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS = 24 * 7;

export function schoolInitials(schoolName) {
  const tokens = String(schoolName || '')
    .replace(/[''`]/g, '')
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token.toLowerCase()));

  if (!tokens.length) return 'SCH';
  return tokens
    .slice(0, 3)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

export function extractAddressNumber(address) {
  const match = String(address || '').match(/\d+/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0');
}

export function extractSchoolNumberSuffix(schoolNumber) {
  const digits = String(schoolNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0');
}

export function resolvePasswordYear(academicYear) {
  const match = String(academicYear || '').match(/(20\d{2})/);
  if (match) return match[1];
  return String(new Date().getFullYear());
}

function randomSeparator() {
  const options = ['', '-', '_'];
  return options[Math.floor(Math.random() * options.length)];
}

function randomDigits(min = 2, max = 3) {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function randomSpecialChar() {
  const options = ['#', '$', '%', '*', '&'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Build a memorable shared staff temp password from school context.
 * Uses initials + year + random digits + suffix + one special character.
 * Each click of autogenerate should call this again for fresh randomness.
 */
export function generateStaffTempPassword({
  schoolName = '',
  schoolAddress = '',
  schoolNumber = '',
  academicYear = ''
} = {}) {
  const initials = schoolInitials(schoolName);
  const year = resolvePasswordYear(academicYear);
  const suffix =
    extractSchoolNumberSuffix(schoolNumber) || extractAddressNumber(schoolAddress) || '0000';
  const sep = randomSeparator();
  const useLower = Math.random() < 0.5;
  const head = useLower ? initials.toLowerCase() : initials;
  const entropy = randomDigits(2, 3);
  const special = randomSpecialChar();
  return `${head}${sep}${year}${entropy}${suffix}${special}`;
}

export function formatStaffTempPasswordExpiry(hours = SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS) {
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0 && remainingHours > 0) {
    return `${days} day${days === 1 ? '' : 's'} (${hours} hours)`;
  }
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
