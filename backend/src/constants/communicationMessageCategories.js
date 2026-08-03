import { buildQualityIssueSqlClause } from '../services/communicationQualitySql.js';

/**
 * Message-type filters for Communications Center automation lists.
 * Each category maps to a server-side WHERE clause (not client-side filtering).
 */
export const COMMUNICATION_MESSAGE_CATEGORIES = [
  { key: 'roi', label: 'School ROI signing', group: 'School' },
  { key: 'roi_completion', label: 'School ROI completion', group: 'School' },
  { key: 'applications', label: 'Job applications', group: 'Hiring' },
  { key: 'onboarding', label: 'Onboarding & welcome', group: 'Hiring' },
  { key: 'intake', label: 'Intake & paperwork', group: 'Clients' },
  { key: 'client', label: 'Client notifications', group: 'Clients' },
  { key: 'events', label: 'Events & invitations', group: 'Programs' },
  { key: 'meetings', label: 'Meetings & sessions', group: 'Programs' },
  { key: 'reminders', label: 'Reminders & digests', group: 'Programs' },
  { key: 'triggers', label: 'Automated triggers', group: 'System' },
  { key: 'account', label: 'Password & account', group: 'System' },
  { key: 'manual', label: 'Manual / identity sends', group: 'System' },
  { key: 'transactional', label: 'Other transactional', group: 'System' },
  { key: 'quality', label: 'Quality issues', group: 'Review' }
];

export function appendCategoryFilter(category, where) {
  const cat = String(category || '').trim().toLowerCase();
  if (!cat || cat === 'all') return;

  if (cat === 'roi') {
    where.push(`(
      uc.template_type IN ('school_roi_signing', 'school_roi_release', 'smart_school_roi')
      OR uc.subject LIKE '%Release of Information%'
      OR uc.subject LIKE '%release of information%'
    )`);
    return;
  }
  if (cat === 'roi_completion') {
    where.push(`uc.template_type = 'school_roi_signer_completion'`);
    return;
  }
  if (cat === 'applications') {
    where.push(`(
      uc.template_type = 'job_application_received'
      OR uc.subject LIKE 'Application received%'
    )`);
    return;
  }
  if (cat === 'onboarding') {
    where.push(`uc.template_type IN (
      'welcome_active', 'pending_welcome', 'practitioner_packet_invite'
    )`);
    return;
  }
  if (cat === 'intake') {
    where.push(`uc.template_type IN ('intake', 'intake_packet_completion')`);
    return;
  }
  if (cat === 'client') {
    where.push(`uc.template_type IN ('client_assigned', 'school_portal_message')`);
    return;
  }
  if (cat === 'events') {
    where.push(`uc.template_type IN ('company_event_invitation', 'company_event_vote')`);
    return;
  }
  if (cat === 'meetings') {
    where.push(`uc.template_type IN (
      'discovery_session_invite', 'discovery_session_confirmed', 'meeting_join_reminder'
    )`);
    return;
  }
  if (cat === 'reminders') {
    where.push(`uc.template_type IN ('program_reminder', 'daily_digest')`);
    return;
  }
  if (cat === 'triggers') {
    where.push(`uc.template_type LIKE 'trigger:%'`);
    return;
  }
  if (cat === 'account') {
    where.push(`uc.template_type IN ('password_reset', 'admin_initiated_password_reset')`);
    return;
  }
  if (cat === 'manual') {
    where.push(`(
      uc.template_type IN ('manual', 'identity_send')
      OR JSON_UNQUOTE(JSON_EXTRACT(uc.metadata, '$.source')) = 'manual'
    )`);
    return;
  }
  if (cat === 'transactional') {
    where.push(`uc.template_type IN (
      'transactional_email', 'auto_email', 'system_email_test', 'manual'
    )`);
    return;
  }
  if (cat === 'quality') {
    where.push(buildQualityIssueSqlClause('uc'));
  }
}

export function getCategoryMeta(key) {
  return COMMUNICATION_MESSAGE_CATEGORIES.find((c) => c.key === key) || null;
}
