// Tenant and cohort controls are server-owned. A request body cannot enroll a
// tenant or provider; an explicit provider choice is still required afterward.
export const SCHOOL_CONTACT_DEMO_AGENCY_ID = 450;
export const SCHOOL_CONTACT_ITSCO_AGENCY_ID = 2;
export const SCHOOL_CONTACT_TEST_INBOX = 'testing@itsco.health';
export const SCHOOL_CONTACT_AGENCY_IDS = [SCHOOL_CONTACT_DEMO_AGENCY_ID, SCHOOL_CONTACT_ITSCO_AGENCY_ID];
const on = value => [true, 1, '1'].includes(value);
const flags = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const active = agency => on(agency?.is_active) && !on(agency?.is_archived);
export function isSchoolContactDemoAgency(agency) {
  return Number(agency?.id) === SCHOOL_CONTACT_DEMO_AGENCY_ID && agency?.slug === 'auricwell-qa-demo' && active(agency);
}
export function schoolContactPilotProviderIds(agency) {
  const pilot = flags(agency?.feature_flags).schoolContactPlanPilot;
  return pilot?.enabled === true && Array.isArray(pilot.providerIds)
    ? [...new Set(pilot.providerIds.filter(id => Number.isSafeInteger(id) && id > 0))] : [];
}
export function isSchoolContactAgencyEnabled(agency) {
  return isSchoolContactDemoAgency(agency) || (Number(agency?.id) === SCHOOL_CONTACT_ITSCO_AGENCY_ID
    && agency?.slug === 'itsco' && active(agency) && schoolContactPilotProviderIds(agency).length > 0);
}
export function isSchoolContactProviderEnabled(agency, userId) {
  return isSchoolContactDemoAgency(agency) || (isSchoolContactAgencyEnabled(agency) && schoolContactPilotProviderIds(agency).includes(Number(userId)));
}
// Internal aliases only, never user input. Apply the same cohort and acknowledged
// setup boundary when discovering new assignments and resuming existing work.
export function schoolContactScopeSql(agency = 'pilot', provider = 'p.provider_user_id', plan = 'p') {
  return `(${agency}.is_active=1 AND COALESCE(${agency}.is_archived,0)=0 AND (
    (${agency}.id=450 AND ${agency}.slug='auricwell-qa-demo') OR
    (${agency}.id=2 AND ${agency}.slug='itsco'
      AND JSON_EXTRACT(${agency}.feature_flags,'$.schoolContactPlanPilot.enabled')=CAST('true' AS JSON)
      AND JSON_CONTAINS(COALESCE(JSON_EXTRACT(${agency}.feature_flags,'$.schoolContactPlanPilot.providerIds'),JSON_ARRAY()),CAST(${provider} AS JSON))=1
      AND ${plan}.welcome_seen_at IS NOT NULL)))`;
}
export function schoolContactDelivery(agencyId, { to, cc = null, bcc = null }) {
  if (Number(agencyId) === SCHOOL_CONTACT_DEMO_AGENCY_ID) return { to: SCHOOL_CONTACT_TEST_INBOX, cc: cc ? SCHOOL_CONTACT_TEST_INBOX : null, bcc: bcc ? SCHOOL_CONTACT_TEST_INBOX : null };
  if (Number(agencyId) !== SCHOOL_CONTACT_ITSCO_AGENCY_ID) throw Object.assign(new Error('Family Welcome is unavailable for this agency.'), { status: 403 });
  return { to, cc, bcc };
}
