import {parseScheduleUtcInstant} from './scheduleEventInstants.js';

const number = (...values) => Number(values.find(value => Number(value) > 0) || 0);
const schoolId = row => number(row?.schoolOrganizationId, row?.schoolOrgId, row?.school_organization_id);
const agencyId = row => number(row?.agencyId, row?._agencyId);
const range = row => [parseScheduleUtcInstant(row?.startAt), parseScheduleUtcInstant(row?.endAt)];
const terminal = row => /^(?:CANCEL|VOID|RESCHEDUL|NO_SHOW|MISSED)/i.test(String(row?.appointmentStatus || row?.status || ''));
export const isClientCalendarSession = row => !!number(row?.clientId, row?.appointmentId) || /Client\s*id:\s*\d+/i.test(String(row?.description || ''));
export function calendarRangesOverlap(a,b) {
  const [as,ae]=range(a),[bs,be]=range(b);
  return !!(as&&ae&&bs&&be&&as<be&&ae>bs);
}
export function sessionSchoolAssignment(event, assignments = [], timeZone = 'America/Denver') {
  if (!isClientCalendarSession(event) || terminal(event)) return null;
  const [start,end]=range(event);
  if (!start || !end) return null;
  const explicit=schoolId(event);
  const described=String(event.schoolName || String(event.description || '').match(/(?:^|\n)School:\s*([^\n]+)/i)?.[1] || '').trim().toLowerCase();
  return assignments.find(a => {
    if (agencyId(event) && agencyId(a) && agencyId(event)!==agencyId(a)) return false;
    // The saved service location remains the school's location even for a
    // one-off session outside its usual assignment hours.
    if (explicit) return schoolId(a)===explicit;
    return !!described && String(a.schoolName || '').trim().toLowerCase()===described;
  }) || null;
}
export function decorateSessionLocations(events = [], assignments = [], offices = [], timeZone = 'America/Denver') {
  return events.map(event => {
    if (!isClientCalendarSession(event)) return event;
    const school=sessionSchoolAssignment(event,assignments,timeZone);
    const office=offices.find(row => number(row.appointmentId) && number(row.appointmentId)===number(event.appointmentId));
    if (!school && schoolId(event)) return {...event,calendarLocationKind:'school',locationLabel:event.schoolName || event.locationLabel || 'School'};
    if (school) return {...event,schoolOrganizationId:schoolId(school),schoolName:school.schoolName,locationLabel:school.schoolName,schoolAssignmentId:number(school.assignmentId,school.id),calendarLocationKind:'school'};
    if (office) return {...event,officeLocationId:number(office.buildingId,office.officeLocationId),roomId:number(office.roomId),locationLabel:[office.buildingName,office.roomLabel].filter(Boolean).join(' · '),calendarLocationKind:'office'};
    return event;
  });
}
// Only hide a room card when the canonical appointment proves it is the same
// session. A separate reservation or another provider's booking remains visible.
export function officeCoveredBySession(office, sessions = []) {
  return sessions.some(event => !terminal(event) && isClientCalendarSession(event) && number(event.appointmentId) && number(event.appointmentId)===number(office.appointmentId) && calendarRangesOverlap(office,event));
}
export function virtualSchoolOverlap(assignments = [], {dayOfWeek,startTime,endTime,agencyId:tenant} = {}) {
  return assignments.filter(a => (!tenant || !agencyId(a) || agencyId(a)===Number(tenant)) && a.dayOfWeek===dayOfWeek && String(a.startTime).slice(0,5)<endTime && String(a.endTime).slice(0,5)>startTime);
}
export function scheduleEventSignature(row,normalizeInstant = value => String(value || '')) {
  return `${String(row?.kind || '').toUpperCase()}|${normalizeInstant(row?.startAt)}|${normalizeInstant(row?.endAt)}|${String(row?.title || '').trim()}|${number(row?.id) || ''}`;
}
