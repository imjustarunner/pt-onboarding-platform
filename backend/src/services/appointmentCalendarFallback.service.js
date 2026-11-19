import { appointmentAttendanceView, appointmentServiceLabel, isLearningAppointment } from '../utils/appointmentPresentation.js';
import pool from '../config/database.js';
import { visibleClinicalWork } from './clinicalWorkArchiveRead.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { canonicalAppointmentWindow } from '../utils/canonicalAppointmentWindow.js';

// An appointment remains visible if its optional calendar facet failed to save.
// The negative display ID is never a provider_schedule_events primary key.
export async function appointmentCalendarFallbacks({ providerId, agencyId, allAgencies = false, windowStart, windowEnd, canEdit = false, canSeePrivateTitle = false, existingEventIds = [], existingOfficeIds = [] }, db = pool) {
  const [rows] = await db.execute(`SELECT a.id,a.agency_id,a.provider_user_id,a.start_at,a.end_at,a.source_timezone,a.title,a.notes,a.status,a.modality,a.business_type,a.learning_context_json,ls.status AS learning_status,ls.actual_started_at,ls.actual_ended_at,
    a.clinical_session_id,a.service_code,a.tenant_service_id,a.service_location_id,a.office_event_id,a.office_location_id,a.room_id,a.provider_schedule_event_id,
    p.id AS calendar_event_id,p.is_private,p.start_at AS calendar_start_at,p.end_at AS calendar_end_at,
    o.start_at AS office_start_at,o.end_at AS office_end_at,
    (SELECT CASE WHEN COUNT(DISTINCT p.client_id)=1 THEN MIN(p.client_id) ELSE NULL END FROM appointment_participants p WHERE p.appointment_id=a.id) AS client_id
    FROM appointments a LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id
    LEFT JOIN office_events o ON o.id=a.office_event_id
    LEFT JOIN tutoring_appointment_sessions tb ON tb.appointment_id=a.id
    LEFT JOIN learning_class_sessions ls ON ls.id=tb.session_id AND ls.provider_user_id=a.provider_user_id
      AND EXISTS(SELECT 1 FROM learning_program_classes lc WHERE lc.id=ls.learning_class_id AND lc.organization_id=a.agency_id)
    WHERE a.provider_user_id=? AND (?=1 OR a.agency_id=?) AND a.start_at<? AND a.end_at>?
      AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress','completed','no_show','no_show_pending','late_canceled','canceled','canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization','rescheduled','voided')`,
  [providerId, allAgencies ? 1 : 0, agencyId, windowEnd, windowStart]);
  const representedEvents = new Set(existingEventIds.map(Number).filter(id=>id>0)), representedOffices = new Set(existingOfficeIds.map(Number).filter(id=>id>0));
  const missing = rows.filter(a => !representedEvents.has(Number(a.calendar_event_id)) && !representedOffices.has(Number(a.office_event_id)));
  const visible = await visibleClinicalWork(missing, { db, kind: 'appointment' });
  return visible.map(a => {
    const outcome=appointmentAttendanceView({...a,endAt:a.end_at},{learningSession:{
      status:a.learning_status,actual_started_at:a.actual_started_at,actual_ended_at:a.actual_ended_at
    }});
    const learning=isLearningAppointment(a);
    const locked=['completed','ended','in_progress','no_show','no_show_pending','late_canceled','canceled',
      'canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization','rescheduled','voided'].includes(outcome.status);
    return canonicalAppointmentWindow({ id: Number(a.calendar_event_id) || -Number(a.id), appointmentId: Number(a.id), providerId: Number(a.provider_user_id), agencyId: Number(a.agency_id),
    kind: 'PERSONAL_EVENT', canonicalOutcome:learning&&locked, title: Number(a.is_private) && !canSeePrivateTitle ? 'Busy' : (learning?appointmentServiceLabel(a):a.title || 'Client session'), description: Number(a.is_private) && !canSeePrivateTitle ? null : a.notes || null,
    startAt: parseUtcDate(a.calendar_start_at || a.office_start_at || a.start_at)?.toISOString(), endAt: parseUtcDate(a.calendar_end_at || a.office_end_at || a.end_at)?.toISOString(),
    timeZone: a.source_timezone || 'America/Denver', sourceTimezone: a.source_timezone || 'America/Denver', allDay: false, isPrivate: !!Number(a.is_private),
    appointmentStatus: outcome.status,
    businessType:a.business_type,
    isMissed: outcome.status==='no_show',
    isCancelled: /^cancel|late_cancel/.test(outcome.status),
    modality: a.modality, clinicalSessionId: Number(a.clinical_session_id) || null,
    serviceCode: a.service_code || null, tenantServiceId: Number(a.tenant_service_id) || null,
    serviceLocationId: Number(a.service_location_id) || null, clientId: Number(a.client_id) || null,
    officeEventId:Number(a.office_event_id)||null,officeLocationId:Number(a.office_location_id)||null,roomId:Number(a.room_id)||null,
    canEdit:canEdit&&!locked, ...(locked?{draggable:false}:{}),
    canReschedule: canEdit && !locked && ['scheduled','confirmed','client_confirmed'].includes(a.status) },
    {startAt:a.start_at,endAt:a.end_at,sourceTimezone:a.source_timezone || 'America/Denver'},
    {reservation:!a.calendar_event_id && !!a.office_event_id});
  });
}
