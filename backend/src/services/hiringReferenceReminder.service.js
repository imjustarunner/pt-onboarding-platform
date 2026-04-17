import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import { resolveHiringReferenceSenderIdentity } from './hiringReferenceIdentity.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import {
  buildReferenceFormUrl,
  buildPeopleOpsContactFooter,
  sendHiringReferenceOutboundEmail
} from './hiringReferenceRequests.service.js';
import { logHiringReferenceEvent } from './hiringReferenceActivity.service.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendReminderEmail({ row, label, identity }) {
  const email = String(row.reference_email || '').trim();
  if (!email) return;
  const agency = await Agency.findById(row.agency_id);
  const agencyName = String(agency?.name || agency?.official_name || 'Our organization').trim();
  const user = await User.findById(row.candidate_user_id);
  const cand = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'the applicant';
  const url = buildReferenceFormUrl(String(row.public_link_token || '').trim());
  const contactFooter = buildPeopleOpsContactFooter(agency);
  const subject = `${agencyName} — reminder: reference for ${cand} (${label})`;
  const text = [
    `Hello,`,
    '',
    `This is a friendly reminder to complete the confidential professional reference for ${cand}. We would appreciate it if you could submit the short form as soon as you are able (${label}).`,
    '',
    `It usually takes less than five minutes. Your answers remain confidential and are not shared with the applicant.`,
    '',
    `Open the form: ${url}`,
    '',
    contactFooter.text,
    '',
    'Thank you for your time and consideration,',
    agencyName
  ].join('\n');
  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <p>Hello,</p>
    <p>This is a friendly reminder to complete the confidential professional reference for <strong>${escapeHtml(cand)}</strong>. We would appreciate it if you could submit the short form as soon as you are able <span style="color:#555;">(${escapeHtml(label)})</span>.</p>
    <p>It usually takes <strong>less than five minutes</strong>. Your answers remain <strong>confidential</strong> and are not shared with the applicant.</p>
    <p><a href="${escapeHtml(url)}">Open reference form</a></p>
    ${contactFooter.html}
    <p style="margin-top:18px;">Thank you for your time and consideration,<br/>${escapeHtml(agencyName)}</p>
  </div>`;
  const openTok = String(row?.open_track_token || '').trim() || null;
  const out = await sendHiringReferenceOutboundEmail({
    identity,
    to: email,
    subject,
    text,
    html,
    openTrackToken: openTok
  });
  logHiringReferenceEvent({
    candidateUserId: row.candidate_user_id,
    agencyId: row.agency_id,
    kind: 'reference_reminder',
    hiringReferenceRequestId: row.id,
    referenceIndex: row.reference_index,
    referenceEmail: email,
    reminderLabel: label,
    to: email,
    subject,
    textBody: text,
    htmlBody: html,
    outcome: out.ok ? 'sent' : out.skipped ? 'skipped' : 'failed',
    skipReason: out.skipped ? out.reason : null,
    error: out.ok ? null : out.error || null,
    gmailMessageId: out.messageId || null
  });
  if (!out.ok) {
    const err = new Error(out.skipped ? `Reminder skipped (${out.reason})` : out.error || 'Reminder send failed');
    throw err;
  }
}

/**
 * Hourly worker: expire stale tokens; send one-shot T-3d and T-24h reminders (includes same link as initial invite).
 */
export async function runHiringReferenceReminderTick() {
  await HiringReferenceRequest.expireStaleRows();
  const rows = await HiringReferenceRequest.listPendingForReminders();
  const now = Date.now();

  for (const row of rows || []) {
    const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
    if (!exp || exp <= now) continue;

    const msToExpiry = exp - now;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // eslint-disable-next-line no-await-in-loop
    const identity = await resolveHiringReferenceSenderIdentity(row.agency_id);
    if (!identity?.id) continue;

    if (!row.reminder_3d_sent_at && msToExpiry <= threeDays) {
      try {
        await sendReminderEmail({ row, label: '3 days before expiry', identity });
        await HiringReferenceRequest.markReminder3d(row.id);
      } catch {
        // ignore single failure
      }
    }
    if (!row.reminder_24h_sent_at && msToExpiry <= oneDay) {
      try {
        await sendReminderEmail({ row, label: '24 hours before expiry', identity });
        await HiringReferenceRequest.markReminder24h(row.id);
      } catch {
        // ignore single failure
      }
    }
  }
}
