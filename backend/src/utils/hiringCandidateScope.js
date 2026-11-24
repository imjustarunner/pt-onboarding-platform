// Account setup is shared by employees, guardians, clients and school contacts.
// It is not, by itself, evidence that somebody entered a hiring workflow.
export const HIRING_WORKFORCE_ROLES = [
  'super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider',
  'provider_plus', 'clinical_practice_assistant', 'schedule_manager', 'intern',
  'intern_plus', 'supervisor', 'facilitator', 'clinician', 'employee', 'assistant'
];
export const isHiringWorkforceRole = role => HIRING_WORKFORCE_ROLES.includes(String(role || '').toLowerCase());
const LEGACY_WORKFORCE_STATUSES = ['PROSPECTIVE', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING'];
const workforceSql = user => `LOWER(COALESCE(${user}.role, '')) IN (${HIRING_WORKFORCE_ROLES.map(role => `'${role}'`).join(',')})`;
const soleMembershipSql = (user, agency) => `NOT EXISTS (
  SELECT 1 FROM user_agencies hiring_other_membership
  JOIN agencies hiring_other_company ON hiring_other_company.id = hiring_other_membership.agency_id
  WHERE hiring_other_membership.user_id = ${user}.id AND hiring_other_membership.agency_id <> ${agency}
    AND LOWER(COALESCE(hiring_other_company.organization_type, 'agency')) <> 'school'
)`;
const journeySql = (user, agency) => `EXISTS (
  SELECT 1 FROM hire_journeys hiring_agency_journey
  WHERE hiring_agency_journey.user_id = ${user}.id AND hiring_agency_journey.agency_id = ${agency}
)`;

// These identifiers are fixed by callers, never taken from request parameters.
export function hiringProfileJoinSql({ user = 'u', agency = 'ua.agency_id', profile = 'hp' } = {}) {
  return `LEFT JOIN hiring_profiles ${profile} ON ${profile}.id = (
    SELECT hiring_scoped_profile.id FROM hiring_profiles hiring_scoped_profile
    WHERE hiring_scoped_profile.candidate_user_id = ${user}.id AND (
      EXISTS (SELECT 1 FROM hiring_job_descriptions hiring_scoped_job
        WHERE hiring_scoped_job.id = hiring_scoped_profile.job_description_id AND hiring_scoped_job.agency_id = ${agency})
      OR (hiring_scoped_profile.job_description_id IS NULL AND (
        ${journeySql(user, agency)} OR ${soleMembershipSql(user, agency)}
      ))
    ) ORDER BY hiring_scoped_profile.updated_at DESC, hiring_scoped_profile.id DESC LIMIT 1
  )`;
}

export function hiringCandidateScopeSql({ user = 'u', agency = 'ua.agency_id', profile = 'hp' } = {}) {
  return `(${profile}.id IS NOT NULL OR ${journeySql(user, agency)} OR (
    ${workforceSql(user)} AND (${user}.hired_at IS NOT NULL OR ${user}.status IN (${LEGACY_WORKFORCE_STATUSES.map(status => `'${status}'`).join(',')}))
    AND ${soleMembershipSql(user, agency)}
    AND NOT EXISTS (SELECT 1 FROM hiring_profiles hiring_any_profile WHERE hiring_any_profile.candidate_user_id = ${user}.id)
    AND NOT EXISTS (SELECT 1 FROM hire_journeys hiring_any_journey WHERE hiring_any_journey.user_id = ${user}.id)
  ))`;
}

// A guardian who really applies can have both clinical and hiring documents.
// Only explicitly assigned hiring documents contribute to that person's HR count.
export function hiringDocumentScopeSql({ user = 'u', task = 't' } = {}) {
  return `(${workforceSql(user)}
    OR JSON_UNQUOTE(JSON_EXTRACT(${task}.metadata, '$.portalPhase')) IN ('pre_hire', 'onboarding')
    OR JSON_UNQUOTE(JSON_EXTRACT(${task}.metadata, '$.autoFromSendPreHire')) = 'true'
    OR JSON_UNQUOTE(JSON_EXTRACT(${task}.metadata, '$.contractGeneration')) = 'true')`;
}
