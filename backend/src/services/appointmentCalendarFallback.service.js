import pool from '../config/database.js';
import { visibleClinicalWork } from './clinicalWorkArchiveRead.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// An appointment remains visible if its optional calendar facet failed to save.
// The negative display ID is never a provider_schedule_events primary key.
export async function appointmentCalendarFallbacks({ providerId, agencyId, allAgencies = false, windowStart, windowEnd, canEdit = false }, db = pool) {
  const [rows] = await db.execute(`SELECT a.id,a.agency_id,a.provider_user_id,a.start_at,a.end_at,a.source_timezone,a.title,a.notes,a.status,a.modality,
    a.clinical_session_id,a.service_code,a.tenant_service_id,a.service_location_id,
    (SELECT CASE WHEN COUNT(DISTINCT p.client_id)=1 THEN MIN(p.client_id) ELSE NULL END FROM appointment_participants p WHERE p.appointment_id=a.id) AS client_id
    FROM appointments a LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id
    WHERE a.provider_user_id=? AND (?=1 OR a.agency_id=?) AND a.start_at<? AND a.end_at>?
      AND a.office_event_id IS NULL AND p.id IS NULL
      AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress','completed','no_show')`,
  [providerId, allAgencies ? 1 : 0, agencyId, windowEnd, windowStart]);
  const visible = await visibleClinicalWork(rows, { db, kind: 'appointment' });
  return visible.map(a => ({ id: -Number(a.id), appointmentId: Number(a.id), providerId: Number(a.provider_user_id), agencyId: Number(a.agency_id),
    kind: 'PERSONAL_EVENT', title: a.title || 'Client session', description: a.notes || null,
    startAt: parseUtcDate(a.start_at)?.toISOString(), endAt: parseUtcDate(a.end_at)?.toISOString(),
    timeZone: a.source_timezone || 'America/Denver', sourceTimezone: a.source_timezone || 'America/Denver', allDay: false, isPrivate: false,
    appointmentStatus: a.status, modality: a.modality, clinicalSessionId: Number(a.clinical_session_id) || null,
    serviceCode: a.service_code || null, tenantServiceId: Number(a.tenant_service_id) || null,
    serviceLocationId: Number(a.service_location_id) || null, clientId: Number(a.client_id) || null,
    canEdit, canReschedule: canEdit && ['scheduled','confirmed','client_confirmed'].includes(a.status) }));
}
