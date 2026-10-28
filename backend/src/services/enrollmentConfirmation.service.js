import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import Agency from '../models/Agency.model.js';
import UserCommunication from '../models/UserCommunication.model.js';
import Task from '../models/Task.model.js';
import { ENROLLMENT_EMAIL_NOTICE_VERSION, getIntakeCommunicationChoices } from './intakeCommunicationChoices.service.js';
import { clientPortalInviteUrl, intakeClientPortal } from './clientPortalContext.service.js';

export const ENROLLMENT_CONFIRMATION_TYPE = 'enrollment_submission_confirmation';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const address = value => String(value || '').trim().toLowerCase();

export function enrollmentConfirmationContent({ portalLoginUrl = null } = {}) {
  const lines = ['We received your enrollment.',
    'Your submission is saved. Keep the confirmation page for your records. Your care team will review your next steps.',
    ...(portalLoginUrl ? ['You can sign in to your portal or request a password setup link from the sign-in page.', portalLoginUrl] : []),
    'Requested sign-in and password recovery emails remain available even when optional updates are off.'];
  return { templateType: ENROLLMENT_CONFIRMATION_TYPE, subject: 'Enrollment received', text: lines.join('\n\n'),
    html: lines.map(line => line === portalLoginUrl ? `<p><a href="${escape(line)}">Open portal</a></p>` : `<p>${escape(line)}</p>`).join(''), attachments: null };
}

function priorOutcome(row, content) {
  const sent = ['sent','delivered'].includes(row.delivery_status);
  const queued = row.delivery_status === 'pending';
  return { sent, queued, pendingApproval: queued, skipped: row.delivery_status === 'skipped',
    reason: row.error_message || (sent ? null : 'previous_delivery_attempt'), communicationId: row.id,
    id: sent ? row.external_message_id || `record:${row.id}` : null, deduplicated: true, content };
}

