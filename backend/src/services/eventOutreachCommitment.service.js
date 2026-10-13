import pool from '../config/database.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';

const json = (value) => {
  try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch { return {}; }
};
const round = (n) => Math.round(n * 10000) / 10000;

/** Read only the explicit annual event clause in the employee's signed snapshot.
 * Unknown wording is deliberately not inferred from a current handbook/template.
 */
export function readSignedAnnualEventTerms(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const annual = text.match(/minimum of\s+(?:[a-z]+\s*\()?([0-9]+(?:\.[0-9]+)?)\)?\s+hours of assigned outreach or agency events during each calendar year/i);
  if (!annual) return null;
  const annualHours = Number(annual[1]);
  if (!(annualHours > 0 && annualHours <= 8760)) return null;
  const school = text.match(/while school[- ]assigned,?\s+the annual commitment is\s+(?:[a-z]+\s*\()?([0-9]+(?:\.[0-9]+)?)\)?\s+hours total/i);
  const schoolRelated = text.match(/including\s+(?:[a-z]+\s*\()?([0-9]+(?:\.[0-9]+)?)\)?\s+additional hours for school[- ]related events/i);
  return { annualHours, schoolAssignedAnnualHours: school ? Number(school[1]) : null,
    schoolRelatedHours: school && schoolRelated ? Number(schoolRelated[1]) : null };
}

export function summarizeOutreachCommitment({ document, claims = [], calendarYear, asOfDate, timezone = 'America/Denver', creditStartDate = null }) {
  if (!document?.signed_at || !document.signed_pdf_path || !document.pdf_hash || document.task_status !== 'completed') return null;
  const terms = readSignedAnnualEventTerms(document.rendered_html);
  if (!terms) return null;
  // signed_documents.signed_at may be the earlier e-sign consent timestamp.
  const signedDate = utcDateToZonedYmd(json(document.audit_trail).signedAt || document.completed_at || document.signed_at, timezone);
  if (!signedDate) return null;
  const meta = json(document.task_metadata);
  const tokens = json(document.token_values_json);
  const rawEffective = meta.effectiveDate || tokens.EFFECTIVE_DATE;
  const parsedEffective = rawEffective ? new Date(String(rawEffective)) : null;
  const effective = /^\d{4}-\d{2}-\d{2}$/.test(String(rawEffective || ''))
    ? String(rawEffective) : (parsedEffective && Number.isFinite(parsedEffective.getTime()) ? parsedEffective.toISOString().slice(0, 10) : signedDate);
  const effectiveDate = [signedDate, effective, `${calendarYear}-01-01`].sort().at(-1);
  if (effectiveDate > asOfDate || effectiveDate > `${calendarYear}-12-31`) return null;
  const creditFrom = creditStartDate && creditStartDate < effectiveDate
    ? [creditStartDate, `${calendarYear}-01-01`].sort().at(-1) : effectiveDate;
  const requiredHours = Number(document.school_assigned) === 1 && terms.schoolAssignedAnnualHours != null
    ? terms.schoolAssignedAnnualHours : terms.annualHours;
  const requiredSchoolHours = Number(document.school_assigned) === 1 ? (terms.schoolRelatedHours || 0) : 0;
  if (!(requiredHours > 0 && requiredHours <= 8760)) return null;
  if (requiredSchoolHours < 0 || requiredSchoolHours > requiredHours) return null;
  // Only approved actual event time contributes. RSVP/assignment and travel are not attendance.
  // Split direct/indirect siblings each store their own hours; never sum duplicated workedHours.
  const seen = new Set();
  let completedHours = 0;
  let completedSchoolHours = 0;
  for (const claim of claims) {
    if (claim.status !== 'approved' || seen.has(Number(claim.id))) continue;
    seen.add(Number(claim.id));
    const date = claim.claim_date instanceof Date ? claim.claim_date.toISOString().slice(0, 10) : String(claim.claim_date || '').slice(0, 10);
    if (date < creditFrom || date > asOfDate || !date.startsWith(`${calendarYear}-`)) continue;
    const payload = json(claim.payload_json);
    if (payload.eventWorkType === 'travel' || payload.source === 'company_event_travel') continue;
    const type = String(claim.event_type || '');
    if (['school_first_day', 'school_day_off', 'school_holiday'].includes(type)) continue;
    const qualifies = type.startsWith('school_') || Number(claim.outreach_table_invited) === 1
      || json(claim.staffing_config_json).countsTowardOutreachCommitment === true
      || json(claim.operations_json).countsTowardOutreachCommitment === true;
    if (!qualifies || !(Number(payload.companyEventId) > 0)) continue;
    const hours = Number(claim.credits_hours);
    if (Number.isFinite(hours) && hours > 0) {
      completedHours += hours;
      if (type.startsWith('school_')) completedSchoolHours += hours;
    }
  }
  completedHours = round(completedHours);
  completedSchoolHours = round(completedSchoolHours);
  const remainingSchoolHours = round(Math.max(0, requiredSchoolHours - completedSchoolHours));
  const remainingTotalHours = round(Math.max(0, requiredHours - completedHours));
  return { userId: Number(document.user_id), calendarYear, requiredHours, completedHours,
    requiredSchoolHours, completedSchoolHours, remainingSchoolHours, remainingTotalHours,
    remainingHours: Math.max(remainingTotalHours, remainingSchoolHours), signedDocumentId: Number(document.signed_document_id),
    effectiveDate, creditStartDate: creditFrom, schoolAssigned: Number(document.school_assigned) === 1 };
}

