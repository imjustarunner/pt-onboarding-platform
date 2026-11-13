import {parseScheduleUtcInstant} from './scheduleEventInstants.js';

const number = (...values) => Number(values.find(value => Number(value) > 0) || 0);
const schoolId = row => number(row?.schoolOrganizationId, row?.schoolOrgId, row?.school_organization_id);
const agencyId = row => number(row?.agencyId, row?._agencyId);
const range = row => [parseScheduleUtcInstant(row?.startAt), parseScheduleUtcInstant(row?.endAt)];
const terminal = row => /^(?:CANCEL|VOID|RESCHEDUL|NO_SHOW|MISSED)/i.test(String(row?.appointmentStatus || row?.status || ''));
export const isClientCalendarSession = row => !!number(row?.clientId, row?.appointmentId) || /Client\s*id:\s*\d+/i.test(String(row?.description || ''));
// Client appointments remain appointments when the optional room-reservation layer is hidden.
export function includeOfficeClientSessions(events = [], offices = []) {
  const result = [...events], linked = new Set(events.map(row => number(row.appointmentId)).filter(Boolean));
  for (const office of offices) {
    const appointmentId = number(office.appointmentId);
    if (!appointmentId || !number(office.clientId) || linked.has(appointmentId) || terminal(office)) continue;
    result.push({ ...office, agencyId: number(office.appointmentAgencyId, office.agencyId), _agencyId: number(office.appointmentAgencyId, office.agencyId, office._agencyId), id: -number(office.id), officeEventId: number(office.id), appointmentId,
      officeLocationId: number(office.buildingId, office.officeLocationId), kind: 'PERSONAL_EVENT', title: 'Client session',
      appointmentStatus: String(office.appointmentStatus || office.statusOutcome || 'scheduled').toLowerCase(), isPrivate: false, allDay: false });
    linked.add(appointmentId);
  }
  return result;
}
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
// A legacy session can be linked visually to its own room reservation even
// when it predates canonical office_event_id links. Require explicit ownership,
// room and building; an overlapping unrelated booking is never enough.
export function sessionOfficeReservation(event, offices = []) {
  const appointment = number(event?.appointmentId);
  const officeEvent = number(event?.officeEventId);
  const direct = offices.find(row => (appointment && number(row.appointmentId) === appointment)
    || (officeEvent && number(row.id) === officeEvent));
  if (direct) return direct;
  const provider = number(event?.providerId, event?.provider_id);
  const room = number(event?.roomId);
  const building = number(event?.officeLocationId, event?.buildingId);
  if (!provider || !room || !building || String(event?.modality || '').toUpperCase() === 'TELEHEALTH') return null;
  const [start, end] = range(event);
  return offices.find(row => {
    if (terminal(row) || number(row.bookedProviderId, row.assignedProviderId, row.providerId) !== provider
      || number(row.roomId) !== room || number(row.buildingId, row.officeLocationId) !== building) return false;
    if (number(row.appointmentId) && number(row.appointmentId) !== appointment) return false;
    const [rs, re] = range(row);
    return start && end && rs && re && rs <= start && re >= end;
  }) || null;
}
export function decorateSessionLocations(events = [], assignments = [], offices = [], timeZone = 'America/Denver') {
  return events.map(event => {
    if (!isClientCalendarSession(event)) return event;
    const school=sessionSchoolAssignment(event,assignments,timeZone);
    const office=sessionOfficeReservation(event, offices);
    if (!school && schoolId(event)) return {...event,calendarLocationKind:'school',locationLabel:event.schoolName || event.locationLabel || 'School'};
    if (school) return {...event,schoolOrganizationId:schoolId(school),schoolName:school.schoolName,locationLabel:school.schoolName,schoolAssignmentId:number(school.assignmentId,school.id),calendarLocationKind:'school'};
    if (office) return {...event,officeEventId:number(office.id),officeLocationId:number(office.buildingId,office.officeLocationId),roomId:number(office.roomId),
      locationLabel:[office.buildingName,office.roomLabel || (office.roomNumber ? `Office #${office.roomNumber}` : '')].filter(Boolean).join(' · '),
      googleCalendarUrl:event.googleCalendarUrl || office.googleCalendarUrl || null,calendarLocationKind:'office'};
    return event;
  });
}
// Only hide a room card when the canonical appointment proves it is the same
// session. A separate reservation or another provider's booking remains visible.
export function officeCoveredBySession(office, sessions = []) {
  return sessions.some(event => {
    if (terminal(event) || !isClientCalendarSession(event) || !calendarRangesOverlap(office,event)) return false;
    if (number(event.appointmentId) && number(event.appointmentId)===number(office.appointmentId)) return true;
    if (sessionOfficeReservation(event, [office]) !== office) return false;
    const [start,end]=range(event), [rs,re]=range(office);
    return +start <= +rs && +end >= +re;
  });
}
export function virtualSchoolOverlap(assignments = [], {dayOfWeek,startTime,endTime,agencyId:tenant} = {}) {
  return assignments.filter(a => (!tenant || !agencyId(a) || agencyId(a)===Number(tenant)) && a.dayOfWeek===dayOfWeek && String(a.startTime).slice(0,5)<endTime && String(a.endTime).slice(0,5)>startTime);
}
export function scheduleEventSignature(row,normalizeInstant = value => String(value || '')) {
  return `${String(row?.kind || '').toUpperCase()}|${normalizeInstant(row?.startAt)}|${normalizeInstant(row?.endAt)}|${String(row?.title || '').trim()}|${number(row?.id) || ''}`;
}
