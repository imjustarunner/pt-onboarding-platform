/**
 * Audit Action Registry (backend)
 *
 * Canonical mapping of action_type to plain English labels and categories.
 * Mirrors frontend registry. Used for CSV export and any server-side display.
 * Unknown actions are auto-expanded via toPlainEnglish().
 */

const AUDIT_ACTION_REGISTRY = {
  login: { label: 'User logged in', category: 'Authentication' },
  logout: { label: 'User logged out', category: 'Authentication' },
  timeout: { label: 'Session timed out', category: 'Authentication' },
  password_change: { label: 'Password changed', category: 'Authentication' },
  password_reset_link_sent: { label: 'Password reset link sent', category: 'Authentication' },
  grant_payroll_access: { label: 'Payroll access granted', category: 'Staff' },
  revoke_payroll_access: { label: 'Payroll access revoked', category: 'Staff' },
  module_start: { label: 'Module started', category: 'Training' },
  module_end: { label: 'Module ended', category: 'Training' },
  module_complete: { label: 'Module completed', category: 'Training' },
  reset_module: { label: 'Module reset by admin', category: 'Training' },
  reset_track: { label: 'Track reset by admin', category: 'Training' },
  mark_module_complete: { label: 'Module marked complete by admin', category: 'Training' },
  mark_track_complete: { label: 'Track marked complete by admin', category: 'Training' },
  intake_approval: { label: 'Intake approved', category: 'Training' },
  admin_doc_deleted: { label: 'Admin document deleted', category: 'Documents' },
  admin_doc_restored: { label: 'Admin document restored', category: 'Documents' },
  admin_doc_legal_hold_set: { label: 'Admin document legal hold set', category: 'Documents' },
  admin_doc_legal_hold_released: { label: 'Admin document legal hold released', category: 'Documents' },
  clinical_note_deleted: { label: 'Clinical note deleted', category: 'Documents' },
  clinical_note_restored: { label: 'Clinical note restored', category: 'Documents' },
  clinical_note_legal_hold_set: { label: 'Clinical note legal hold set', category: 'Documents' },
  clinical_note_legal_hold_released: { label: 'Clinical note legal hold released', category: 'Documents' },
  clinical_claim_deleted: { label: 'Clinical claim deleted', category: 'Documents' },
  clinical_claim_restored: { label: 'Clinical claim restored', category: 'Documents' },
  clinical_claim_legal_hold_set: { label: 'Clinical claim legal hold set', category: 'Documents' },
  clinical_claim_legal_hold_released: { label: 'Clinical claim legal hold released', category: 'Documents' },
  clinical_document_deleted: { label: 'Clinical document deleted', category: 'Documents' },
  clinical_document_restored: { label: 'Clinical document restored', category: 'Documents' },
  clinical_document_legal_hold_set: { label: 'Clinical document legal hold set', category: 'Documents' },
  clinical_document_legal_hold_released: { label: 'Clinical document legal hold released', category: 'Documents' },
  uploaded: { label: 'Document uploaded', category: 'Documents' },
  downloaded: { label: 'Document downloaded', category: 'Documents' },
  view: { label: 'Document viewed', category: 'Documents' },
  exported_to_ehr: { label: 'Document exported to EHR', category: 'Documents' },
  removed: { label: 'Document removed', category: 'Documents' },
  view_client: { label: 'Client record viewed', category: 'Client Access' },
  view_client_restricted: { label: 'Client record viewed with restrictions', category: 'Client Access' },
  view_client_notes: { label: 'Client notes viewed', category: 'Client Access' },
  create_client_note: { label: 'Client note created', category: 'Client Access' },
  school_portal_roster_viewed: { label: 'School portal roster viewed', category: 'School Portal' },
  school_portal_comments_viewed: { label: 'School portal comments viewed', category: 'School Portal' },
  school_portal_comment_posted: { label: 'School portal comment posted', category: 'School Portal' },
  school_portal_waitlist_viewed: { label: 'School portal waitlist note viewed', category: 'School Portal' },
  school_portal_waitlist_updated: { label: 'School portal waitlist note updated', category: 'School Portal' },
  sms_sent: { label: 'SMS message sent', category: 'Communications' },
  sms_send_failed: { label: 'SMS send failed', category: 'Communications' },
  sms_inbound_received: { label: 'Inbound SMS received', category: 'Communications' },
  sms_opt_in: { label: 'SMS opt in', category: 'Communications' },
  sms_opt_out: { label: 'SMS opt out', category: 'Communications' },
  sms_thread_deleted: { label: 'SMS thread deleted', category: 'Communications' },
  sms_message_deleted: { label: 'SMS message deleted', category: 'Communications' },
  outbound_call_started: { label: 'Outbound call started', category: 'Communications' },
  outbound_call_failed: { label: 'Outbound call failed', category: 'Communications' },
  voicemail_listened: { label: 'Voicemail listened to', category: 'Communications' },
  support_ticket_created: { label: 'Support ticket created', category: 'Support' },
  support_ticket_message: { label: 'Support ticket message sent', category: 'Support' },
  payroll_write: { label: 'Payroll data written', category: 'Billing & Payroll' },
  BILLING_POLICY_PROFILE_PUBLISHED: { label: 'Billing policy profile published', category: 'Billing & Payroll' },
  BILLING_POLICY_RULE_UPSERTED: { label: 'Billing policy rule updated', category: 'Billing & Payroll' },
  BILLING_POLICY_ACTIVATED: { label: 'Billing policy activated', category: 'Billing & Payroll' },
  BILLING_POLICY_SERVICE_CODE_ACTIVATION_UPDATED: {
    label: 'Billing policy service code activation updated',
    category: 'Billing & Payroll'
  },
  BILLING_POLICY_INGESTION_UPLOADED: { label: 'Billing policy ingestion uploaded', category: 'Billing & Payroll' },
  BILLING_POLICY_CANDIDATE_REVIEWED: { label: 'Billing policy candidate reviewed', category: 'Billing & Payroll' },
  BILLING_POLICY_RULES_PUBLISHED: { label: 'Billing policy rules published', category: 'Billing & Payroll' },
  OFFICE_EVENT_DELETE_REQUESTED: { label: 'Office event delete requested', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_APPROVED: { label: 'Office event delete approved', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_DENIED: { label: 'Office event delete denied', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_EXECUTED: { label: 'Office event deleted', category: 'Office & Scheduling' },
  note_aid_execute: { label: 'Note Aid used', category: 'AI & Tools' },
  agent_assist: { label: 'Focus Assistant used', category: 'AI & Tools' },
  agent_tool_execute: { label: 'Focus Assistant tool executed', category: 'AI & Tools' },
  assigned: { label: 'Task assigned', category: 'Tasks' },
  updated: { label: 'Task updated', category: 'Tasks' },
  completed: { label: 'Task completed', category: 'Tasks' },
  overridden: { label: 'Task overridden', category: 'Tasks' },
  due_date_changed: { label: 'Task due date changed', category: 'Tasks' },
  reminder_sent: { label: 'Task reminder sent', category: 'Tasks' }
};

function toPlainEnglish(actionType) {
  if (!actionType || typeof actionType !== 'string') return '';
  const key = String(actionType).trim();
  const entry = AUDIT_ACTION_REGISTRY[key];
  if (entry) return entry.label;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getActionCategory(actionType) {
  if (!actionType || typeof actionType !== 'string') return 'Other';
  const entry = AUDIT_ACTION_REGISTRY[String(actionType).trim()];
  return entry?.category ?? 'Other';
}

function getActionTypesForCategory(category) {
  if (!category || typeof category !== 'string') return [];
  const cat = String(category).trim();
  return Object.entries(AUDIT_ACTION_REGISTRY)
    .filter(([, v]) => v.category === cat)
    .map(([k]) => k);
}

export default {
  getActionLabel: toPlainEnglish,
  getActionCategory,
  getActionTypesForCategory,
  AUDIT_ACTION_REGISTRY
};
