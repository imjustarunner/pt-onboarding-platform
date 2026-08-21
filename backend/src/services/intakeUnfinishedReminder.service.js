/**
 * Unfinished Digital Enrollment Form reminders (24h / 72h / 7d) and hard deletion.
 * Agreed drafts expire at 10 days; declined drafts expire at 12 hours. No emails when declined.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import Agency from '../models/Agency.model.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import StorageService from './storage.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';

export const REMINDER_AGREE_TTL_MS = 10 * 24 * 60 * 60 * 1000;
export const REMINDER_DECLINE_TTL_MS = 12 * 60 * 60 * 1000;
export const REMINDER_SLOTS = Object.freeze({
  '24h': { ms: 24 * 60 * 60 * 1000, column: 'reminder_24h_sent_at', subject: 'Reminder: Complete Your Enrollment Form' },
  '72h': { ms: 72 * 60 * 60 * 1000, column: 'reminder_72h_sent_at', subject: 'Friendly Reminder: Complete Your Enrollment Form' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, column: 'reminder_7d_sent_at', subject: 'Final Reminder: Please Complete Your Enrollment Form' }
});

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hashDeletionToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
}

export function mintDeletionToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashDeletionToken(raw) };
}

export function draftExpiryForConsent(status, fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate.getTime() : new Date(fromDate).getTime();
  const ttl = String(status) === 'agreed' ? REMINDER_AGREE_TTL_MS : REMINDER_DECLINE_TTL_MS;
  return new Date(base + ttl);
}

export function isEnrollmentDraftEligible(submission) {
  if (!submission) return false;
  const status = String(submission.status || '').toLowerCase();
  if (status === 'submitted') return false;
  if (submission.reminder_opt_out_at) return false;
  return true;
}

export async function buildEnrollmentSessionUrl(agency, publicKey, sessionToken) {
  const base = buildPublicPortalBaseUrl(agency);
  const key = String(publicKey || '').trim();
  const tok = String(sessionToken || '').trim();
  if (!key || !tok) return `${base}/intake/${encodeURIComponent(key || '')}`;
  return `${base}/intake/${encodeURIComponent(key)}?session=${encodeURIComponent(tok)}`;
}

export async function buildEnrollmentDeleteUrl(agency, publicKey, rawDeletionToken) {
  const base = buildPublicPortalBaseUrl(agency);
  const key = String(publicKey || '').trim();
  const tok = String(rawDeletionToken || '').trim();
  return `${base}/api/public-intake/${encodeURIComponent(key)}/delete-data?token=${encodeURIComponent(tok)}`;
}

async function resolveAgencyForSubmission(submissionId) {
  const [rows] = await pool.execute(
    `SELECT a.*, il.public_key, il.scope_type, il.organization_id AS link_organization_id,
            il.title AS link_title, il.inherits_office_master, il.inherits_school_master,
            school.name AS school_name
     FROM intake_submissions s
     INNER JOIN intake_links il ON il.id = s.intake_link_id
     LEFT JOIN agencies a ON a.id = (
       CASE
         WHEN il.scope_type = 'agency' THEN il.organization_id
         ELSE (
           SELECT af.agency_id FROM agency_schools af
           WHERE af.school_organization_id = il.organization_id AND af.is_active = 1
           ORDER BY af.id ASC LIMIT 1
         )
       END
     )
     LEFT JOIN agencies school ON school.id = COALESCE(
       s.school_organization_id,
       CASE WHEN il.scope_type IN ('school','program') THEN il.organization_id ELSE NULL END
     )
     WHERE s.id = ?
     LIMIT 1`,
    [submissionId]
  );
  return rows[0] || null;
}

export async function applyReminderConsent({
  submissionId,
  consentStatus,
  firstName = null,
  email = null,
  schoolOrganizationId = null
}) {
  const status = String(consentStatus || '').trim().toLowerCase() === 'agreed' ? 'agreed' : 'declined';
  const now = new Date();
  const draftExpiresAt = draftExpiryForConsent(status, now);
  const updates = {
    reminder_consent_status: status,
    reminder_consent_at: now,
    draft_expires_at: draftExpiresAt,
    retention_expires_at: draftExpiresAt
  };
  if (firstName) updates.reminder_first_name = String(firstName).trim().slice(0, 120);
  if (email) updates.signer_email = String(email).trim().toLowerCase();
  if (schoolOrganizationId) updates.school_organization_id = Number(schoolOrganizationId) || null;

  let rawDeletionToken = null;
  if (status === 'agreed') {
    const minted = mintDeletionToken();
    rawDeletionToken = minted.raw;
    updates.deletion_token_hash = minted.hash;
    updates.deletion_token_expires_at = draftExpiresAt;
  } else {
    updates.deletion_token_hash = null;
    updates.deletion_token_expires_at = null;
  }

  const row = await IntakeSubmission.updateById(submissionId, updates);
  return { submission: row, rawDeletionToken, draftExpiresAt, consentStatus: status };
}

async function logReminderEvent({
  submissionId,
  agencyId,
  schoolOrganizationId,
  reminderSlot,
  status,
  subject,
  toEmail,
  errorMessage = null
}) {
  const domain = String(toEmail || '').includes('@')
    ? String(toEmail).split('@').pop().toLowerCase()
    : null;
  await pool.execute(
    `INSERT INTO unfinished_form_reminder_events
     (intake_submission_id, agency_id, school_organization_id, reminder_slot, status, subject, to_email_domain, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      submissionId,
      agencyId,
      schoolOrganizationId || null,
      reminderSlot,
      status,
      subject || null,
      domain,
      errorMessage ? String(errorMessage).slice(0, 500) : null
    ]
  );
}

export async function recordAnonymousDeletionAudit({
  agencyId,
  schoolOrganizationId = null,
  scopeType = 'unknown',
  reason = 'user_opt_out'
}) {
  if (!agencyId) return;
  await pool.execute(
    `INSERT INTO unfinished_form_deletion_audits
     (agency_id, school_organization_id, scope_type, reason)
     VALUES (?, ?, ?, ?)`,
    [agencyId, schoolOrganizationId || null, String(scopeType || 'unknown').slice(0, 24), String(reason || 'user_opt_out').slice(0, 64)]
  );
}

async function purgeSubmissionUploads(submissionId) {
  try {
    const [rows] = await pool.execute(
      `SELECT storage_path, file_path, gcs_path FROM intake_submission_uploads WHERE intake_submission_id = ?`,
      [submissionId]
    ).catch(() => [[]]);
    for (const row of rows || []) {
      const key = row.storage_path || row.file_path || row.gcs_path;
      if (!key) continue;
      try {
        await StorageService.deleteObject(String(key).replace(/^\/+/, ''));
      } catch {
        /* ignore missing */
      }
    }
    await pool.execute(`DELETE FROM intake_submission_uploads WHERE intake_submission_id = ?`, [submissionId]).catch(() => null);
  } catch {
    /* table may not exist in older envs */
  }
}

