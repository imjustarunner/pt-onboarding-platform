import { sendEnrollmentReceiptOnce } from './enrollmentConfirmation.service.js';
import { sendEnrollmentPortalEmail } from './enrollmentPortalEmail.service.js';
import pool from '../config/database.js';

// Read the transport receipt, never a status supplied in intake form answers.
export async function readPacketCompletionDelivery(submissionId, agencyId, db = pool) {
  const [[row]] = await db.execute(`SELECT delivery_status,error_message,template_type FROM user_communications
    WHERE agency_id=? AND channel='email' AND template_type IN ('intake_packet_completion','enrollment_submission_confirmation')
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId'))=?
    ORDER BY id DESC LIMIT 1`, [Number(agencyId), String(submissionId)]);
  if (!row) return null;
  return { attempted: true, sent: ['sent','delivered'].includes(row.delivery_status), status: row.delivery_status, reason: row.error_message || null, essentialConfirmation: row.template_type === 'enrollment_submission_confirmation' };
}

/** Receipt mail belongs to the caring tenant, never an arbitrary school member's inbox. */
export async function sendPacketCompletionNotification({ agencyId, organizationId, scopeType, source = 'auto', ...message }) {
  const tenantId = Number(agencyId || (String(scopeType || '').toLowerCase() !== 'school' ? organizationId : 0));
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw Object.assign(new Error('A tenant is required to send the packet confirmation.'), { code: 'INTAKE_NOTIFICATION_TENANT_REQUIRED' });
  }
  return sendEnrollmentReceiptOnce({
    ...message,
    agencyId: tenantId,
    schoolOrganizationId: String(scopeType || '').toLowerCase() === 'school' ? organizationId : null,
    source,
    templateType: message.templateType || 'intake_packet_completion'
  }, sendEnrollmentPortalEmail);
}
