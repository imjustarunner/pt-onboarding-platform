import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { readEventOperations, mapEventOperations } from '../utils/companyEventOperations.js';
import { resolveCompanyEventAudienceUserIds } from './companyEventAudience.service.js';
import { parseJsonMaybe, computeNextOccurrence, normalizeRecurrence } from './companyEvents.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { isCompanyGathering } from '../utils/companyEventPage.js';
export { isCompanyGathering } from '../utils/companyEventPage.js';

export const companyGatheringSql = (alias = 'ce') => `(${alias}.organization_id IS NULL
  AND COALESCE(${alias}.event_type,'company_event') NOT IN ('team_poll','direct_notice','skills_group','guardian_program_class','skill_builders')
  AND COALESCE(${alias}.event_type,'company_event') NOT LIKE 'school_%' AND COALESCE(${alias}.event_type,'company_event') NOT LIKE 'program_%'
  AND EXISTS(SELECT 1 FROM agencies company_host WHERE company_host.id=${alias}.agency_id
    AND COALESCE(company_host.organization_type,'agency') IN ('agency','company','life_coach','consultant')
    AND COALESCE(company_host.club_kind,'')<>'book_club'))`;
export function normalizeCompanyEventRsvp(value) {
  if (value && typeof value === 'object') {
    const key = value.response_key ?? value.responseKey ?? value.response;
    const label = value.response_label ?? value.responseLabel;
    if (/^[123]$/.test(String(key || '')) && label && !normalizeCompanyEventRsvp(label)) return null;
    return normalizeCompanyEventRsvp(key);
  }
  return ({ yes: 'yes', y: 'yes', '1': 'yes', no: 'no', n: 'no', '2': 'no', maybe: 'maybe', m: 'maybe', '3': 'maybe' })[String(value || '').trim().toLowerCase()] || null;
}
const instant = value => value ? new Date(utcMysqlToIso(value) || value) : null;
export function personalCompanyEventMetadata(event, rsvp, userId, now = new Date()) {
  if (!isCompanyGathering(event)) return { isInvitedCompanyEvent: false };
  const operations = readEventOperations(event), end = instant(event.ends_at || event.endsAt), deadline = instant(event.rsvp_deadline || event.rsvpDeadline);
  const links = mapEventOperations({ ...event, id: event.id, staff_link_token: event.staff_link_token });
  return { isInvitedCompanyEvent: true, myRsvp: normalizeCompanyEventRsvp(rsvp),
    mandatory: operations.mandatoryUserIds.includes(Number(userId)),
    canRsvp: Number(event.is_active ?? event.isActive ?? 1) === 1 && !['canceled', 'cancelled'].includes(event.school_event_status)
      && (!end || end > now || !!computeNextOccurrence({ startsAt: event.starts_at || event.startsAt, endsAt: event.ends_at || event.endsAt, recurrence: parseJsonMaybe(event.recurrence_json) || event.recurrence }, now)) && (!deadline || deadline > now),
    staffPageUrl: links.staffPageUrl || `/staff-events/${Number(event.id)}?agencyId=${Number(event.agency_id || event.agencyId)}` };
}

export function companyEventScheduleVisibility(event, viewerOwnsSchedule) {
  if (viewerOwnsSchedule) return event;
  return { id: event.id, kind: 'PERSONAL_EVENT', title: 'Busy', isPrivate: true, allDay: false,
    startAt: event.startAt, endAt: event.endAt, canEdit: false, canReschedule: false };
}
export async function listCurrentCompanyGatherings({ userId, db = pool }) {
  const [rows] = await db.execute(`SELECT ce.* FROM company_events ce
    WHERE ce.is_active=1 AND COALESCE(ce.school_event_status,'') NOT IN ('canceled','cancelled')
      AND ${companyGatheringSql('ce')}
      AND EXISTS(SELECT 1 FROM user_agencies member WHERE member.user_id=? AND COALESCE(member.is_active,1)=1
        AND (member.agency_id=ce.agency_id OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(ce.operations_json,'$.invitedAgencyIds'),JSON_ARRAY()),CAST(member.agency_id AS JSON))))
      AND ((ce.starts_at IS NULL AND ce.ends_at IS NULL AND JSON_EXTRACT(ce.operations_json,'$.dateToBeDecided')=TRUE)
        OR ce.ends_at>=DATE_SUB(NOW(),INTERVAL 1 DAY) OR JSON_EXTRACT(ce.recurrence_json,'$.frequency') IN ('weekly','monthly'))
    ORDER BY ce.starts_at,ce.id`, [userId]);
  return rows.filter(isCompanyGathering);
}
export async function loadCompanyEventRsvpMap({ eventIds, userId, db = pool }) {
  const ids = [...new Set(eventIds.map(Number).filter(id => id > 0))];
  if (!ids.length) return new Map();
  const [rows] = await db.execute(`SELECT ce.id AS company_event_id,r.response_key,r.response_label,r.received_at,
      i.response AS invitation_response,i.responded_at
    FROM company_events ce LEFT JOIN company_event_responses r ON r.company_event_id=ce.id AND r.user_id=?
    LEFT JOIN company_event_invitations i ON i.company_event_id=ce.id AND i.user_id=?
    WHERE ce.id IN (${ids.map(() => '?').join(',')})`, [userId, userId, ...ids]);
  return new Map(rows.map(row => {
    const response = normalizeCompanyEventRsvp(row), invitation = normalizeCompanyEventRsvp(row.invitation_response);
    const latest = invitation && (!response || (instant(row.responded_at)?.getTime() || 0) > (instant(row.received_at)?.getTime() || 0)) ? invitation : response || invitation;
    return [Number(row.company_event_id), latest];
  }));
}

