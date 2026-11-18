const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

/** Keep canonical clinical context when projecting a calendar event into a cell. */
export function scheduleAppointmentContext(event = {}) {
  return {
    appointmentId: id(event.appointmentId ?? event.appointment_id),
    clinicalSessionId: id(event.clinicalSessionId ?? event.clinical_session_id),
    clinicalNoteId: id(event.clinicalNoteId ?? event.clinical_note_id),
    officeEventId: id(event.officeEventId ?? event.office_event_id),
    clientId: id(event.clientId ?? event.client_id),
    tenantServiceId: id(event.tenantServiceId ?? event.tenant_service_id),
    serviceLocationId: id(event.serviceLocationId ?? event.service_location_id),
    schoolOrganizationId: id(event.schoolOrganizationId ?? event.school_organization_id ?? event.schoolOrgId ?? event.school_org_id),
    serviceCode: String(event.serviceCode ?? event.service_code ?? '').trim(),
    businessType: String(event.businessType ?? event.business_type ?? '').trim(),
    learningContext:event.learningContext||null,
    ...(event.calendarTimingMismatch?{calendarStartAt:event.calendarStartAt,calendarEndAt:event.calendarEndAt,
      calendarTimingMismatch:true,calendarMirrorKind:event.calendarMirrorKind||null}:{}),
    modality: String(event.modality || '').trim(),
    appointmentStatus: String(event.appointmentStatus ?? event.appointment_status ?? '').trim().toLowerCase() || null
  };
}
