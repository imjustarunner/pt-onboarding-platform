import pool from '../config/database.js';

const hasOptOutInstruction = body => /\b(?:reply|text)\s+STOP\s+to\b|\bSTOP\s+to\s+(?:stop|opt[ -]?out)\b/i.test(String(body || ''));
const staffCampaign = registration => (registration?.provider || 'vonage') === 'vonage'
  && registration?.purposes?.length > 0 && registration.purposes.every(p => ['workforce', 'polling'].includes(p));

// Vonage recommends a campaign opt-out reminder at least monthly. Enrollment
// still sends the full welcome disclosures. Routine replies keep their short
// event/category instructions and never advance this successful-send clock.
export async function withStaffPollDisclosure({ sender, phone, body, reply = false }, db = pool) {
  if (!staffCampaign(sender.registration) || reply || hasOptOutInstruction(body)) return body;
  const [rows] = await db.execute(`SELECT last_sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) AS recent
    FROM sms_program_opt_out_notices WHERE scope_key = ? AND phone = ?`, [sender.scope, phone]);
  if (Number(rows[0]?.recent) === 1) return body;
  return `${body} Reply STOP to stop all staff texts; HELP for help.`;
}

export async function recordStaffSmsDisclosure(delivery, messageId, db = pool) {
  if (!messageId || !delivery.noticeScope || !staffCampaign(delivery.registration)
      || !['workforce', 'polling'].includes(delivery.purpose) || !hasOptOutInstruction(delivery.body)) return;
  await db.execute(`INSERT INTO sms_program_opt_out_notices (scope_key, phone, last_sent_at, provider_message_id)
    VALUES (?, ?, UTC_TIMESTAMP(), ?) ON DUPLICATE KEY UPDATE last_sent_at = UTC_TIMESTAMP(), provider_message_id = VALUES(provider_message_id)`,
  [delivery.noticeScope, delivery.to, messageId]);
}
