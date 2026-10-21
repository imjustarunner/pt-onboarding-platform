// School intake records a guardian account and consent choices. Staff decide
// when to invite; families may also explicitly request optional password setup.
export function deferSchoolGuardianInvitation(record = {}) {
  return String(record.scope_type || '').toLowerCase() === 'school'
    || String(record.organization_type || '').toLowerCase() === 'school'
    || String(record.client_type || '').toLowerCase() === 'school'
    || Number(record.is_school_master || 0) === 1
    || Number(record.inherits_school_master || 0) === 1;
}

// Account creation and automatic invitations are independent rollout choices.
export function deferGuardianInvitation(record={}) {
  return process.env.GUARDIAN_PORTAL_INVITATIONS_ENABLED !== 'true' || deferSchoolGuardianInvitation(record);
}
