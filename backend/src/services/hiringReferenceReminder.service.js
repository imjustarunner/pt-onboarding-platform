import { brandedReferenceEmail } from './hiringReferenceEmail.service.js';
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
    `Deadline: ${new Date(row.token_expires_at).toUTCString()}`,
    '',
    contactFooter.text,
    '',
    'Thank you for your time and consideration,',
    agencyName
  ].join('\n');
  const html = brandedReferenceEmail({ agency, candidateName: cand, referenceName: row.reference_name, url, deadline: row.token_expires_at, footer: contactFooter.html, reminder: true });
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
 * Hourly worker: expire stale tokens; send one-shot 48-hour and T-24h reminders (includes same link as initial invite).
 */
export async function runHiringReferenceReminderTick() {
  await HiringReferenceRequest.expireStaleRows();
  const rows = await HiringReferenceRequest.listPendingForReminders();
  const now = Date.now();

  for (const row of rows || []) {
    const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
    if (!exp || exp <= now) continue;

    const msToExpiry = exp - now;
    const sinceSent = now - new Date(row.sent_at).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    // eslint-disable-next-line no-await-in-loop
    const identity = await resolveHiringReferenceSenderIdentity(row.agency_id);
    if (!identity?.id) continue;

    if (!row.reminder_48h_sent_at && sinceSent >= 48 * 60 * 60 * 1000) {
      try {
        await sendReminderEmail({ row, label: '48-hour follow-up', identity });
        await HiringReferenceRequest.markReminder48h(row.id);
      } catch {
        // ignore single failure
      }
    }
    else if (!row.reminder_24h_sent_at && msToExpiry <= oneDay) {
      try {
        await sendReminderEmail({ row, label: '24 hours before expiry', identity });
        await HiringReferenceRequest.markReminder24h(row.id);
      } catch {
        // ignore single failure
      }
    }
  }
}