// One receipt per submission/recipient, including multi-child and concurrent finalization.
// A recorded failure is reviewed/retried deliberately, never resent by page refresh.
export async function sendEnrollmentReceiptOnce(message, send, deps = {}) {
  const db = deps.db || pool;
  const submissions = deps.submissions || IntakeSubmission;
  const communications = deps.communications || UserCommunication;
  const agencies = deps.agencies || Agency;
  const tasks = deps.tasks || Task;
  if (!message.intakeSubmissionId) return send(message);
  const submission = await submissions.findById(message.intakeSubmissionId);
  if (!submission || submission.status !== 'submitted' || address(submission.signer_email) !== address(message.to)) {
    throw new Error('The completed enrollment and its signer must match the confirmation.');
  }
  const cp = getIntakeCommunicationChoices(submission.intake_data);
  if (cp?.agencyId && Number(cp.agencyId) !== Number(message.agencyId)) throw new Error('The enrollment belongs to a different agency.');
  const modern = cp?.emailNoticeVersion === ENROLLMENT_EMAIL_NOTICE_VERSION && cp.signatureAccepted === true && !!cp.signedAt
    && Number(cp.agencyId) === Number(message.agencyId);
  let content = { templateType: message.templateType, subject: message.subject, text: message.text, html: message.html, attachments: message.attachments };
  if (modern) {
    const agency = await agencies.findById(message.agencyId);
    const portalLoginUrl = submission.guardian_user_id ? clientPortalInviteUrl({
      portal: intakeClientPortal(agency, { channel: message.enrollmentChannel, school: !!message.schoolOrganizationId }), existingAccount: true
    }) : null;
    content = enrollmentConfirmationContent({ portalLoginUrl });
  }
  const lock = `enrollment-receipt:${createHash('sha256').update(`${message.agencyId}:${submission.id}:${address(message.to)}`).digest('hex').slice(0,40)}`;
  const connection = await db.getConnection();
  let locked = false, receipt = null, delivered = null;
  try {
    const [[claim]] = await connection.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (!Number(claim?.acquired)) return { sent: false, queued: true, reason: 'confirmation_in_progress', content };
    locked = true;
    const [[prior]] = await connection.execute(`SELECT id,delivery_status,external_message_id,error_message FROM user_communications
      WHERE agency_id=? AND channel='email' AND recipient_address=?
        AND template_type IN ('intake_packet_completion','enrollment_submission_confirmation')
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId'))=? ORDER BY id DESC LIMIT 1`,
    [message.agencyId, message.to, String(submission.id)]);
    if (prior) return priorOutcome(prior, content);
    receipt = await communications.create({ agencyId: message.agencyId, clientId: message.clientId || submission.client_id,
      userId: submission.guardian_user_id || null, templateType: content.templateType, channel: 'email',
      subject: content.subject, body: content.html || content.text || '', recipientAddress: message.to,
      metadata: { intakeSubmissionId: submission.id, intakeLinkId: message.intakeLinkId || submission.intake_link_id, source: 'auto' } });
    if (modern && (cp.noAutomaticEmail || cp.alternativeContactInstructions || (cp.noRoutineCalls && cp.emailPreference === 'no' && cp.smsPreference === 'no' && cp.providerTextingOptIn !== 'yes'))) {
      const [[existingTask]] = await connection.execute("SELECT id FROM tasks WHERE assigned_to_agency_id=? AND source_ref_type='enrollment_contact_preferences' AND source_ref_id=? LIMIT 1", [message.agencyId, String(submission.id)]);
      if (!existingTask) await tasks.create({ taskType: 'custom', title: 'Review enrollment contact preferences',
        description: `Enrollment #${submission.id}; client #${message.clientId || submission.client_id || 'unlinked'}.\nAutomatic email: ${cp.noAutomaticEmail ? 'declined' : 'per preferences'}.\nRoutine calls: ${cp.noRoutineCalls ? 'declined' : 'not declined'}.\nReview the signed communication choices and agree on a safe contact method.\n${cp.alternativeContactInstructions || 'No alternate instructions provided.'}`,
        encryptDescription: true, assignedToAgencyId: message.agencyId, assignedToRole: 'support', urgency: 'high',
        sourceRefType: 'enrollment_contact_preferences', sourceRefId: String(submission.id),
        metadata: { clientId: message.clientId || submission.client_id, submissionId: submission.id }, categories: ['client'] });
    }
    let result;
    if (modern && cp.noAutomaticEmail) result = { sent: false, skipped: true, reason: 'enrollment_automatic_email_off' };
    else result = await send({ ...message, ...content, existingCommunicationId: receipt.id, preloggedReceipt: true });
    delivered = result;
    const status = result.sent ? 'sent' : result.queued || result.pendingApproval ? 'pending' : result.skipped ? 'skipped' : 'failed';
    // Transport metadata may be replaced when marked sent; keep the deduplication key.
    await connection.execute(`UPDATE user_communications SET delivery_status=?, error_message=?,
      metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.intakeSubmissionId',?,'$.intakeLinkId',?) WHERE id=? AND agency_id=?`,
    [status, result.reason || null, submission.id, message.intakeLinkId || submission.intake_link_id, receipt.id, message.agencyId]);
    return { ...result, communicationId: receipt.id, content };
  } catch (error) {
    // Provider acceptance is final even if updating our receipt is interrupted.
    // Keep the reserved record; never describe a known send as a failed delivery.
    if (delivered?.sent) {
      console.warn('[enrollment confirmation] Receipt update pending for communication', receipt.id);
      return { ...delivered, communicationId: receipt.id, content };
    }
    if (receipt?.id) {
      error.communicationId = receipt.id;
      await connection.execute("UPDATE user_communications SET delivery_status='failed',error_message=? WHERE id=? AND agency_id=?",
        [String(error.message || 'Confirmation not accepted').slice(0,500), receipt.id, message.agencyId]);
    }
    throw error;
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { connection.release(); }
  }
}