/**
 * Hard-delete unfinished enrollment draft + uploads. Records anonymous audit only.
 */
export async function purgeUnfinishedEnrollmentDraft({
  submissionId,
  reason = 'user_opt_out',
  notifyAdmins = false
} = {}) {
  const id = Number(submissionId || 0);
  if (!id) return { ok: false, reason: 'missing_id' };
  const ctx = await resolveAgencyForSubmission(id);
  const submission = await IntakeSubmission.findById(id);
  if (!submission) return { ok: false, reason: 'not_found' };
  if (String(submission.status || '').toLowerCase() === 'submitted') {
    return { ok: false, reason: 'already_submitted' };
  }

  const agencyId = Number(ctx?.id || 0) || null;
  const schoolOrganizationId = Number(
    submission.school_organization_id || ctx?.link_organization_id || 0
  ) || null;
  const scopeType = String(ctx?.scope_type || '').toLowerCase() === 'school'
    || String(ctx?.scope_type || '').toLowerCase() === 'program'
    ? 'school'
    : (Number(ctx?.inherits_office_master) ? 'office' : (String(ctx?.scope_type) === 'agency' ? 'office' : 'unknown'));

  await purgeSubmissionUploads(id);
  await IntakeSubmission.deleteById(id);

  if (agencyId) {
    await recordAnonymousDeletionAudit({
      agencyId,
      schoolOrganizationId: scopeType === 'school' ? schoolOrganizationId : null,
      scopeType,
      reason
    });
  }

  if (notifyAdmins && agencyId && reason === 'user_opt_out') {
    const schoolBit = scopeType === 'school' && ctx?.school_name
      ? ` for ${ctx.school_name}`
      : (scopeType === 'school' ? ' for a school' : ' for an office enrollment packet');
    await createNotificationAndDispatch({
      type: 'unfinished_form_data_deleted',
      severity: 'info',
      title: 'Enrollment form data deleted by request',
      message: `Someone chose “Stop notifying me and delete all my data forever”${schoolBit}. No personal details were retained.`,
      audienceJson: {
        admin: true,
        clinicalPracticeAssistant: true,
        schoolStaff: false,
        supervisor: false,
        provider: false
      },
      userId: null,
      agencyId,
      relatedEntityType: 'agency',
      relatedEntityId: agencyId,
      actorSource: 'System'
    }).catch(() => null);
  }

  return { ok: true, agencyId, schoolOrganizationId, scopeType };
}

