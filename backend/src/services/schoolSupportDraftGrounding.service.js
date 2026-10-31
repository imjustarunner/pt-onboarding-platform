import pool from '../config/database.js';
import { getEffectiveSchoolStaffRoiState, schoolStaffCanOpenClient } from '../models/ClientSchoolStaffRoiAccess.model.js';

const enabled = value => [true, 1, '1'].includes(value);
const words = value => String(value || '').trim();
const name = row => [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
const array = value => Array.isArray(value) ? value : [];
const publicMessages = messages => array(messages).filter(m => !enabled(m.is_internal) && !enabled(m.is_deleted));
const normalizedCode = value => words(value).toUpperCase();
const timestamp = value => value instanceof Date ? value : new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(String(value)) ? String(value).replace(' ', 'T') + 'Z' : value);

export function schoolSupportRequest(ticket, messages = []) {
  const fromRequester = publicMessages(messages).filter(m => Number(m.author_user_id) === Number(ticket.created_by_user_id)
    || String(m.author_role || '').toLowerCase() === 'school_staff');
  return words(fromRequester.at(-1)?.body || ticket.question);
}

export function schoolSupportClientReferences(ticket, messages = []) {
  // Only the received question and its own public conversation are evidence.
  // Historical replies, model extraction, staff guidance and notes cannot resolve identity.
  const received = publicMessages(messages).filter(m => Number(m.author_user_id) === Number(ticket.created_by_user_id)
    || String(m.author_role || '').toLowerCase() === 'school_staff');
  const text = [ticket.question, ...received.map(m => m.body)].filter(Boolean).join('\n');
  return [...new Set((text.match(/\b[A-Za-z0-9][A-Za-z0-9_-]{2,39}\b/g) || [])
    .filter(v => !['ROI','SSO','MDT','MST','UTC','ITSCO','ITSCOLLC'].includes(v.toUpperCase()))
    .filter(v => /^\d+$/.test(v)
      ? new RegExp(`\\b(?:client|student|child|code|identifier|ID)\\s*#?[: ]*${v}\\b`, 'i').test(text)
      : /\d/.test(v) || v === v.toUpperCase())
    .map(normalizedCode))].slice(0, 64);
}

