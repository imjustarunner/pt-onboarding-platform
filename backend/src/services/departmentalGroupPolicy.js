const norm = value => String(value || '').trim().toLowerCase();
const enabled = value => [true, 1, '1'].includes(value);

export const DEPARTMENTAL_GROUPS = Object.freeze({
  payroll: { label: 'Payroll', topic: 'payroll', localPart: 'payroll' },
  billing: { label: 'Billing', topic: 'billing', localPart: 'billing' },
  credentialing: { label: 'Credentialing', topic: 'credentialing', localPart: 'credentialing' },
  support: { label: 'Support', topic: 'general', localPart: 'support' },
  // School mail is provisioned separately; this grants app visibility only.
  schools: { label: 'Schools', topic: 'general', localPart: 'schools', provision: false },
  admin: { label: 'Administration', topic: 'general', localPart: 'admin' },
  technology: { label: 'Technology', topic: 'technology', localPart: 'technology' },
  compliance: { label: 'Compliance', topic: 'general', localPart: 'compliance' },
  medical_records: { label: 'Medical Records', topic: 'general', localPart: 'medicalrecords' }
});

const aliases = { schoolreply: 'schools', school_reply: 'schools', medicalrecords: 'medical_records', records: 'medical_records', administration: 'admin', it: 'technology' };
export function normalizeDepartmentalGroupKey(value) {
  const key = norm(value);
  return Object.hasOwn(DEPARTMENTAL_GROUPS, key) ? key : aliases[key] || null;
}

/** Personal login Groups remain personal mailboxes, regardless of Google type. */
export function groupKeyForIdentity(identity) {
  if (!identity || norm(identity.kind) === 'personal' || identity.owner_user_id != null) return null;
  const identityKey = norm(identity.identity_key);
  if (/^(personal_|login_|hire_)/.test(identityKey)) return null;
  const explicit = normalizeDepartmentalGroupKey(identity.group_key || identityKey);
  if (explicit) return explicit;
  // Restrict address fallback to explicitly shared identities. A person's group
  // login must never gain departmental treatment from its local part alone.
  if (!['shared', 'support'].includes(norm(identity.kind))) return null;
  return normalizeDepartmentalGroupKey(norm(identity.from_email).split('@')[0]);
}

export function activeDepartmentalStaff(row) {
  return !!row && enabled(row.is_active) && !enabled(row.is_archived) && !enabled(row.is_demo)
    && enabled(row.membership_active) && !enabled(row.is_assistant_account)
    && ['ACTIVE_EMPLOYEE', 'ACTIVE', 'ONBOARDING'].includes(String(row.status || '').toUpperCase())
    && !['school_staff', 'client_guardian', 'client', 'athlete'].includes(norm(row.agency_role || row.role));
}

/** Permission grants, never a department title or a matching email name. */
export function departmentalGroupKeysForUser(row) {
  if (!activeDepartmentalStaff(row)) return [];
  const role = norm(row.agency_role || row.role);
  const keys = new Set(['admin', 'super_admin'].includes(role) ? Object.keys(DEPARTMENTAL_GROUPS) : []);
  if (enabled(row.has_payroll_access)) keys.add('payroll');
  if (enabled(row.has_billing_access)) keys.add('billing');
  if (enabled(row.can_manage_credentialing)) keys.add('credentialing');
  if (role === 'support') { keys.add('support'); keys.add('schools'); keys.add('technology'); }
  if (enabled(row.has_medical_records_release_access)) keys.add('medical_records');
  // Preserve inherited administrator mailboxes during transition, while making
  // a deliberate company/platform Off take effect for sensitive categories.
  if (role !== 'super_admin' && row.agencyAccess) {
    for (const [group,permission] of Object.entries({payroll:'has_payroll_access',billing:'has_billing_access',credentialing:'can_manage_credentialing',medical_records:'has_medical_records_release_access'})) {
      if (['agency_override','platform_default'].includes(row.agencyAccess.sources?.[permission]) && !row.agencyAccess.permissions?.[permission]) keys.delete(group);
    }
  }
  return [...keys];
}