export async function purgeByDeletionToken({ publicKey, rawToken }) {
  const hash = hashDeletionToken(rawToken);
  if (!hash || !publicKey) return { ok: false, reason: 'invalid' };
  const [rows] = await pool.execute(
    `SELECT s.id
     FROM intake_submissions s
     INNER JOIN intake_links il ON il.id = s.intake_link_id
     WHERE il.public_key = ?
       AND s.deletion_token_hash = ?
       AND (s.deletion_token_expires_at IS NULL OR s.deletion_token_expires_at > NOW())
       AND LOWER(COALESCE(s.status,'')) <> 'submitted'
     LIMIT 1`,
    [String(publicKey).trim(), hash]
  );
  const id = Number(rows?.[0]?.id || 0);
  if (!id) return { ok: false, reason: 'not_found' };
  await IntakeSubmission.updateById(id, { reminder_opt_out_at: new Date() }).catch(() => null);
  return purgeUnfinishedEnrollmentDraft({ submissionId: id, reason: 'user_opt_out', notifyAdmins: true });
}

function formatExpiry(when) {
  try {
    return new Date(when).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(when || '');
  }
}

async function sendSlotReminder({ row, slotKey, identity }) {
  const slot = REMINDER_SLOTS[slotKey];
  if (!slot) return { ok: false };
  const email = String(row.signer_email || '').trim().toLowerCase();
  if (!email) return { ok: false, skipped: true, reason: 'no_email' };

  const agency = await Agency.findById(row.agency_id);
  const agencyName = String(agency?.name || agency?.official_name || 'Our team').trim();
  const firstName = String(row.reminder_first_name || row.signer_name || '').trim().split(/\s+/)[0] || 'there';
  const schoolName = String(row.school_name || '').trim();
  const resumeUrl = await buildEnrollmentSessionUrl(agency, row.public_key, row.session_token);

  // Mint a fresh deletion token for the email so old links stay valid until expiry.
  let deleteUrl = `${buildPublicPortalBaseUrl(agency)}/api/public-intake/${encodeURIComponent(row.public_key)}/delete-data`;
  if (row.deletion_token_hash) {
    // Re-use stored hash: we cannot recover raw token; mint a new one for this send.
    const minted = mintDeletionToken();
    await IntakeSubmission.updateById(row.id, {
      deletion_token_hash: minted.hash,
      deletion_token_expires_at: row.draft_expires_at || row.retention_expires_at
    });
    deleteUrl = await buildEnrollmentDeleteUrl(agency, row.public_key, minted.raw);
  }

  const expiresLabel = formatExpiry(row.draft_expires_at || row.retention_expires_at);
  const schoolLine = schoolName
    ? `You started a Digital Enrollment Packet with ${schoolName}.`
    : `You started a Client Enrollment Packet with ${agencyName}.`;

  const subject = slot.subject;
  const text = [
    `Hi ${firstName},`,
    '',
    schoolLine,
    '',
    `This is a reminder to finish your enrollment form when you have a few minutes. Your private, HIPAA-protected session will expire on ${expiresLabel}. After that, all information will be permanently deleted.`,
    '',
    `Continue your form: ${resumeUrl}`,
    '',
    `If the button or link does not work, copy and paste this address into your browser:`,
    resumeUrl,
    '',
    `Stop notifying me and delete all my data forever: ${deleteUrl}`,
    '',
    `No other reminders will be sent after your third reminder or after the 10-day deletion date.`,
    '',
    `Thank you,`,
    `${agencyName} Forms`
  ].join('\n');

  const html = `<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #10231f; max-width: 560px;">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>${escapeHtml(schoolLine)}</p>
  <p>This is a reminder to finish your enrollment form when you have a few minutes. Your private, HIPAA-protected session will expire on <strong>${escapeHtml(expiresLabel)}</strong>. After that, all information will be permanently deleted.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(resumeUrl)}" style="display:inline-block;background:#1f6b4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Continue your enrollment form</a>
  </p>
  <p style="font-size:13px;color:#4b5563;">If the button does not work, copy and paste this link into your browser:<br/>
  <a href="${escapeHtml(resumeUrl)}">${escapeHtml(resumeUrl)}</a></p>
  <p style="font-size:13px;margin-top:28px;">
    <a href="${escapeHtml(deleteUrl)}" style="color:#7f1d1d;">Stop notifying me and delete all my data forever</a>
  </p>
  <p style="font-size:12px;color:#6b7280;">No other reminders will be sent after your third reminder or after the 10-day deletion date.</p>
  <p>Thank you,<br/>${escapeHtml(agencyName)} Forms</p>
</div>`;

  if (!identity?.id) {
    await logReminderEvent({
      submissionId: row.id,
      agencyId: row.agency_id,
      schoolOrganizationId: row.school_organization_id || null,
      reminderSlot: slotKey,
      status: 'skipped',
      subject,
      toEmail: email,
      errorMessage: 'no_forms_sender_identity'
    });
    return { ok: false, skipped: true, reason: 'no_identity' };
  }

  let out;
  try {
    out = await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to: email,
      subject,
      text,
      html,
      templateType: `enrollment_unfinished_reminder_${slotKey}`,
      intakeSubmissionId: row.id,
      intakeLinkId: row.intake_link_id || null,
      linkUrl: resumeUrl
    });
  } catch (err) {
    await logReminderEvent({
      submissionId: row.id,
      agencyId: row.agency_id,
      schoolOrganizationId: row.school_organization_id || null,
      reminderSlot: slotKey,
      status: 'failed',
      subject,
      toEmail: email,
      errorMessage: err?.message || 'send_threw'
    });
    throw err;
  }

  const skipped = !!out?.skipped;
  const success = !skipped && !!(out?.id || out?.messageId || out?.ok);
  await logReminderEvent({
    submissionId: row.id,
    agencyId: row.agency_id,
    schoolOrganizationId: row.school_organization_id || null,
    reminderSlot: slotKey,
    status: success ? 'sent' : (skipped ? 'skipped' : 'failed'),
    subject,
    toEmail: email,
    errorMessage: success ? null : (out?.error || out?.reason || 'send_failed')
  });

  if (!success) {
    if (skipped) return { ok: false, skipped: true, reason: out?.reason || 'skipped' };
    throw new Error(out?.error || out?.reason || 'Reminder send failed');
  }
  return { ok: true };
}