/** Read-only, school-and-agency-scoped administrative evidence; never clinical notes. */
export async function loadSchoolSupportDraftGrounding({ ticket, messages = [] }, { database = pool, now = new Date() } = {}) {
  const agencyId = Number(ticket?.agency_id), schoolId = Number(ticket?.school_organization_id);
  const empty = { status: 'no_reference', client: null, assignments: [], planningSlots: [], nextAppointment: null,
    roi: null, canShareScheduling: false, sources: [], warnings: [], request: schoolSupportRequest(ticket || {}, messages) };
  if (!agencyId || !schoolId) return { ...empty, status: 'unavailable', warnings: ['school_scope_unavailable'] };
  const references = schoolSupportClientReferences(ticket, messages);
  const linkedId = Number(ticket.client_id) || null;
  if (!linkedId && !references.length) return empty;
  let matches;
  try {
    const predicates = linkedId ? 'c.id=?' : `(UPPER(TRIM(c.initials)) IN (${references.map(() => '?').join(',')})
      OR UPPER(TRIM(c.identifier_code)) IN (${references.map(() => '?').join(',')}))`;
    const [rows] = await database.execute(`SELECT c.id,c.agency_id,c.organization_id,c.initials,c.identifier_code,c.status,
      c.document_status,c.provider_id,c.service_day,c.roi_expires_at,a.timezone
      FROM clients c JOIN agencies a ON a.id=c.agency_id
      WHERE c.agency_id=? AND UPPER(c.status)<>'ARCHIVED'
        AND (c.organization_id=? OR EXISTS(SELECT 1 FROM client_organization_assignments coa
          WHERE coa.client_id=c.id AND coa.organization_id=? AND coa.is_active=1))
        AND ${predicates} LIMIT 3`, [agencyId, schoolId, schoolId, ...(linkedId ? [linkedId] : [...references, ...references])]);
    matches = array(rows).filter(c => Number(c.agency_id) === agencyId && String(c.status).toUpperCase() !== 'ARCHIVED'
      && (linkedId ? Number(c.id) === linkedId : references.some(r => [normalizedCode(c.initials), normalizedCode(c.identifier_code)].includes(r))));
  } catch { return { ...empty, status: 'unavailable', warnings: ['client_lookup_unavailable'] }; }
  if (matches.length !== 1) return { ...empty, status: matches.length ? 'ambiguous' : 'not_found',
    warnings: [matches.length ? 'client_reference_ambiguous' : 'client_reference_not_found_in_school'] };
  const c = matches[0], clientId = Number(c.id);
  const result = { ...empty, status: 'matched', client: { id: clientId, initials: c.initials,
    identifier_code: c.identifier_code, status: c.status, document_status: c.document_status },
    timezone: words(c.timezone), matchReason: linkedId ? 'linked_client' : 'unique_school_reference',
    sources: [{ type: 'client', id: clientId, label: `Matched client: ${words(c.initials) || 'school client'}`,
      detail: linkedId ? 'Existing ticket link, verified in this school and agency' : 'Unique exact client reference in this school and agency; ticket link unchanged' }] };
  // Defense in depth for affiliated clients: do not trust a primary-school mismatch.
  if (Number(c.organization_id) !== schoolId) {
    try {
      const [[member]] = await database.execute('SELECT 1 AS active FROM client_organization_assignments WHERE client_id=? AND organization_id=? AND is_active=1 LIMIT 1', [clientId, schoolId]);
      if (!member) return { ...empty, status: 'unavailable', warnings: ['client_school_membership_unconfirmed'] };
    } catch { return { ...empty, status: 'unavailable', warnings: ['client_school_membership_unconfirmed'] }; }
  }
  const queries = [
    ['assignments', `SELECT DISTINCT u.id,u.first_name,u.last_name,cpa.service_day FROM client_provider_assignments cpa
      JOIN users u ON u.id=cpa.provider_user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      WHERE cpa.client_id=? AND cpa.organization_id=? AND cpa.is_active=1
        AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0`, [agencyId, clientId, schoolId]],
    ['planningSlots', `SELECT s.provider_user_id,s.weekday,s.start_time,s.end_time,u.first_name,u.last_name FROM soft_schedule_slots s
      JOIN users u ON u.id=s.provider_user_id WHERE s.client_id=? AND s.school_organization_id=? ORDER BY s.weekday,s.start_time LIMIT 12`, [clientId, schoolId]],
    ['appointments', `SELECT DISTINCT ap.id,ap.start_at,ap.end_at,ap.status,u.first_name,u.last_name FROM appointments ap
      JOIN appointment_participants p ON p.appointment_id=ap.id AND p.client_id=?
      JOIN agency_service_locations sl ON sl.id=ap.service_location_id AND sl.agency_id=ap.agency_id AND sl.school_organization_id=?
      JOIN users u ON u.id=ap.provider_user_id WHERE ap.agency_id=? AND ap.business_type='clinical'
        AND ap.status IN ('scheduled','confirmed','client_confirmed') AND ap.start_at>=? ORDER BY ap.start_at LIMIT 1`, [clientId, schoolId, agencyId, now]],
    ['recipient', `SELECT u.id,u.role,sc.is_school_admin,sc.is_primary FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      LEFT JOIN school_contacts sc ON sc.school_organization_id=ua.agency_id
        AND LOWER(TRIM(sc.email)) COLLATE utf8mb4_unicode_ci=LOWER(TRIM(u.email)) COLLATE utf8mb4_unicode_ci
      WHERE u.id=? AND u.role='school_staff' AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 ORDER BY sc.id DESC LIMIT 1`, [schoolId, Number(ticket.created_by_user_id) || 0]],
    ['staffRoi', `SELECT access_level,is_active FROM client_school_staff_roi_access
      WHERE client_id=? AND school_organization_id=? AND school_staff_user_id=? LIMIT 1`, [clientId, schoolId, Number(ticket.created_by_user_id) || 0]]
  ];
  const asksPastAttendance = /\b(?:last|previous)\s+(?:seen|session|appointment|visit)\b|\b(?:was|were|has)\b[^?\n]{0,80}\bseen\b|\bwhen did\b/i.test(result.request);
  if (asksPastAttendance) queries.push(['lastAppointment', `SELECT DISTINCT ap.id,ap.start_at,ap.end_at,ap.status,u.first_name,u.last_name FROM appointments ap
    JOIN appointment_participants p ON p.appointment_id=ap.id AND p.client_id=?
    JOIN agency_service_locations sl ON sl.id=ap.service_location_id AND sl.agency_id=ap.agency_id AND sl.school_organization_id=?
    JOIN users u ON u.id=ap.provider_user_id WHERE ap.agency_id=? AND ap.business_type='clinical'
      AND ap.status='completed' AND ap.end_at<=? ORDER BY ap.start_at DESC LIMIT 1`, [clientId, schoolId, agencyId, now]]);
  const settled = await Promise.allSettled(queries.map(([, sql, params]) => database.execute(sql, params)));
  const rows = {};
  settled.forEach((r, index) => {
    const key = queries[index][0];
    if (r.status === 'fulfilled') rows[key] = array(r.value[0]);
    else { rows[key] = null; result.warnings.push(`${key}_unavailable`); }
  });
  result.assignments = (rows.assignments || []).map(p => ({ providerId: Number(p.id), provider: name(p), day: p.service_day || null }));
  // The legacy value is useful only for the same primary school and a successful
  // empty assignment query, never when the current query failed.
  if (rows.assignments && !rows.assignments.length && c.provider_id && Number(c.organization_id) === schoolId) {
    try {
      const [[p]] = await database.execute(`SELECT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua
        ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 LIMIT 1`, [agencyId, c.provider_id]);
      if (p) result.assignments = [{ providerId: Number(p.id), provider: name(p), day: c.service_day || null }];
    } catch { result.warnings.push('legacy_assignment_unavailable'); }
  }
  result.planningSlots = (rows.planningSlots || []).map(s => ({ provider: name(s), providerId: Number(s.provider_user_id), day: s.weekday,
    start: String(s.start_time || '').slice(0, 5), end: String(s.end_time || '').slice(0, 5) }));
  result.nextAppointment = rows.appointments?.[0] ? { provider: name(rows.appointments[0]), start: rows.appointments[0].start_at,
    end: rows.appointments[0].end_at, status: rows.appointments[0].status } : null;
  if (asksPastAttendance) result.lastAppointment = rows.lastAppointment?.[0]
    ? { provider: name(rows.lastAppointment[0]), start: rows.lastAppointment[0].start_at, status: rows.lastAppointment[0].status } : null;
  const recipient = rows.recipient?.[0];
  const roiStateKnown = !!recipient && rows.staffRoi !== null;
  const staffState = roiStateKnown ? getEffectiveSchoolStaffRoiState(rows.staffRoi[0], c.roi_expires_at, { schoolStaffInOrg: true }) : 'unknown';
  const expiration = c.roi_expires_at ? String(c.roi_expires_at instanceof Date ? c.roi_expires_at.toISOString() : c.roi_expires_at).slice(0, 10) : null;
  let localDate;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: result.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value])); localDate = `${p.year}-${p.month}-${p.day}`;
  } catch { result.warnings.push('roi_timezone_unavailable'); }
  const dateState = expiration && localDate ? (expiration < localDate ? 'expired' : 'current') : expiration ? 'date_unverified' : 'not_on_file';
  const policyConflict = (dateState === 'current' && staffState === 'expired')
    || (dateState === 'expired' && ['roi','roi_docs','limited'].includes(staffState));
  if (policyConflict) result.warnings.push('roi_date_policy_needs_review');
  result.roi = { expiresOn: expiration, state: policyConflict ? 'date_unverified' : dateState, staffState };
  result.canShareScheduling = !!recipient && (enabled(recipient.is_school_admin) || enabled(recipient.is_primary)
    || (roiStateKnown && schoolStaffCanOpenClient(rows.staffRoi[0], c.roi_expires_at, { schoolStaffInOrg: true })));
  if (result.assignments.length) result.sources.push({ type: 'provider_assignment', id: clientId, label: 'Current school provider assignment',
    detail: result.assignments.map(p => `${p.provider || 'Provider'}${p.day ? ` (${p.day})` : ''}`).join('; ') });
  if (result.roi && recipient) result.sources.push({ type: 'release_status', id: clientId, label: 'Current release of information (ROI) record',
    detail: `Expiration: ${expiration || 'not on file'}; requester access: ${staffState}` });
  if (result.planningSlots.length) result.sources.push({ type: 'school_plan', id: clientId, label: 'Saved weekly school plan', detail: 'Planning times are separate from booked appointments' });
  if (result.nextAppointment) result.sources.push({ type: 'appointment', id: clientId, label: 'Next booked school appointment', detail: result.nextAppointment.status });
  const confirmation = publicMessages(messages).filter(m => result.assignments.some(p => p.providerId === Number(m.author_user_id))
    && ['provider','provider_plus','supervisor','intern','intern_plus'].includes(String(m.author_role || '').toLowerCase())
    && /\bconfirmed\b/i.test(m.body || '')).at(-1);
  if (confirmation) {
    const day = words(confirmation.body).match(/\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?)\b/i)?.[0];
    if (day) result.threadConfirmation = { provider: result.assignments.find(p => p.providerId === Number(confirmation.author_user_id)).provider,
      day, messageId: Number(confirmation.id) };
  }
  return result;
}

