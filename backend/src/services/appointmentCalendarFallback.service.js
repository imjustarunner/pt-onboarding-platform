import pool from '../config/database.js';
import { visibleClinicalWork } from './clinicalWorkArchiveRead.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { canonicalAppointmentWindow } from '../utils/canonicalAppointmentWindow.js';

// An appointment remains visible if its optional calendar facet failed to save.
// The negative display ID is never a provider_schedule_events primary key.
export async function appointmentCalendarFallbacks({ providerId, agencyId, allAgencies = false, windowStart, windowEnd, canEdit = false, canSeePrivateTitle = false, existingEventIds = [], existingOfficeIds = [] }, db = pool) {
  const [rows] = await db.execute(`SELECT a.id,a.agency_id,a.provider_user_id,a.start_at,a.end_at,a.source_timezone,a.title,a.notes,a.status,a.modality,
    a.clinical_session_id,a.service_code,a.tenant_service_id,a.service_location_id,a.office_event_id,a.office_location_id,a.room_id,a.provider_schedule_event_id,
    p.id AS calendar_event_id,p.is_private,p.start_at AS calendar_start_at,p.end_at AS calendar_end_at,
    o.start_at AS office_start_at,o.end_at AS office_end_at,
    (SELECT CASE WHEN COUNT(DISTINCT p.client_id)=1 THEN MIN(p.client_id) ELSE NULL END FROM appointment_participants p WHERE p.appointment_id=a.id) AS client_id
    FROM appointments a LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id
    LEFT JOIN office_events o ON o.id=a.office_event_id
    WHERE a.provider_user_id=? AND (?=1 OR a.agency_id=?) AND a.start_at<? AND a.end_at>?
      AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress','completed','no_show')`,
  [providerId, allAgencies ? 1 : 0, agencyId, windowEnd, windowStart]);
  const representedEvents = new Set(existingEventIds.map(Number).filter(id=>id>0)), representedOffices = new Set(existingOfficeIds.map(Number).filter(id=>id>0));
  const missing = rows.filter(a => !representedEvents.has(Number(a.calendar_event_id)) && !representedOffices.has(Number(a.office_event_id)));
  const visible = await visibleClinicalWork(missing, { db, kind: 'appointment' });
  return visible.map(a => canonicalAppointmentWindow({ id: Number(a.calendar_event_id) || -Number(a.id), appointmentId: Number(a.id), providerId: Number(a.provider_user_id), agencyId: Number(a.agency_id),
    kind: 'PERSONAL_EVENT', title: Number(a.is_private) && !canSeePrivateTitle ? 'Busy' : a.title || 'Client session', description: Number(a.is_private) && !canSeePrivateTitle ? null : a.notes || null,
    startAt: parseUtcDate(a.calendar_start_at || a.office_start_at || a.start_at)?.toISOString(), endAt: parseUtcDate(a.calendar_end_at || a.office_end_at || a.end_at)?.toISOString(),
    timeZone: a.source_timezone || 'America/Denver', sourceTimezone: a.source_timezone || 'America/Denver', allDay: false, isPrivate: !!Number(a.is_private),
    appointmentStatus: a.status, modality: a.modality, clinicalSessionId: Number(a.clinical_session_id) || null,
    serviceCode: a.service_code || null, tenantServiceId: Number(a.tenant_service_id) || null,
    serviceLocationId: Number(a.service_location_id) || null, clientId: Number(a.client_id) || null,
    officeEventId:Number(a.office_event_id)||null,officeLocationId:Number(a.office_location_id)||null,roomId:Number(a.room_id)||null,
    canEdit, canReschedule: canEdit && ['scheduled','confirmed','client_confirmed'].includes(a.status) },
    {startAt:a.start_at,endAt:a.end_at,sourceTimezone:a.source_timezone || 'America/Denver'},
    {reservation:!a.calendar_event_id && !!a.office_event_id}));
}
