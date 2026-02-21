/**
 * Audit Action Registry
 *
 * Canonical mapping of action_type (snake_case) to plain English labels and categories.
 * Used by Audit Center for display and filtering. Unknown actions are auto-expanded
 * via toPlainEnglish() so new log calls are automatically human-readable.
 */

/** @type {Record<string, { label: string; category: string }>} */
export const AUDIT_ACTION_REGISTRY = {
  // Authentication & Sessions
  login: { label: 'User logged in', category: 'Authentication' },
  logout: { label: 'User logged out', category: 'Authentication' },
  timeout: { label: 'Session timed out', category: 'Authentication' },
  password_change: { label: 'Password changed', category: 'Authentication' },
  password_reset_link_sent: { label: 'Password reset link sent', category: 'Authentication' },

  // Staff & User Management
  grant_payroll_access: { label: 'Payroll access granted', category: 'Staff' },
  revoke_payroll_access: { label: 'Payroll access revoked', category: 'Staff' },

  // Training & Onboarding
  module_start: { label: 'Module started', category: 'Training' },
  module_end: { label: 'Module ended', category: 'Training' },
  module_complete: { label: 'Module completed', category: 'Training' },
  reset_module: { label: 'Module reset by admin', category: 'Training' },
  reset_track: { label: 'Track reset by admin', category: 'Training' },
  mark_module_complete: { label: 'Module marked complete by admin', category: 'Training' },
  mark_track_complete: { label: 'Track marked complete by admin', category: 'Training' },
  intake_approval: { label: 'Intake approved', category: 'Training' },

  // Documents & Records
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

  // Client Access
  view_client: { label: 'Client record viewed', category: 'Client Access' },
  view_client_restricted: { label: 'Client record viewed with restrictions', category: 'Client Access' },
  view_client_notes: { label: 'Client notes viewed', category: 'Client Access' },
  create_client_note: { label: 'Client note created', category: 'Client Access' },

  // Communications
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

  // Support
  support_ticket_created: { label: 'Support ticket created', category: 'Support' },
  support_ticket_message: { label: 'Support ticket message sent', category: 'Support' },

  // Billing & Payroll
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

  // Office & Scheduling
  OFFICE_EVENT_DELETE_REQUESTED: { label: 'Office event delete requested', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_APPROVED: { label: 'Office event delete approved', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_DENIED: { label: 'Office event delete denied', category: 'Office & Scheduling' },
  OFFICE_EVENT_DELETE_EXECUTED: { label: 'Office event deleted', category: 'Office & Scheduling' },

  // AI & Tools
  note_aid_execute: { label: 'Note Aid used', category: 'AI & Tools' },
  agent_assist: { label: 'Focus Assistant used', category: 'AI & Tools' },
  agent_tool_execute: { label: 'Focus Assistant tool executed', category: 'AI & Tools' },

  // Tasks (if ever surfaced in audit)
  assigned: { label: 'Task assigned', category: 'Tasks' },
  updated: { label: 'Task updated', category: 'Tasks' },
  completed: { label: 'Task completed', category: 'Tasks' },
  overridden: { label: 'Task overridden', category: 'Tasks' },
  due_date_changed: { label: 'Task due date changed', category: 'Tasks' },
  reminder_sent: { label: 'Task reminder sent', category: 'Tasks' }
};

/** Ordered category list for display and grouping */
export const AUDIT_CATEGORIES = [
  'Authentication',
  'Staff',
  'Training',
  'Documents',
  'Client Access',
  'Communications',
  'Support',
  'Billing & Payroll',
  'Office & Scheduling',
  'AI & Tools',
  'Tasks',
  'Other'
];

/**
 * Convert snake_case or SCREAMING_SNAKE to plain English.
 * Handles unknown action types so new log calls are automatically readable.
 * @param {string} actionType - Raw action type (e.g. "password_reset_link_sent")
 * @returns {string} Plain English (e.g. "Password reset link sent")
 */
export function toPlainEnglish(actionType) {
  if (!actionType || typeof actionType !== 'string') return '';
  const key = String(actionType).trim();
  const entry = AUDIT_ACTION_REGISTRY[key];
  if (entry) return entry.label;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Get plain English label for an action type.
 * @param {string} actionType
 * @returns {string}
 */
export function getActionLabel(actionType) {
  return toPlainEnglish(actionType);
}

/**
 * Get category for an action type.
 * @param {string} actionType
 * @returns {string}
 */
export function getActionCategory(actionType) {
  if (!actionType || typeof actionType !== 'string') return 'Other';
  const key = String(actionType).trim();
  const entry = AUDIT_ACTION_REGISTRY[key];
  return entry?.category ?? 'Other';
}

/**
 * Build action options for filter dropdown: { value, label, category }
 * Sorted by category then label.
 */
export function getActionOptions() {
  const seen = new Set();
  const options = [];
  for (const cat of AUDIT_CATEGORIES) {
    for (const [value, { label, category }] of Object.entries(AUDIT_ACTION_REGISTRY)) {
      if (category !== cat || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label, category });
    }
  }
  // Add any from registry not yet in categories
  for (const [value, { label, category }] of Object.entries(AUDIT_ACTION_REGISTRY)) {
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label, category: category || 'Other' });
  }
  return options.sort((a, b) => {
    const ca = AUDIT_CATEGORIES.indexOf(a.category);
    const cb = AUDIT_CATEGORIES.indexOf(b.category);
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb);
    return a.label.localeCompare(b.label);
  });
}
