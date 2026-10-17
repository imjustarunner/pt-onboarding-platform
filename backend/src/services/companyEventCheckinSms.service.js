import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { parseEventCheckinCommand } from '../utils/companyEventCheckin.js';
import { assertCompanyEventSmsCampaign } from '../utils/companyEventSms.js';
import { getSmsSender, isSmsSuppressed } from './smsCompliance.service.js';
import { isCompanyEventSmsMuted } from './companyEventSms.service.js';
import { getEmployeeEventParticipation, recordEmployeeEventParticipation } from './companyEventParticipation.service.js';

export async function handleCompanyEventCheckinInbound({ from, to, body, messageId }, {
  db = pool, now = new Date(), participation = getEmployeeEventParticipation, record = recordEmployeeEventParticipation
} = {}) {
  const command = parseEventCheckinCommand(body);
  if (!command) return null;
  let sender;
  try { sender = await getSmsSender(to); assertCompanyEventSmsCampaign(sender, 'staff', 'workforce'); }
  catch { return null; }
  const phone = normalizeSmsPhone(from);
  if (!phone || await isSmsSuppressed(sender, phone)) return { handled: true };
  const reply = responseMessage => ({ handled: true, agencyId: Number(sender.agency_id), purpose: 'workforce', responseMessage });
  const digits = phone.slice(1), local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  // A shared phone cannot identify an employee, even if only one received a reminder.
  const [members] = await db.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1 AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
      AND (REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?))`,
  [sender.agency_id, digits, local, digits, local, digits, local]);
  if (members.length !== 1) return reply('Please use the check-in link in your email and sign in to record your event time.');
  const [deliveries] = await db.execute(`SELECT d.*, t.code FROM company_event_sms_deliveries d
    JOIN company_event_sms_topics t ON t.company_event_id = d.company_event_id AND t.agency_id = d.agency_id
    WHERE d.agency_id = ? AND d.user_id = ? AND d.phone = ? AND d.from_number = ? AND d.campaign_id = ?
      AND d.dispatch_type = 'checkin_reminder' AND d.status IN ('sent', 'delivered')
      AND d.created_at >= DATE_SUB(?, INTERVAL 2 DAY) ORDER BY d.created_at DESC, d.id DESC`,
  [sender.agency_id, members[0].id, phone, sender.phone_number, sender.campaign_id, now]);
  const candidates = [], seen = new Set();
  for (const delivery of deliveries) {
    if (seen.has(Number(delivery.company_event_id)) || (command.code && String(delivery.code) !== command.code)) continue;
    seen.add(Number(delivery.company_event_id));
    if (await isCompanyEventSmsMuted(delivery.company_event_id, phone, db)) continue;
    try {
      const state = await participation({ eventId: delivery.company_event_id, userId: members[0].id, db, now });
      if (command.action === 'check-out' ? state.canCheckOut : state.assigned && state.isEventDay && (state.canCheckIn || state.clockedIn)) candidates.push({ delivery, state });
    } catch (error) { if (![403, 404].includes(error.status)) throw error; }
  }
  if (!candidates.length) return reply('No available event check-in was found. Use the event link in your email to review your assignment and time.');
  if (candidates.length > 1) return reply(`Which event? Reply ${command.action === 'check-in' ? 'CHECKIN' : 'CHECKOUT'} followed by its code: ${candidates.map(c => c.delivery.code).join(', ')}.`);
  const { delivery } = candidates[0];
  const result = { ...reply(''), eventId: Number(delivery.company_event_id) };
  try {
    const saved = await record({ eventId: delivery.company_event_id, userId: members[0].id, action: command.action, now,
      source: 'employee_event_sms', idempotencyKey: messageId || null });
    if (saved.alreadyProcessed) return { ...result, responseMessage: 'This check-in request was already recorded. Use your email event link to review your current time.' };
    return { ...result, responseMessage: command.action === 'check-in'
      ? 'Checked in. Reply CHECKOUT when your event work ends. Use your email event link to enter travel to and from at the Support Activity rate.'
      : 'Checked out. Your event time was saved. Use your email event link to enter return travel at the Support Activity rate.' };
  } catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return { ...result, responseMessage: `${error.message}. Use your email event link to review your time.` };
    throw error;
  }
}
