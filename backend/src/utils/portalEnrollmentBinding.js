import crypto from 'node:crypto';

const email = value => String(value || '').trim().toLowerCase();
const dataOf = value => typeof value === 'string' ? JSON.parse(value) : value;

// This context is issued by the authenticated portal, never by a public form.
export function preservePortalEnrollmentBinding(previous, incoming, issued = null) {
  const next = { ...(dataOf(incoming) || {}) };
  delete next.portalEnrollment;
  const binding = issued || dataOf(previous)?.portalEnrollment;
  if (binding) next.portalEnrollment = { ...binding };
  return next;
}

export function assertPortalEnrollmentIdentity(submission, payload, sessionToken) {
  const binding = dataOf(submission?.intake_data)?.portalEnrollment;
  if (!binding) return;
  const expected = Buffer.from(String(submission.session_token || ''));
  const actual = Buffer.from(String(sessionToken || ''));
  if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw Object.assign(new Error('Open your saved enrollment link to continue.'), { status: 403 });
  }
  for (const value of [payload?.guardian?.email, payload?.intakeData?.guardian?.email, payload?.signerEmail]) {
    if (value !== undefined && email(value) !== email(binding.email)) {
      throw Object.assign(new Error('Use the email for the account that started this enrollment. Update your account settings first if your email has changed.'), { status: 409 });
    }
  }
}

export function enrollmentRelationship(payload, priorLink = null) {
  // Keep explicit restrictions and existing relationship types on a repeat submission.
  if (priorLink) return priorLink.relationship_type || 'guardian';
  return payload?.intakeForSelf === true || payload?.intakeData?.intakeForSelf === true
    || String(payload?.guardian?.relationship || '').trim().toLowerCase() === 'self'
    ? 'self' : 'guardian';
}
