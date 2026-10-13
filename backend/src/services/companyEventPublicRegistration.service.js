import crypto from 'node:crypto';
import pool from '../config/database.js';
import { assertEventRegistrationOpen, readEventOperations } from '../utils/companyEventOperations.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status, statusCode: status });
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
export function validatePublicEventRegistration(body = {}) {
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const response = String(body.response || '').toLowerCase();
  const guestCount = Number(body.guestCount ?? 1);
  const phoneRaw = String(body.phone || '').trim();
  const digits = phoneRaw.replace(/\D/g, '');
  const phone = !digits ? null : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  if (!firstName || firstName.length > 100 || lastName.length > 100) throw fail('Enter your name (100 characters or fewer per field)');
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Enter a valid email address');
  if (!['yes','no','maybe'].includes(response)) throw fail('Choose yes, no, or maybe');
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100) throw fail('Guest count must be between 1 and 100');
  if (phone && !/^\+[1-9]\d{9,14}$/.test(phone)) throw fail('Enter a valid phone number with country code');
  if (body.smsConsent !== undefined && typeof body.smsConsent !== 'boolean') throw fail('SMS consent must be an explicit checkbox value');
  if (body.smsConsent && !phone) throw fail('Enter a mobile number to request event texts');
  const dietaryNotes = String(body.dietaryNotes || '').trim();
  const notes = String(body.notes || '').trim();
  if (dietaryNotes.length > 2000 || notes.length > 4000) throw fail('Please shorten your registration notes');
  return { firstName, lastName, email, response, guestCount, phone, dietaryNotes, notes, smsConsent: body.smsConsent === true };
}

/** An anonymous registration never writes to a staff account or staffing assignment. */
export async function registerPublicEventGuest({ eventId, body, consentDetails = null }) {
  const input = validatePublicEventRegistration(body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Serialize registrations for this event, including need-list claims and duplicate emails.
    const [events] = await conn.execute('SELECT * FROM company_events WHERE id = ? FOR UPDATE', [eventId]);
    const event = events[0];
    assertEventRegistrationOpen(event);
    if (input.smsConsent && (!readEventOperations(event).attendeeSmsEnabled || !consentDetails?.enabled)) throw fail('Text registration is not enabled for this event');
    const [existing] = await conn.execute('SELECT id, management_token_hash, checked_in_at, checked_out_at FROM company_event_guest_registrations WHERE company_event_id = ? AND LOWER(email) = ? LIMIT 1', [eventId, input.email]);
    const previous = existing[0];
    const suppliedToken = String(body.managementToken || '');
    if (previous && (!previous.management_token_hash || !suppliedToken || hash(suppliedToken) !== previous.management_token_hash)) {
      throw fail('A registration already exists for these details. Use the browser you registered with, or contact the event coordinator to change it.', 409);
    }
    const managementToken = previous ? suppliedToken : crypto.randomBytes(32).toString('hex');
    const consent = input.smsConsent ? JSON.stringify({
      optedIn: true, status: 'pending_review', recordedAt: new Date().toISOString(),
      source: 'event_registration', eventId, phone: input.phone,
      disclosure: consentDetails?.disclosure || '', programKey: consentDetails?.programKey || null
    }) : body.smsConsent === false ? JSON.stringify({ optedIn: false, recordedAt: new Date().toISOString(), source: 'event_registration', eventId, phone: input.phone }) : null;
    let guestRegistrationId = previous?.id;
    if (previous) {
      await conn.execute(`UPDATE company_event_guest_registrations SET first_name = ?, last_name = ?, response = ?, guest_count = ?,
        dietary_notes = ?, notes = ?, phone = ?, sms_consent_json = COALESCE(?, sms_consent_json) WHERE id = ?`,
      [input.firstName, input.lastName, input.response, input.guestCount, input.dietaryNotes || null, input.notes || null, input.phone, consent, previous.id]);
    } else {
      const [created] = await conn.execute(`INSERT INTO company_event_guest_registrations
        (company_event_id, agency_id, first_name, last_name, email, phone, response, guest_count, dietary_notes, notes, management_token_hash, sms_consent_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, event.agency_id, input.firstName, input.lastName, input.email, input.phone, input.response, input.guestCount, input.dietaryNotes || null, input.notes || null, hash(managementToken), consent]);
      guestRegistrationId = created.insertId;
    }
    if (event.potluck_enabled) {
      const [items] = await conn.execute('SELECT * FROM company_event_need_list_items WHERE company_event_id = ? AND agency_id = ? FOR UPDATE', [eventId, event.agency_id]);
      const own = (item) => String(item.claimed_by_guest_email || '').toLowerCase() === input.email;
      const available = (items || []).filter(item => !item.claimed_by_user_id && (!item.claimed_by_guest_email || own(item)));
      const selected = available.find(item => Number(item.id) === Number(body.needListItemId));
      if (input.response === 'yes' && available.length && !selected) throw fail('Choose an available potluck item before confirming Yes');
      const isOpenRequest = selected && String(selected.item_notes || '').toUpperCase().startsWith('[OPEN_REQUEST_SLOT]');
      const customName = String(body.needListCustomItemName || '').trim();
      if (isOpenRequest && (!customName || customName.length > 255)) throw fail('Describe what you are bringing (255 characters or fewer)');
      await conn.execute(`UPDATE company_event_need_list_items SET claimed_by_guest_name = NULL, claimed_by_guest_email = NULL, claimed_at = NULL
        WHERE company_event_id = ? AND agency_id = ? AND LOWER(claimed_by_guest_email) = ?`, [eventId, event.agency_id, input.email]);
      if (input.response === 'yes' && selected) await conn.execute(`UPDATE company_event_need_list_items SET item_name = ?, claimed_by_guest_name = ?,
        claimed_by_guest_email = ?, claimed_at = NOW() WHERE id = ? AND company_event_id = ?`,
      [isOpenRequest ? customName : selected.item_name, `${input.firstName} ${input.lastName}`.trim(), input.email, selected.id, eventId]);
    }
    await conn.commit();
    return { ok: true, matched: false, response: input.response, managementToken, guestRegistrationId, event, input, checkedInAt: previous?.checked_in_at || null, checkedOutAt: previous?.checked_out_at || null };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