function dayTime(value, timeZone) {
  if (!timeZone) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(timestamp(value)); } catch { return null; }
}
const dateOnly = value => value ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`)) : '';

/** Record-backed answers for the ordinary school administrative questions. No model guesses. */
export function schoolSupportRecordReply(grounding) {
  if (grounding?.status !== 'matched' || !grounding.client?.initials) return null;
  const q = words(grounding.request), code = words(grounding.client.initials);
  const roiQuestion = /\broi\b|release of information/i.test(q);
  const scheduleQuestion = /\b(?:seen|session|appointment|schedule|assigned|assignment|provider|therapist|counselor)\b/i.test(q);
  if (!roiQuestion && !scheduleQuestion) return null;
  // A school administrator may inspect assignment status; that does not grant
  // clinical-document or other family access. Every fact here is administrative.
  if (!grounding.canShareScheduling) return grounding.warnings.includes('recipient_unavailable')
    ? `${code} was matched in this school, but the current school-access permissions could not be verified. That internal check is needed before sharing session details.`
    : `${code} was matched in this school. The current school access does not permit sharing session details; the release-of-information access needs an internal review before those details can be provided.`;
  if (roiQuestion) {
    const roi = grounding.roi;
    if (!roi) return `ROI means release of information. I matched ${code}, but the current release status could not be verified, so renewal needs an internal check.`;
    const state = roi.state === 'current'
      ? `The current release of information (ROI) record for ${code} is dated through ${dateOnly(roi.expiresOn)}.`
      : roi.state === 'expired' ? `The release of information (ROI) on file for ${code} expired on ${dateOnly(roi.expiresOn)}.`
        : roi.state === 'date_unverified' ? `The release of information (ROI) record for ${code} lists ${dateOnly(roi.expiresOn)}. Its effective expiration status needs an internal timezone/access check before renewal can be confirmed.`
        : `There is no expiration date on the current release of information (ROI) record for ${code}; that does not prove whether a renewal was submitted elsewhere.`;
    const access = { roi: 'Your account has permission to speak about this client.', roi_docs: 'Your account has permission to speak and view the released documents.',
      limited: 'Your account has limited school access; that is separate from a specific permission to speak or view documents.',
      expired: 'The school access tied to that release is expired.', none: 'There is no active individual release grant for your account.', packet: 'Your account is currently marked as having no active individual release.',
      unknown: 'The individual release grant for your account could not be verified.' }[roi.staffState];
    return [state, access, roi.state === 'current' && /expir|no roi/i.test(q) ? 'The expired/no-ROI display in your message does not match that current expiration date; the display needs review rather than another explanation from you.' : ''].filter(Boolean).join(' ');
  }
  const assignment = grounding.assignments.length ? `${code} is assigned to ${grounding.assignments.map(p => `${p.provider}${p.day ? ` on ${p.day}s` : ''}`).join(' and ')}.`
    : grounding.warnings.includes('assignments_unavailable') ? `The current provider assignment for ${code} could not be verified.` : `${code} has no active provider assignment recorded for this school.`;
  const plan = grounding.planningSlots[0];
  const planning = plan ? `The saved weekly school plan lists ${plan.day}, ${plan.start}–${plan.end}; this is a planning time, separate from a booked appointment.` : '';
  const appointment = grounding.nextAppointment;
  const when = appointment && dayTime(appointment.start, grounding.timezone);
  const booked = when ? `The next ${['confirmed','client_confirmed'].includes(appointment.status) ? 'confirmed' : 'booked'} school appointment is ${when} with ${appointment.provider}.`
    : grounding.warnings.includes('appointments_unavailable') ? 'The appointment schedule could not be verified.'
      : appointment ? 'A future school appointment is recorded, but its local timezone needs verification.' : 'No upcoming booked school appointment was found in the schedule checked; the weekly assignment alone does not confirm a session date or time.';
  if (Object.hasOwn(grounding, 'lastAppointment')) {
    const past = grounding.lastAppointment, whenSeen = past && dayTime(past.start, grounding.timezone);
    return whenSeen ? `${code}'s last recorded completed school session was ${whenSeen} with ${past.provider}.`
      : grounding.warnings.includes('lastAppointment_unavailable') ? `The completed-session records for ${code} could not be verified.`
        : `No completed school session for ${code} was found in the attendance records checked. A past calendar entry alone does not establish that the student was seen.`;
  }
  if (/\bconfirm/i.test(q) && grounding.threadConfirmation) return [
    `${grounding.threadConfirmation.provider} confirmed the ${grounding.threadConfirmation.day} session for ${code} in this conversation.`,
    booked, 'The conversation reply and the calendar appointment status are separate evidence.'
  ].join(' ');
  if (/\b(?:move|change|after lunch|reschedul)/i.test(q)) return [assignment, planning, booked,
    'Moving the session requires an approved scheduling change; drafting this reply has not moved or approved a session.'].filter(Boolean).join(' ');
  return [assignment, planning, booked].filter(Boolean).join(' ');
}