export async function listPendingReminderRows({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const [rows] = await pool.query(
    `SELECT s.*,
            il.public_key,
            il.scope_type,
            il.organization_id AS link_organization_id,
            il.inherits_office_master,
            COALESCE(
              CASE WHEN il.scope_type = 'agency' THEN il.organization_id ELSE (
                SELECT af.agency_id FROM agency_schools af
                WHERE af.school_organization_id = il.organization_id AND af.is_active = 1
                ORDER BY af.id ASC LIMIT 1
              ) END
            ) AS agency_id,
            school.name AS school_name
     FROM intake_submissions s
     INNER JOIN intake_links il ON il.id = s.intake_link_id
     LEFT JOIN agencies school ON school.id = COALESCE(
       s.school_organization_id,
       CASE WHEN il.scope_type IN ('school','program') THEN il.organization_id ELSE NULL END
     )
     WHERE LOWER(COALESCE(s.status,'')) IN ('started','consented')
       AND s.reminder_consent_status = 'agreed'
       AND s.reminder_opt_out_at IS NULL
       AND s.reminder_consent_at IS NOT NULL
       AND (s.draft_expires_at IS NULL OR s.draft_expires_at > NOW())
       AND (
         s.reminder_24h_sent_at IS NULL
         OR s.reminder_72h_sent_at IS NULL
         OR s.reminder_7d_sent_at IS NULL
       )
     ORDER BY s.reminder_consent_at ASC, s.id ASC
     LIMIT ${safeLimit}`
  );
  return decryptIntakeSubmissionRows(rows);
}

export async function listExpiredEnrollmentDrafts({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const [rows] = await pool.query(
    `SELECT s.id
     FROM intake_submissions s
     WHERE LOWER(COALESCE(s.status,'')) IN ('started','consented')
       AND s.draft_expires_at IS NOT NULL
       AND s.draft_expires_at <= NOW()
     ORDER BY s.draft_expires_at ASC, s.id ASC
     LIMIT ${safeLimit}`
  );
  return rows;
}

/**
 * Hourly worker: send due reminders; purge expired unfinished drafts.
 */
export async function runUnfinishedEnrollmentReminderTick() {
  const expired = await listExpiredEnrollmentDrafts({ limit: 300 });
  for (const row of expired) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await purgeUnfinishedEnrollmentDraft({
        submissionId: row.id,
        reason: 'draft_expired',
        notifyAdmins: false
      });
    } catch {
      /* ignore single failure */
    }
  }

  const pending = await listPendingReminderRows({ limit: 200 });
  const now = Date.now();

  for (const row of pending || []) {
    if (!row.agency_id || !row.session_token) continue;
    const consentAt = row.reminder_consent_at ? new Date(row.reminder_consent_at).getTime() : 0;
    if (!consentAt) continue;
    const age = now - consentAt;

    // Re-check live status before each send
    // eslint-disable-next-line no-await-in-loop
    const live = await IntakeSubmission.findById(row.id);
    if (!live || String(live.status || '').toLowerCase() === 'submitted') continue;
    if (live.reminder_opt_out_at) continue;
    if (String(live.reminder_consent_status || '') !== 'agreed') continue;
    if (live.draft_expires_at && new Date(live.draft_expires_at).getTime() <= now) continue;

    // eslint-disable-next-line no-await-in-loop
    const identity = await resolvePreferredSenderIdentityForAgency({
      agencyId: row.agency_id,
      preferredKeys: ['forms', 'intake', 'school_intake', 'notifications'],
      templateType: 'enrollment_unfinished_reminder'
    }).catch(() => null);

    for (const slotKey of ['24h', '72h', '7d']) {
      const slot = REMINDER_SLOTS[slotKey];
      if (live[slot.column]) continue;
      if (age < slot.ms) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendSlotReminder({ row: { ...row, ...live }, slotKey, identity });
        // eslint-disable-next-line no-await-in-loop
        await IntakeSubmission.updateById(row.id, { [slot.column]: new Date() });
      } catch {
        /* ignore single failure; retry next tick */
      }
    }
  }
}

export default {
  applyReminderConsent,
  purgeUnfinishedEnrollmentDraft,
  purgeByDeletionToken,
  runUnfinishedEnrollmentReminderTick,
  draftExpiryForConsent,
  REMINDER_AGREE_TTL_MS,
  REMINDER_DECLINE_TTL_MS
};
