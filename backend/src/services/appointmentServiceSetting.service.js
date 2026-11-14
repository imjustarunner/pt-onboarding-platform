import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import { schoolAppointmentReminderText } from '../utils/schoolAppointmentReminder.js';

// The office used to bill a visit is not evidence of where the visit takes place.
// Resolve only appointment/encounter-specific data, never a child's enrollment school.
export async function resolveAppointmentServiceSetting(appt) {
  const agencyId = Number(appt.agencyId);
  let serviceLocationId = Number(appt.serviceLocationId) || null;
  let placeOfService = null;
  if (!serviceLocationId && appt.officeEventId) {
    const [rows] = await pool.execute(
      'SELECT service_location_id FROM office_events WHERE id = ? LIMIT 1', [appt.officeEventId]);
    serviceLocationId = Number(rows[0]?.service_location_id) || null;
  }
  if (!serviceLocationId && appt.clinicalSessionId) {
    const [rows] = await clinicalPool.execute(
      'SELECT service_location_id, place_of_service FROM clinical_sessions WHERE id = ? AND agency_id = ? LIMIT 1',
      [appt.clinicalSessionId, agencyId]);
    serviceLocationId = Number(rows[0]?.service_location_id) || null;
    placeOfService = rows[0]?.place_of_service || null;
  }
  const location = serviceLocationId ? await AgencyServiceLocation.findById(serviceLocationId) : null;
  if (serviceLocationId && (!location || Number(location.agency_id) !== agencyId)) {
    throw Object.assign(new Error('Appointment service location needs review'), { code: 'SERVICE_LOCATION_INVALID', status: 409 });
  }
  placeOfService = String(location?.place_of_service || placeOfService || '').padStart(2, '0');
  const isSchool = !!location?.school_organization_id || location?.location_kind === 'school' || placeOfService === '03';
  const isRemote = ['telehealth', 'virtual', 'video'].includes(String(appt.modality || '').toLowerCase());
  // Tutoring uses its actual physical office/room, independently of medical POS.
  let learningOffice=null;
  if (!location && !isRemote && ['tutoring','learning'].includes(String(appt.businessType).toLowerCase()) && Number(appt.officeLocationId)>0) {
    const [[office]]=await pool.execute(`SELECT o.id,o.name,r.id AS room_id,r.room_number,r.label AS room_label,r.name AS room_name
      FROM office_locations o LEFT JOIN office_rooms r ON r.id=? AND r.location_id=o.id
      WHERE o.id=? AND (o.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies oa WHERE oa.office_location_id=o.id AND oa.agency_id=?))`,[appt.roomId||null,appt.officeLocationId,agencyId,agencyId]);
    if(office && (!appt.roomId || Number(office.room_id)===Number(appt.roomId))) learningOffice=office;
  }
  const roomLabel=learningOffice?(learningOffice.room_label||learningOffice.room_name||(learningOffice.room_number?`Room ${learningOffice.room_number}`:null)):null;
  return {
    serviceLocationId,
    setting: isSchool ? 'school' : isRemote ? 'telehealth' : location || learningOffice ? 'in_person' : 'unknown',
    isSchool,
    locationLabel: location?.name || (learningOffice?[learningOffice.name,roomLabel].filter(Boolean).join(' · '):isSchool ? 'School' : isRemote ? 'Online' : 'Service location needs review'),
    physicalOfficeLocationId:learningOffice?Number(learningOffice.id):null,
    roomId:learningOffice?.room_id?Number(learningOffice.room_id):null,
    roomLabel,
    billingOfficeLocationId: Number(location?.billing_office_location_id || appt.officeLocationId) || null,
    requiresConfirmation: !isSchool
  };
}

export function formatAppointmentTime(appt) {
  const raw = appt.startAt;
  const value = String(raw || '').replace(' ', 'T');
  const date = raw instanceof Date ? raw : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return 'the scheduled time';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: appt.sourceTimezone || 'America/Denver',
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function buildSchoolReminder(appt) {
  return `${schoolAppointmentReminderText} Reply N to cancel this session. Continue to report school absences to the school as usual.`;
}
