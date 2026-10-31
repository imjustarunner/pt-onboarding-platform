export function validSchoolGroupEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/** Setup must persist the school's shared communication address, not only a
 * preferred value in a completed-step payload. No Google membership is implied. */
export function requireSchoolGroupEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!validSchoolGroupEmail(email)) throw Object.assign(new Error('Set a valid school group email in School information before completing setup. It is required for school schedule and cancellation notices.'), { status: 400, code: 'SCHOOL_GROUP_EMAIL_REQUIRED' });
  return email;
}