// Read projections rather than creating provider_schedule_events or payroll records.
export async function acceptedCompanyEventCalendar({ userId, agencyId = null, from, to, includeAllAgencies = false, db = pool }) {
  const start = instant(from), end = instant(to);
  if (!start || !end || !Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) return [];
  const [rows] = await db.execute(`SELECT ce.* FROM company_events ce
    WHERE ce.is_active=1 AND COALESCE(ce.school_event_status,'') NOT IN ('canceled','cancelled')
      AND ${companyGatheringSql('ce')} AND ce.starts_at IS NOT NULL AND ce.ends_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM user_agencies member WHERE member.user_id=? AND COALESCE(member.is_active,1)=1
        ${!includeAllAgencies && agencyId ? 'AND member.agency_id=?' : ''}
        AND (member.agency_id=ce.agency_id OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(ce.operations_json,'$.invitedAgencyIds'),JSON_ARRAY()),CAST(member.agency_id AS JSON))))
      AND ce.starts_at<? AND (ce.ends_at>? OR JSON_EXTRACT(ce.recurrence_json,'$.frequency') IN ('weekly','monthly'))
    ORDER BY ce.starts_at,ce.id`, [userId, ...(!includeAllAgencies && agencyId ? [Number(agencyId)] : []), end, start]);
  const candidates = rows.filter(isCompanyGathering), responses = await loadCompanyEventRsvpMap({ eventIds: candidates.map(event => event.id), userId, db });
  const eligible = [];
  for (const event of candidates) {
    const myRsvp = responses.get(Number(event.id));
    if (!['yes','maybe'].includes(myRsvp) || readEventOperations(event).dateToBeDecided) continue;
    if (!(await resolveCompanyEventAudienceUserIds({ event, db })).includes(Number(userId))) continue;
    eligible.push({ event, myRsvp });
  }
  if (!eligible.length) return [];
  const ids = eligible.map(({ event }) => Number(event.id));
  const [sessions] = await db.execute(`SELECT id,company_event_id,starts_at,ends_at FROM company_event_session_dates
    WHERE company_event_id IN (${ids.map(() => '?').join(',')}) AND ends_at>? AND starts_at<? ORDER BY starts_at`, [...ids, start, end]);
  const output = [];
  for (const { event, myRsvp } of eligible) {
    const config = normalizeRecurrence(parseJsonMaybe(event.recurrence_json));
    let occurrences = config.frequency === 'none' ? [{ startsAt: instant(event.starts_at), endsAt: instant(event.ends_at) }]
      : sessions.filter(session => Number(session.company_event_id) === Number(event.id)).map(session => ({ startsAt: instant(session.starts_at), endsAt: instant(session.ends_at) }));
    if (!occurrences.length && config.frequency !== 'none') {
      const duration = Math.max(60000, Math.min(7 * 86400000, +instant(event.ends_at) - +instant(event.starts_at)));
      let cursor = new Date(+start - duration - 1);
      for (let count = 0; count < 750; count++) {
        const next = computeNextOccurrence({ startsAt: event.starts_at, endsAt: event.ends_at, recurrence: config }, cursor);
        if (!next || next.startsAt >= end) break;
        if (next.endsAt > start) occurrences.push(next);
        cursor = new Date(+next.startsAt + 1);
      }
    }
    if (!occurrences.length && config.frequency === 'none') occurrences = [{ startsAt: instant(event.starts_at), endsAt: instant(event.ends_at) }];
    for (const occurrence of occurrences) {
      if (!occurrence.startsAt || !occurrence.endsAt || occurrence.endsAt <= start || occurrence.startsAt >= end || occurrence.endsAt <= occurrence.startsAt) continue;
      const projectionKey = `company-event:${event.id}:${occurrence.startsAt.toISOString()}`;
      const id = -Number.parseInt(createHash('sha256').update(projectionKey).digest('hex').slice(0, 12), 16);
      output.push({ id, companyEventId: Number(event.id), agencyId: Number(event.agency_id), kind: 'COMPANY_EVENT_INVITATION',
        scheduleSource: 'company_event', projectionKey, title: event.title, description: event.description || '',
        startAt: occurrence.startsAt.toISOString(), endAt: occurrence.endsAt.toISOString(), allDay: false,
        timezone: event.timezone || 'UTC', locationLabel: event.event_location_name || event.event_location_address || '',
        canEdit: false, canReschedule: false, isPrivate: false, status: 'ACTIVE',
        calendarStatus: myRsvp === 'maybe' ? 'tentative' : 'confirmed', updatedAt: event.updated_at,
        ...personalCompanyEventMetadata(event, myRsvp, userId) });
    }
  }
  return output;
}
