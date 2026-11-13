import { parseSmsKeyword, smsPolicyError, validateSmsRegistration } from './smsCompliancePolicy.js';
import { companyEventWhen } from './companyEventInvitationEmail.js';

export function shortPollReplyCode(value) {
  const code = String(value || '');
  if (!/^[1-9]\d{2,3}$/.test(code)) throw smsPolicyError('poll_reply_code_unavailable', 'A poll reply code of at most four characters is required.');
  return code;
}

export function assertCompanyEventSmsCampaign(sender, audience = 'staff', purpose = 'workforce') {
  if (!['staff', 'participant'].includes(audience)) throw smsPolicyError('event_sms_audience_invalid', 'Choose staff or enrolled participants');
  const purposes = sender?.registration?.purposes || [];
  if (validateSmsRegistration(sender?.registration).length) throw smsPolicyError('sms_campaign_not_ready', 'An approved and linked event sending number is required');
  const valid = audience === 'staff'
    ? ['polling', 'workforce'].includes(purpose) && purposes.includes('polling') && purposes.every(p => ['polling', 'workforce'].includes(p))
    : ['care', 'reminders'].includes(purpose) && !purposes.includes('polling') && purposes.some(p => ['care', 'reminders'].includes(p));
  if (!valid || !purposes.includes(purpose)) throw smsPolicyError('event_sms_campaign_mismatch', audience === 'staff'
    ? 'Employee and company event texts require Campaign 2: a dedicated staff notifications and polling sender'
    : 'Enrolled service event texts require Campaign 1: a service communications sender');
  return audience === 'staff' ? 2 : 1;
}

export function buildCompanyEventSms({ event, code, body, brandName, audience = 'staff', mode = 'message', purpose = 'workforce' }) {
  const title = String(event?.title || 'Event').trim();
  let text = String(body || '').trim();
  if (mode === 'rsvp_invitation') {
    const location = [event.event_location_name || event.eventLocationName, event.event_location_address || event.eventLocationAddress].filter(Boolean).join(' · ');
    const description = String(event.description || '').trim().replace(/\s+/g, ' ').slice(0, 240);
    text = [`You have been invited to ${title}.`, `${companyEventWhen(event)}.`, location, description,
      `Please RSVP by replying Yes ${code}, No ${code}, or Maybe ${code}.`,
      event.invitationPageUrl ? `Event details (no login needed): ${event.invitationPageUrl}` : '',
      event.potluck_enabled || event.potluckEnabled ? 'Potluck: sign in on the event page to choose or update what you’re bringing.' : ''].filter(Boolean).join('\n');
  }
  if (mode === 'recruitment') {
    let when = '';
    const start = new Date(event?.startsAt || event?.starts_at);
    const end = new Date(event?.endsAt || event?.ends_at);
    if (Number.isFinite(start.getTime())) {
      const timezone = event?.timezone || 'America/Denver';
      const date = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'long', day: 'numeric' }).format(start);
      const clock = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      when = `${date}, ${clock.format(start)}${Number.isFinite(end.getTime()) ? `–${clock.format(end)}` : ''}: `;
    }
    text = `Looking for help; ${when}${title}.${text ? ` ${text}` : ''} Reply Y to express interest (organizer approval required; this does not assign you). If replying about multiple events, reply Y ${code}.`;
    const base = String(process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
    const staffUrl = event?.staffPageUrl || (event?.staff_link_token && base ? `${base}/company-events/${Number(event.id)}/staff/${event.staff_link_token}` : null);
    if (staffUrl && /^https?:\/\//i.test(staffUrl)) text += ` Details, RSVP and check-in: ${staffUrl}`;
  }
  if (!text) throw smsPolicyError('sms_empty_body', 'An event message is required');
  if (audience === 'staff' && purpose === 'polling') {
    return `${text}\nReply ${shortPollReplyCode(code)} to turn off texts about this event. Reply NOPOLLS to stop poll texts only.`;
  }
  const program = audience === 'staff' ? `${brandName || 'Our organization'}'s Employee Texting` : `${brandName || 'Our organization'}'s Service Texting`;
  const mute = audience === 'staff' ? `Reply MUTE ${code} to turn off texts about this event only; this does not change your RSVP.` : `Reply ${code} to turn off texts about this event.`;
  return `${text}\n${mute} Reply STOP to opt out of ${program}. HELP for help. Msg & data rates may apply.`;
}

export function parseCompanyEventSmsCommand(body) {
  if (parseSmsKeyword(body)) return null;
  const text = String(body || '').trim().toUpperCase();
  const mute = text.match(/^MUTE\s+(\d{3,18})$/);
  if (mute) return { type: 'mute', code: mute[1], explicit: true };
  if (/^\d{3,18}$/.test(text)) return { type: 'mute', code: text };
  const reversed = text.match(/^(\d{3,18})\s*(Y|YES|N|NO|M|MAYBE)$/);
  const explicit = text.match(/^(Y|YES|N|NO|M|MAYBE)\s*(\d{3,18})$/) || (reversed && [reversed[0], reversed[2], reversed[1]]);
  if (explicit) return { type: 'interest', code: explicit[2], response: explicit[1][0] };
  if (/^(Y|YES|N|NO|M|MAYBE)$/.test(text)) return { type: 'interest', code: null, response: text[0] };
  return null;
}

export function selectCompanyEventSmsReply(deliveries, command) {
  const newest = new Map();
  for (const delivery of deliveries) if (!newest.has(Number(delivery.company_event_id))) newest.set(Number(delivery.company_event_id), delivery);
  const byEvent = [...newest.values()];
  if (command.code) return byEvent.find(d => String(d.code) === command.code) || null;
  if (byEvent.length > 1) return { ambiguous: true, codes: byEvent.map(d => String(d.code)) };
  return byEvent[0] || null;
}

export function normalizeCompanyEventDeliveryStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'delivered') return 'delivered';
  if (['rejected', 'failed', 'expired', 'undeliverable', 'deleted'].includes(value)) return 'failed';
  if (['accepted', 'submitted', 'buffered', 'sent'].includes(value)) return 'sent';
  return null;
}
