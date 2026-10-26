// An explicit staff number overrides the school's current main number. Do not
// copy the default into the user record or fall back to a private phone number.
export function schoolStaffPhone(staff = {}, school = {}) {
  return String(staff.phone_number || '').trim()
    || String(school.phone_number || '').trim()
    || null;
}

export function parseSchoolStaffPhone(value) {
  if (value === undefined) return undefined;
  if (value !== null && typeof value !== 'string') {
    const error = new Error('Phone number must be text.');
    error.status = error.statusCode = 400;
    throw error;
  }
  const phone = String(value || '').trim();
  if (phone.length > 20) {
    const error = new Error('Phone number must be 20 characters or fewer.');
    error.status = error.statusCode = 400;
    throw error;
  }
  return phone || null;
}