/** No fallback to all staff when signed evidence cannot be read. Errors propagate to caller. */
export async function listOutstandingOutreachCommitments({ agencyId, eventDate = new Date(), timezone = 'America/Denver', userIds = null, includeAudit = false, db = pool }) {
  const aid = Number(agencyId);
  if (!Number.isInteger(aid) || aid <= 0) throw Object.assign(new Error('agencyId is required'), { status: 400 });
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(eventDate)) ? String(eventDate) : utcDateToZonedYmd(eventDate, timezone);
  if (!asOfDate) throw Object.assign(new Error('A valid event date is required'), { status: 400 });
  const calendarYear = Number(asOfDate.slice(0, 4));
  const [documents] = await db.execute(
    `SELECT sd.id AS signed_document_id, sd.user_id, sd.signed_at, sd.signed_pdf_path, sd.pdf_hash, sd.audit_trail, t.completed_at,
            g.rendered_html, g.token_values_json, t.metadata AS task_metadata, t.status AS task_status,
            EXISTS (SELECT 1 FROM provider_school_assignments psa
                    WHERE psa.provider_user_id = sd.user_id AND psa.is_active = 1
                      AND (EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = psa.school_organization_id AND oa.agency_id = t.assigned_to_agency_id AND COALESCE(oa.is_active, 1) = 1)
                        OR EXISTS (SELECT 1 FROM agency_schools a_s WHERE a_s.school_organization_id = psa.school_organization_id AND a_s.agency_id = t.assigned_to_agency_id AND a_s.is_active = 1))) AS school_assigned
     FROM signed_documents sd
     JOIN tasks t ON t.id = sd.task_id AND t.assigned_to_user_id = sd.user_id
     LEFT JOIN contract_generations g ON g.task_id = t.id AND g.candidate_user_id = sd.user_id
     JOIN users u ON u.id = sd.user_id
     JOIN user_agencies ua ON ua.user_id = sd.user_id AND ua.agency_id = t.assigned_to_agency_id
     WHERE (g.agency_id = ? OR g.id IS NULL) AND t.assigned_to_agency_id = ? AND COALESCE(ua.is_active, 1) = 1
       AND COALESCE(u.is_archived, 0) = 0 AND u.is_active = 1 AND u.terminated_at IS NULL
       AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
       AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING', 'PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN')
       AND t.status = 'completed' AND sd.signed_pdf_path IS NOT NULL AND sd.pdf_hash IS NOT NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.source')) = 'provider_update'
     ORDER BY COALESCE(t.completed_at, sd.signed_at) DESC, sd.id DESC`, [aid, aid]);
  const [claims] = await db.execute(
    `SELECT c.id, c.user_id, c.status, c.claim_date, c.credits_hours, c.payload_json,
            e.event_type, e.outreach_table_invited, e.staffing_config_json, e.operations_json
     FROM payroll_time_claims c
     JOIN company_events e ON e.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(c.payload_json, '$.companyEventId')) AS UNSIGNED) AND e.agency_id = c.agency_id
     WHERE c.agency_id = ? AND c.status = 'approved' AND c.claim_type = 'skill_builder_event'
       AND c.claim_date >= ? AND c.claim_date <= ?`, [aid, `${calendarYear}-01-01`, asOfDate]);
  const allowed = userIds == null ? null : new Set(userIds.map(Number));
  const selected = new Map();
  const selectedDocuments = new Map();
  for (const document of documents || []) {
    const uid = Number(document.user_id);
    if (allowed && !allowed.has(uid)) continue;
    const userClaims = (claims || []).filter((c) => Number(c.user_id) === uid);
    const summary = summarizeOutreachCommitment({ document, claims: userClaims, calendarYear, asOfDate, timezone });
    if (!summary) continue;
    if (!selected.has(uid)) { selected.set(uid, summary); selectedDocuments.set(uid, document); }
    else if (summary.effectiveDate < selected.get(uid).creditStartDate) {
      // Another signed amendment in the same year must not erase already earned
      // actual event hours under the employee's earlier annual commitment.
      selected.set(uid, summarizeOutreachCommitment({ document: selectedDocuments.get(uid), claims: userClaims, calendarYear, asOfDate, timezone, creditStartDate: summary.effectiveDate }));
    }
  }
  const recipients = [...selected.values()].filter((summary) => summary.remainingHours > 0);
  if (!includeAudit) return recipients;
  const signedUsers = new Set((documents || []).filter((d) => !allowed || allowed.has(Number(d.user_id))).map((d) => Number(d.user_id)));
  const recognizedUsers = new Set((documents || []).filter((d) => (!allowed || allowed.has(Number(d.user_id))) && readSignedAnnualEventTerms(d.rendered_html)).map((d) => Number(d.user_id)));
  return { recipients, audit: { signedStaffCount: signedUsers.size, unrecognizedTermsCount: signedUsers.size - recognizedUsers.size,
    notEffectiveCount: recognizedUsers.size - selected.size, completedCount: selected.size - recipients.length, outstandingCount: recipients.length,
    evidenceSource: 'signed_provider_update_amendments',
    limitation: 'Only generated signed amendment snapshots with recognized annual event terms are included. Uploaded or other-template amendments require review; approved leave/accommodation adjustments are not inferred.' } };
}