export function validateSchoolSupportReply(text, grounding, messages = []) {
  const body = words(text), issues = [];
  for (const value of [grounding?.client?.id, grounding?.client?.identifier_code].filter(Boolean)) {
    if (/^\d{3,}$/.test(String(value)) && new RegExp(`\\b${value}\\b`).test(body)) issues.push('internal_client_identifier');
  }
  if (/\b(?:what|clarify|explain|specify)\b[^.!?\n]{0,70}\bROI\b[^.!?\n]{0,35}\b(?:means?|refers?|stands?)\b|\bwhat\s+(?:does|is)\s+(?:an?\s+)?ROI\b/i.test(body)) issues.push('asks_known_roi_definition');
  if (grounding?.status === 'matched' && /\b(?:what|which|clarify|specify)\b[^.!?\n]{0,100}\b(?:refers? to|client|student|child)\b[^.!?\n]*\?/i.test(body)) issues.push('asks_known_client_identity');
  if (/\b(?:will|would|shall|is going to|has agreed to|has promised to)\s+(?:personally |also |then )*(?:call|contact|email|text|notify|move|reschedule|cancel|change|update|book|arrange|send|forward|reach out)\b|\b(?:i|we|they|he|she)['’]ll\s+(?:call|contact|email|text|notify|move|reschedule|cancel|book|send|forward)\b/i.test(body)) issues.push('unsupported_provider_or_staff_commitment');
  const providerConfirmed = publicMessages(messages).some(m => ['provider','provider_plus','supervisor','intern','intern_plus'].includes(String(m.author_role || '').toLowerCase()) && /\bconfirmed\b/i.test(m.body || ''));
  if (/\b(?:confirmed|has been (?:moved|rescheduled|canceled|cancelled|updated))\b/i.test(body)
    && !providerConfirmed && !['confirmed','client_confirmed'].includes(grounding?.nextAppointment?.status)) issues.push('unverified_appointment_change');
  return [...new Set(issues)];
}
