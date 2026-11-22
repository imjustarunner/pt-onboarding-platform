import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { formatRegisteredSms, smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { getSmsSender, isSmsSuppressed } from './smsCompliance.service.js';
import { tenantInterviewJoinUrl } from '../utils/tenantMeetingUrl.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

async function interviewSmsSender(agencyId) {
  let config;
  try { config = JSON.parse(process.env.PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON || '{}')?.[Number(agencyId)]; }
  catch { return null; }
  if (!config?.from || !config.brandId || !config.campaignId) return null;
  const sender = await getSmsSender(config.from).catch(() => null);
  const r = sender?.registration;
  if (!sender || Number(sender.agency_id) !== Number(agencyId) || validateSmsRegistration(r).length
    || (r.provider || 'vonage') !== 'vonage' || (r.purposes.length !== 1 || !r.purposes.includes('workforce')) || !/^plotline\b/i.test(r.brandName)
    || r.interviewOnly !== true || sender.campaign_id !== config.campaignId
    || r.brandId !== config.brandId || r.campaignId !== config.campaignId) return null;
  return sender;
}

export async function interviewSmsProgram(agencyId) {
  const sender = await interviewSmsSender(agencyId);
  return sender ? { available: true, script: interviewConsentScript(sender.registration) } : { available: false };
}

function interviewConsentScript({ brandName, termsUrl, privacyUrl }) {
  return `May ${brandName} text this mobile number about your interview, including reminders? Message and data rates may apply. Message frequency varies. Text HELP for help. Text STOP to opt-out. Terms: ${termsUrl}. Privacy: ${privacyUrl}. Texts are optional, and you can receive interview details by email. Do you agree?`;
}

export async function prepareInterviewSmsConsent(agencyId, input, actorId) {
  if (input == null) return null;
  const phone = normalizeSmsPhone(input.phone);
  if (!/^\+1\d{10}$/.test(phone || '') || input.verbalConsent !== true || !Number(actorId)) {
    throw Object.assign(new Error('Enter the confirmed US mobile number and attest that the candidate explicitly agreed.'), { status: 400 });
  }
  const sender = await interviewSmsSender(agencyId);
  if (!sender || await isSmsSuppressed(sender, phone)) {
    throw Object.assign(new Error('Interview texts are unavailable for this number. Use email or ask the candidate to contact People Operations.'), { status: 409 });
  }
  return { phone, numberId: sender.id, brandId: sender.registration.brandId, campaignId: sender.registration.campaignId, disclosure: interviewConsentScript(sender.registration), actorId };
}

export async function recordInterviewSmsConsent(db, interviewId, consent) {
  if (!consent) return;
  await db.execute(`INSERT INTO hiring_interview_sms_consents
    (interview_id, recorded_by_user_id, phone, number_id, brand_id, campaign_id, disclosure)
    VALUES (?,?,?,?,?,?,?)`, [interviewId, consent.actorId, consent.phone, consent.numberId, consent.brandId, consent.campaignId, consent.disclosure]);
}

async function latestConsent(interviewId) {
  const [[row]] = await pool.execute('SELECT * FROM hiring_interview_sms_consents WHERE interview_id=? ORDER BY id DESC LIMIT 1', [interviewId]);
  return row || null;
}

export async function interviewSmsCalendarSettings(interview) {
  const program = await interviewSmsProgram(interview.agency_id);
  if (!program.available) return { smsProgram: program, smsConsentStatus: null };
  const consent = await latestConsent(interview.id);
  return { smsProgram: program, smsConsentStatus: consent?.confirmation_status || null };
}

// Called by the shared SMS policy after the campaign and STOP checks.
export async function authorizeInterviewSms({ sender, phone, interviewId, confirmation, expectedStartAt }) {
  const approved = await interviewSmsSender(sender.agency_id);
  const consent = Number(interviewId) > 0 ? await latestConsent(interviewId) : null;
  if (!approved || Number(approved.id) !== Number(sender.id) || !consent || consent.phone !== phone
    || Number(consent.number_id) !== Number(sender.id) || consent.brand_id !== sender.registration.brandId
    || consent.campaign_id !== sender.registration.campaignId
    || consent.confirmation_status !== (confirmation ? 'sending' : 'sent')) {
    throw smsPolicyError('sms_interview_consent_required', 'A current Plotline interview text opt-in is required.');
  }
  const [[event]] = await pool.execute(`SELECT e.meeting_settings_json FROM hiring_interviews h
    JOIN provider_schedule_events e ON e.id=h.provider_schedule_event_id AND e.agency_id=h.agency_id
    LEFT JOIN meeting_participant_preferences p ON p.event_id=e.id AND p.user_id=h.candidate_user_id
    WHERE h.id=? AND h.agency_id=? AND e.status='ACTIVE' AND e.meeting_completed_at IS NULL
      AND h.status IN ('scheduled','in_progress') AND h.guest_access_ended_at IS NULL AND e.start_at > UTC_TIMESTAMP()
      AND COALESCE(p.rsvp,'pending')<>'declined' AND (? IS NULL OR e.start_at=?)`,
    [interviewId, sender.agency_id, expectedStartAt || null, expectedStartAt || null]);
  const settings = typeof event?.meeting_settings_json === 'string' ? JSON.parse(event.meeting_settings_json) : event?.meeting_settings_json;
  if (!settings?.interviewSmsReminders) throw smsPolicyError('sms_interview_reminders_disabled', 'Interview text reminders are turned off.');
}

async function sendInterviewText(interview, consent, body, { confirmation = false, expectedStartAt = null } = {}) {
  const sender = await interviewSmsSender(interview.agency_id);
  if (!sender || !consent) return { skipped: true };
  const { default: Vonage } = await import('./vonage.service.js');
  return Vonage.sendSms({
    purpose: 'workforce', staffNotificationKind: 'plotlineInterview', agencyId: interview.agency_id,
    interviewId: interview.id, interviewSmsConfirmation: confirmation, interviewSmsStartAt: expectedStartAt, to: consent.phone, from: sender.phone_number,
    body: formatRegisteredSms(body, sender.registration.brandName)
  });
}

export async function sendPendingInterviewSmsConfirmations() {
  if (!process.env.PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON) return;
  const [pending] = await pool.execute(`SELECT c.*,h.agency_id FROM hiring_interview_sms_consents c
    JOIN hiring_interviews h ON h.id=c.interview_id
    JOIN provider_schedule_events e ON e.id=h.provider_schedule_event_id AND e.agency_id=h.agency_id
    LEFT JOIN meeting_participant_preferences p ON p.event_id=e.id AND p.user_id=h.candidate_user_id
    WHERE c.confirmation_status='pending' AND e.start_at > UTC_TIMESTAMP() AND e.status='ACTIVE'
      AND e.meeting_completed_at IS NULL AND h.status IN ('scheduled','in_progress') AND h.guest_access_ended_at IS NULL
      AND COALESCE(p.rsvp,'pending')<>'declined' AND JSON_EXTRACT(e.meeting_settings_json,'$.interviewSmsReminders')=TRUE
      AND NOT EXISTS (SELECT 1 FROM hiring_interview_sms_consents newer WHERE newer.interview_id=c.interview_id AND newer.id>c.id)
    ORDER BY c.id LIMIT 50`);
  for (const consent of pending) {
    const sender = await interviewSmsSender(consent.agency_id);
    if (!sender) continue;
    const [claim] = await pool.execute("UPDATE hiring_interview_sms_consents SET confirmation_status='sending' WHERE id=? AND confirmation_status='pending'", [consent.id]);
    if (!claim.affectedRows) continue;
    let result;
    try {
      result = await sendInterviewText({ id: consent.interview_id, agency_id: consent.agency_id }, consent,
        'You signed up for interview reminders. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt-out.', { confirmation: true });
    } catch (error) {
      console.warn('[Plotline interview opt-in]', consent.id, error.code || 'delivery_failed');
    }
    await pool.execute('UPDATE hiring_interview_sms_consents SET confirmation_status=?, confirmation_message_id=? WHERE id=?',
      [result?.sid ? 'sent' : 'failed', result?.sid || null, consent.id]);
  }
}

export async function sendHiringInterviewSmsReminder(event, candidate) {
  const [[interview]] = await pool.execute(`SELECT id, agency_id, guest_join_token FROM hiring_interviews
    WHERE provider_schedule_event_id=? AND candidate_user_id=? AND status IN ('scheduled','in_progress') AND guest_access_ended_at IS NULL
    ORDER BY id DESC LIMIT 1`, [event.id, candidate.id]);
  if (!interview?.guest_join_token) return { skipped: true };
  const consent = await latestConsent(interview.id);
  if (consent?.confirmation_status !== 'sent') return { skipped: true };
  const zone = event.event_timezone || 'America/Denver';
  const time = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(parseUtcDate(event.start_at));
  const link = await tenantInterviewJoinUrl(interview.agency_id, interview.guest_join_token);
  return sendInterviewText(interview, consent, `Interview reminder for ${time} (${zone}). Join: ${link}. Reply HELP for help, STOP to opt-out.`, { expectedStartAt: event.start_at });
}
