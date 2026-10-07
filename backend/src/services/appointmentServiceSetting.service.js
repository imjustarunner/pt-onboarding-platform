import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';

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
  return {
    serviceLocationId,
    setting: isSchool ? 'school' : isRemote ? 'telehealth' : location ? 'in_person' : 'unknown',
    isSchool,
    locationLabel: location?.name || (isSchool ? 'School' : isRemote ? 'Telehealth' : 'Service location needs review'),
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
  return `Reminder: A school visit is scheduled for ${formatAppointmentTime(appt)}. No confirmation is needed. If your child will be absent or plans change, please let our team know. Continue to report school absences to the school as usual.`;
}
