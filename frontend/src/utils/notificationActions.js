export function notificationDestination(notification, { organizationSlug = null, role = null } = {}) {
  const n = notification || {};
  const base = organizationSlug ? `/${organizationSlug}` : '';
  const entityType = String(n.related_entity_type || '').toLowerCase();
  const entityId = Number(n.related_entity_id || 0);
  const adminLike = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(String(role || '').toLowerCase());

  if (n.type === 'support_ticket_created') return `${base}/tickets${entityId ? `?status=open&ticketId=${entityId}` : ''}`;
  if (n.type === 'support_ticket_forwarded_to_provider' && entityType === 'client' && entityId) {
    return { path: `${base}/dashboard`, query: { clientId: String(entityId) } };
  }
  if (entityType === 'client' && entityId && adminLike) {
    return { path: `${base}/admin/clients`, query: { clientId: String(entityId), ...(n.type === 'new_packet_uploaded' ? { tab: 'documents' } : {}) } };
  }
  if (n.type === 'company_event_registration_submitted' && entityId) return `${base}/skill-builders/event/${entityId}`;
  if (n.type === 'office_availability_request_pending') return `${base}/admin/office-approvals?agencyId=${n.agency_id}&tab=requests`;
  if (n.type === 'school_availability_request_pending') return `${base}/admin/availability-intake?agencyId=${n.agency_id}&tab=school`;
  if (['school_provider_availability_confirmed', 'school_provider_availability_updated', 'school_provider_slot_verification_completed'].includes(n.type)) {
    return `${base}/admin/availability-intake?agencyId=${n.agency_id}&tab=school`;
  }
  if (n.type.startsWith('office_schedule_') || n.type === 'office_availability_request_approved') return `${base}/buildings/schedule`;
  if (n.type === 'budget_expense_pending_approval' && entityId) return `${base}/admin/budget-management?tab=expenses&status=submitted&expenseId=${entityId}`;
  if (['unassigned_document_submitted', 'medical_records_release_submitted'].includes(n.type)) return `${base}/admin/unassigned-documents?agencyId=${n.agency_id}`;
  if (entityType === 'user' && n.user_id && adminLike) return `${base}/admin/users/${n.user_id}`;
  if (entityType === 'task' && n.user_id && adminLike) return `${base}/admin/users/${n.user_id}?tab=documents&taskId=${entityId || ''}`;
  if (n.user_id && adminLike) return `${base}/admin/users/${n.user_id}`;
  return null;
}

export function notificationPrimaryLabel(notification) {
  if (!notification) return null;
  if (notification.type === 'new_packet_uploaded') return 'Open packet';
  if (notification.type === 'company_event_registration_submitted') return 'Event portal';
  if (notification.type === 'support_ticket_created') return 'Open ticket';
  if (notification.type === 'office_availability_request_pending') return 'Review request';
  if (notificationDestination(notification)) return 'Open';
  return null;
}

export function notificationDismissPayload(notification) {
  return notification?._requires_follow_up_for_viewer
    ? { followUp: false, dismissed: true }
    : { dismissed: true };
}
