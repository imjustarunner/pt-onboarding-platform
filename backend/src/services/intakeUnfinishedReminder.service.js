/**
 * Unfinished Digital Enrollment Form reminders (24h / 72h / 7d) and reminder opt-out. Access expiry does not authorize record deletion.
 * Agreed drafts expire at 10 days; declined drafts expire at 12 hours. No emails when declined.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import Agency from '../models/Agency.model.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import { enrollmentMailBrand, renderPortalEmail } from './portalEmailBranding.service.js';

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
  if (!['started', 'consented'].includes(status) || submission.submitted_at) return false;
  if (submission.reminder_opt_out_at) return false;
  return true;
}

/** Live gate used before each reminder send — completed packets never get another email. */
export function isEnrollmentReminderSendEligible(submission, { now = Date.now() } = {}) {
  if (!isEnrollmentDraftEligible(submission)) return false;
  if (String(submission.reminder_consent_status || '') !== 'agreed') return false;
  if (!String(submission.session_token || '').trim()) return false;
  if (submission.draft_expires_at && new Date(submission.draft_expires_at).getTime() <= now) return false;
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

/** Legacy cleanup entry point: keep saved answers and uploads for records review. */
export async function purgeUnfinishedEnrollmentDraft() {
  return { ok: false, skipped: true, deleted: 0, recordsRetained: true, reason: 'records_retained' };
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
  await IntakeSubmission.updateById(id, { reminder_opt_out_at: new Date() });
  return { ok: true, remindersStopped: true, recordsRetained: true };
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

  // A prior send may have succeeded before its slot timestamp was saved.
  // An approval hold must also not produce another queued email each hour.
  const [previous] = await pool.execute(
    `SELECT delivery_status, sent_at FROM user_communications
     WHERE agency_id=? AND template_type=?
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.intakeSubmissionId'))=?
       AND delivery_status IN ('sent','delivered','pending')
     ORDER BY id DESC LIMIT 1`,
    [row.agency_id, `enrollment_unfinished_reminder_${slotKey}`, String(row.id)]
  );
  if (previous[0]) return previous[0].delivery_status === 'pending'
    ? { ok: false, queued: true }
    : { ok: true, sentAt: previous[0].sent_at };

  const agency = await Agency.findById(row.agency_id);
  const agencyName = String(agency?.official_name || agency?.name || 'Our team').trim();
  const firstName = String(row.reminder_first_name || row.signer_name || '').trim().split(/\s+/)[0] || 'there';
  const schoolName = String(row.school_official_name || row.school_name || '').trim();
  const resumeUrl = await buildEnrollmentSessionUrl(agency, row.public_key, row.session_token);

  // Keep the legacy token field and route for existing reminder opt-out links.
  let deleteUrl = `${buildPublicPortalBaseUrl(agency)}/api/public-intake/${encodeURIComponent(row.public_key)}/delete-data`;
  if (row.deletion_token_hash) {
    // The raw token cannot be recovered; this send replaces the previous opt-out token.
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
    `This is a reminder to finish your enrollment form when you have a few minutes. Your private enrollment link will expire on ${expiresLabel}. The link expiring does not delete saved records. Contact the agency to request access to or removal of records; some records must be kept under applicable requirements.`,
    '',
    `Continue your form: ${resumeUrl}`,
    '',
    `If the button or link does not work, copy and paste this address into your browser:`,
    resumeUrl,
    '',
    `Stop enrollment reminders: ${deleteUrl}`,
    '',
    `No other reminders will be sent after your third reminder or when this enrollment link expires.`,
    '',
    `Thank you,`,
    `${agencyName} Forms`
  ].join('\n');

  const html = `<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #10231f; max-width: 560px;">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>${escapeHtml(schoolLine)}</p>
  <p>This is a reminder to finish your enrollment form when you have a few minutes. Your private enrollment link will expire on <strong>${escapeHtml(expiresLabel)}</strong>. The link expiring does not delete saved records. Contact the agency to request access to or removal of records; some records must be kept under applicable requirements.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(resumeUrl)}" style="display:inline-block;background:#1f6b4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Continue your enrollment form</a>
  </p>
  <p style="font-size:13px;color:#4b5563;">If the button does not work, copy and paste this link into your browser:<br/>
  <a href="${escapeHtml(resumeUrl)}">${escapeHtml(resumeUrl)}</a></p>
  <p style="font-size:13px;margin-top:28px;">
    <a href="${escapeHtml(deleteUrl)}" style="color:#7f1d1d;">Stop enrollment reminders</a>
  </p>
  <p style="font-size:12px;color:#6b7280;">No other reminders will be sent after your third reminder or when this enrollment link expires.</p>
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
      html: renderPortalEmail({ brand: enrollmentMailBrand({
        agency, domain: String(identity.from_email || '').split('@')[1],
        school: !!row.school_organization_id || row.scope_type === 'school', clinicalOverride: false
      }), html }),
      templateType: `enrollment_unfinished_reminder_${slotKey}`,
      schoolOrganizationId: row.school_organization_id || null,
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

  const skipped = !!out?.skipped || !!out?.redirected;
  const success = !skipped && !out?.queued && !!(out?.id || out?.messageId);
  await logReminderEvent({
    submissionId: row.id,
    agencyId: row.agency_id,
    schoolOrganizationId: row.school_organization_id || null,
    reminderSlot: slotKey,
    status: success ? 'sent' : (out?.queued ? 'queued' : skipped ? 'skipped' : 'failed'),
    subject,
    toEmail: email,
    errorMessage: success ? null : (out?.error || out?.reason || 'send_failed')
  });

  if (!success) {
    if (out?.queued) return { ok: false, queued: true };
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
            school.name AS school_name,
            school.official_name AS school_official_name
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
       AND s.submitted_at IS NULL
       AND s.session_token IS NOT NULL
       AND (s.draft_expires_at IS NULL OR s.draft_expires_at > NOW())
       AND (
         CASE
           WHEN s.reminder_consent_at <= NOW() - INTERVAL 7 DAY THEN s.reminder_7d_sent_at IS NULL
           WHEN s.reminder_consent_at <= NOW() - INTERVAL 72 HOUR THEN s.reminder_72h_sent_at IS NULL AND s.reminder_7d_sent_at IS NULL
           WHEN s.reminder_consent_at <= NOW() - INTERVAL 24 HOUR THEN s.reminder_24h_sent_at IS NULL AND s.reminder_72h_sent_at IS NULL AND s.reminder_7d_sent_at IS NULL
           ELSE FALSE
         END
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
 * Hourly worker: send due reminders. Saved drafts are retained after access expires.
 */
export function dueEnrollmentReminderSlot(row, now = Date.now()) {
  const age = now - new Date(row.reminder_consent_at).getTime();
  // Only the latest due reminder is useful after downtime; never send a burst
  // of old reminders or return to earlier slots after a later one was sent.
  for (const slotKey of ['7d', '72h', '24h']) {
    const slot = REMINDER_SLOTS[slotKey];
    if (row[slot.column]) return null;
    if (age >= slot.ms) return slotKey;
  }
  return null;
}

async function runReminderTickLocked() {
  const pending = await listPendingReminderRows({ limit: 200 });
  const now = Date.now();

  for (const row of pending || []) {
    if (!row.agency_id || !row.session_token) continue;
    const consentAt = row.reminder_consent_at ? new Date(row.reminder_consent_at).getTime() : 0;
    if (!consentAt) continue;

    // Re-check live status before each send
    // eslint-disable-next-line no-await-in-loop
    const live = await IntakeSubmission.findById(row.id);
    if (!isEnrollmentReminderSendEligible(live, { now })) continue;
    const slotKey = dueEnrollmentReminderSlot(live, now);
    if (!slotKey) continue;

    // eslint-disable-next-line no-await-in-loop
    const identity = await resolvePreferredSenderIdentityForAgency({
      agencyId: row.agency_id,
      preferredKeys: ['forms', 'intake', 'school_intake', 'notifications'],
      templateType: 'enrollment_unfinished_reminder'
    }).catch(() => null);

    const slot = REMINDER_SLOTS[slotKey];
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await sendSlotReminder({ row: { ...row, ...live }, slotKey, identity });
      if (!result.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      await IntakeSubmission.updateById(row.id, { [slot.column]: result.sentAt || new Date() });
    } catch {
      /* ignore single failure; retry next tick */
    }
  }
}

export async function runUnfinishedEnrollmentReminderTick() {
  const connection = await pool.getConnection();
  let acquired = false;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?,0) AS acquired', ['unfinished-enrollment-reminders']);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) return;
    await runReminderTickLocked();
  } finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', ['unfinished-enrollment-reminders']); }
    finally { connection.release(); }
  }
}

export default {
  applyReminderConsent,
  purgeUnfinishedEnrollmentDraft,
  purgeByDeletionToken,
  runUnfinishedEnrollmentReminderTick,
  draftExpiryForConsent,
  isEnrollmentDraftEligible,
  isEnrollmentReminderSendEligible,
  REMINDER_AGREE_TTL_MS,
  REMINDER_DECLINE_TTL_MS
};
