import pool from '../config/database.js';
import { getSmsSender, isSmsSuppressed, prepareSmsDelivery } from './smsCompliance.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { computeNextOccurrence } from './companyEvents.service.js';
import { smsPolicyError, formatRegisteredSms } from '../utils/smsCompliancePolicy.js';
import { assertCompanyEventSmsCampaign, buildCompanyEventSms, parseCompanyEventSmsCommand, selectCompanyEventSmsReply, normalizeCompanyEventDeliveryStatus } from '../utils/companyEventSms.js';

const json = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export const companyEventParticipantSmsAudience = event => /^(program_|guardian_program_class$|skills_group$)/.test(String(event.event_type || event.eventType || '').toLowerCase()) ? 'participant' : 'staff';
const campaignAudience = companyEventParticipantSmsAudience;

export async function getCompanyEventSmsTopic(eventId, agencyId, db = pool) {
  if (!positive(eventId) || !positive(agencyId)) throw smsPolicyError('event_sms_invalid_event', 'A valid event and agency are required');
  const [existing] = await db.execute('SELECT code FROM company_event_sms_topics WHERE company_event_id = ? AND agency_id = ?', [Number(eventId), Number(agencyId)]);
  if (existing[0]) return String(existing[0].code);
  await db.execute(`INSERT INTO company_event_sms_topics (company_event_id, agency_id)
    SELECT id, agency_id FROM company_events WHERE id = ? AND agency_id = ?
    ON DUPLICATE KEY UPDATE company_event_id = VALUES(company_event_id)`, [Number(eventId), Number(agencyId)]);
  const [rows] = await db.execute('SELECT code FROM company_event_sms_topics WHERE company_event_id = ? AND agency_id = ?', [Number(eventId), Number(agencyId)]);
  if (!rows[0]) throw smsPolicyError('event_sms_invalid_event', 'Event not found for this agency');
  return String(rows[0].code);
}

export async function isCompanyEventSmsMuted(eventId, phone, db = pool) {
  const [rows] = await db.execute('SELECT 1 FROM company_event_sms_preferences WHERE company_event_id = ? AND phone = ? LIMIT 1', [Number(eventId), normalizeSmsPhone(phone)]);
  return rows.length > 0;
}

export async function resolveCompanyEventSmsSender({ agencyId, audience = 'staff', purpose = 'workforce', from = null }) {
  const [agencies] = await pool.execute('SELECT feature_flags FROM agencies WHERE id = ?', [Number(agencyId)]);
  const flags = json(agencies[0]?.feature_flags);
  if (flags.smsNumbersEnabled !== true || flags.companyEventsEnabled !== true) throw smsPolicyError('event_sms_disabled', 'Enable SMS and company event messaging in agency settings');
  let phone = normalizeSmsPhone(from);
  if (!phone) {
    const numberId = Number(audience === 'staff' ? flags.companyEventsSenderNumberId : flags.companyEventsServiceSenderNumberId);
    let numbers;
    if (numberId) {
      [numbers] = await pool.execute('SELECT phone_number FROM twilio_numbers WHERE id = ? AND agency_id = ? AND is_active = TRUE AND status <> \'released\'', [numberId, Number(agencyId)]);
    } else if (audience === 'participant') {
      // Existing service registration may already be available; never borrow staff polling.
      [numbers] = await pool.execute(`SELECT n.phone_number FROM twilio_numbers n JOIN sms_sender_registrations r ON r.number_id = n.id
        WHERE n.agency_id = ? AND n.is_active = TRUE AND n.status <> 'released'
        AND JSON_CONTAINS(JSON_EXTRACT(r.registration_json, '$.purposes'), JSON_QUOTE(?))
        AND NOT JSON_CONTAINS(JSON_EXTRACT(r.registration_json, '$.purposes'), JSON_QUOTE('polling'))
        AND JSON_EXTRACT(r.registration_json, '$.approved') = TRUE AND JSON_EXTRACT(r.registration_json, '$.numberLinked') = TRUE
        ORDER BY n.id LIMIT 1`, [Number(agencyId), purpose]);
    }
    phone = normalizeSmsPhone(numbers?.[0]?.phone_number);
  }
  if (!phone) throw smsPolicyError('event_sms_sender_missing', `Configure the Campaign ${audience === 'staff' ? 2 : 1} event sender`);
  const sender = await getSmsSender(phone);
  if (Number(sender.agency_id) !== Number(agencyId)) throw smsPolicyError('sms_sender_agency_mismatch', 'Event sender belongs to a different agency');
  const campaignNumber = assertCompanyEventSmsCampaign(sender, audience, purpose);
  return { sender, campaignNumber };
}

export async function prepareCompanyEventSms({ eventId, agencyId, to, body, purpose = 'workforce', audience = 'staff', from = null, mode = 'message', event: suppliedEvent = null }) {
  let event = suppliedEvent;
  if (!event) {
    const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ?', [Number(eventId), Number(agencyId)]);
    event = rows[0];
  }
  if (!event || Number(event.id) !== Number(eventId) || Number(event.agency_id || event.agencyId) !== Number(agencyId)) throw smsPolicyError('event_sms_invalid_event', 'Event not found for this agency');
  if (event.is_active === 0 || event.isActive === false) throw smsPolicyError('event_sms_inactive', 'This event is inactive');
  const { sender, campaignNumber } = await resolveCompanyEventSmsSender({ agencyId, audience, purpose, from });
  const code = await getCompanyEventSmsTopic(eventId, agencyId);
  const message = buildCompanyEventSms({ event, code, body, brandName: sender.registration.brandName, audience, mode });
  return { event, sender, campaignNumber, code, message, options: { to: normalizeSmsPhone(to), from: sender.phone_number, body: message, purpose, agencyId: Number(agencyId), companyEventId: Number(eventId) } };
}

export async function sendCompanyEventSms(input, { send = null, db = pool } = {}) {
  const prepared = await prepareCompanyEventSms(input);
  const { sender, campaignNumber, message, options } = prepared;
  let record;
  try { [record] = await db.execute(`INSERT INTO company_event_sms_deliveries
    (company_event_id, agency_id, user_id, phone, from_number, campaign_id, campaign_number, purpose, dispatch_type, batch_id, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [Number(input.eventId), Number(input.agencyId), input.userId || null, options.to || '', sender.phone_number, sender.campaign_id, campaignNumber, options.purpose, input.dispatchType || 'direct_message', input.batchId || null, message]); }
  catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw smsPolicyError('event_sms_already_attempted', 'This event message was already attempted for this phone');
    throw error;
  }
  try {
    // Preflight records suppression as skipped. The transport rechecks immediately before sending.
    await prepareSmsDelivery(options);
    const transport = send ? null : (await import('./vonage.service.js')).default;
    const deliver = send || transport.sendSms.bind(transport);
    const result = await deliver(options);
    await db.execute("UPDATE company_event_sms_deliveries SET status = 'sent', provider_message_id = ? WHERE id = ?", [result?.sid || null, record.insertId]);
    return { ...result, eventSmsDeliveryId: record.insertId, eventCode: prepared.code };
  } catch (error) {
    const status = Number(error.status) === 403 ? 'skipped' : 'failed';
    await db.execute('UPDATE company_event_sms_deliveries SET status = ?, status_reason = ? WHERE id = ?', [status, String(error.code || 'delivery_failed').slice(0, 255), record.insertId]);
    throw error;
  }
}

export async function previewCompanyEventSmsDelivery(input, recipients) {
  const prepared = await prepareCompanyEventSms(input);
  const reasons = {};
  let eligibleCount = 0;
  for (const recipient of recipients) {
    try { await prepareSmsDelivery({ ...prepared.options, to: normalizeSmsPhone(recipient.phone) }); eligibleCount++; }
    catch (error) { const code = error.code || 'delivery_unavailable'; reasons[code] = (reasons[code] || 0) + 1; }
  }
  return { body: formatRegisteredSms(prepared.message, prepared.sender.registration.brandName), eventCode: prepared.code, campaignNumber: prepared.campaignNumber,
    fromNumber: prepared.sender.phone_number, senderReady: true, recipientCount: recipients.length, eligibleCount, skippedCount: recipients.length - eligibleCount, reasons };
}

export async function handleCompanyEventTopicInbound({ from, to, body, messageId, sendReply }, { db = pool } = {}) {
  const command = parseCompanyEventSmsCommand(body);
  if (!command) return null;
  let sender;
  try { sender = await getSmsSender(to); } catch { return null; }
  const phone = normalizeSmsPhone(from);
  if (!phone) return null;
  const [rows] = await db.execute(`SELECT d.*, t.code, e.title, e.is_active, e.starts_at, e.ends_at, e.recurrence_json, e.voting_closed_at
    FROM company_event_sms_deliveries d
    JOIN company_event_sms_topics t ON t.company_event_id = d.company_event_id
    JOIN company_events e ON e.id = d.company_event_id AND e.agency_id = d.agency_id
    WHERE d.agency_id = ? AND d.phone = ? AND d.campaign_id = ?
      AND d.status IN ('sent', 'delivered')
      ${command.type === 'mute' ? 'AND t.code = ?' : "AND d.dispatch_type IN ('recruitment', 'vote_invite') AND d.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"}
    ORDER BY d.created_at DESC, d.id DESC LIMIT 100`, [Number(sender.agency_id), phone, sender.campaign_id, ...(command.type === 'mute' ? [command.code] : [])]);
  const selected = selectCompanyEventSmsReply(rows, command);
  if (!selected) return null;
  if (selected.ambiguous) return { handled: true, agencyId: Number(sender.agency_id), purpose: 'polling', responseMessage: `Which event? Reply Y followed by its code: ${selected.codes.join(', ')}. This records interest only; an organizer assigns staff.` };
  if (command.type === 'mute') {
    await db.execute(`INSERT INTO company_event_sms_preferences (company_event_id, phone, provider_message_id) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE provider_message_id = VALUES(provider_message_id)`, [selected.company_event_id, phone, messageId || null]);
    // This acknowledgment never clears campaign STOP and needs the existing permission to send.
    if (sendReply) {
      try { await sendReply({ agencyId: Number(sender.agency_id), from: sender.phone_number, to: phone, purpose: selected.purpose,
        body: `Texts about "${selected.title}" are turned off. Your other event preferences are unchanged. Reply STOP to opt out of this texting program.` }); }
      catch { /* Preference persists even when confirmation is suppressed. */ }
    }
    return { handled: true, agencyId: Number(sender.agency_id), muted: true, eventId: selected.company_event_id };
  }
  if (await isSmsSuppressed(sender, phone) || await isCompanyEventSmsMuted(selected.company_event_id, phone, db)) return { handled: true };
  const ended = selected.ends_at && new Date(selected.ends_at) < new Date()
    && !computeNextOccurrence({ startsAt: selected.starts_at, endsAt: selected.ends_at, recurrence: json(selected.recurrence_json) });
  if (selected.voting_closed_at || Number(selected.is_active) === 0 || ended) {
    return { handled: true, agencyId: Number(sender.agency_id), purpose: selected.purpose, eventId: selected.company_event_id,
      responseMessage: `"${selected.title}" is no longer accepting event replies. Please contact the organizer if you need to make a change.` };
  }
  // Legacy poll option parsing owns actual polls. This handler owns recruitment interest only.
  if (selected.dispatch_type !== 'recruitment') return { handled: false, eventId: selected.company_event_id, response: command.response };
  if (!selected.user_id) return { handled: true };
  if (new Set(rows.filter(row => Number(row.company_event_id) === Number(selected.company_event_id)).map(row => Number(row.user_id))).size > 1) {
    return { handled: true, agencyId: Number(sender.agency_id), purpose: 'polling', responseMessage: 'This phone is shared by more than one staff account. Please sign in to record your event interest.' };
  }
  const digits = phone.slice(1), local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const [members] = await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE u.id = ? AND ua.agency_id = ? AND ua.is_active = TRUE AND u.is_active = TRUE AND u.terminated_at IS NULL
      AND u.status NOT IN ('TERMINATED_PENDING', 'ARCHIVED', 'INACTIVE_EMPLOYEE')
      AND (REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)) LIMIT 1`,
  [selected.user_id, Number(sender.agency_id), digits, local, digits, local, digits, local]);
  if (!members.length) return { handled: true };
  const label = command.response === 'Y' ? 'Interested — organizer approval required' : 'Not available';
  // Deliberately record a response, never an assignment or approved shift request.
  await db.execute(`INSERT INTO company_event_responses
    (company_event_id, user_id, response_key, response_label, response_body, source, from_number, received_at)
    VALUES (?, ?, ?, ?, ?, 'sms', ?, NOW()) ON DUPLICATE KEY UPDATE response_key = VALUES(response_key),
      response_label = VALUES(response_label), response_body = VALUES(response_body), source = 'sms', from_number = VALUES(from_number), received_at = NOW()`,
  [selected.company_event_id, selected.user_id, command.response, label, String(body).slice(0, 2000), phone]);
  await db.execute('UPDATE company_event_sms_deliveries SET response_key = ?, responded_at = NOW() WHERE id = ?', [command.response, selected.id]);
  return { handled: true, agencyId: Number(sender.agency_id), purpose: 'polling', eventId: selected.company_event_id,
    responseMessage: command.response === 'Y' ? `Thanks! Your interest in "${selected.title}" is recorded. You are not assigned; the organizer will confirm.` : `Thanks! Your response for "${selected.title}" is recorded.` };
}

export async function recordCompanyEventSmsDeliveryStatus(messageId, status, db = pool) {
  const normalized = normalizeCompanyEventDeliveryStatus(status);
  if (!messageId || !normalized) return;
  // Late accepted receipts must not downgrade a final carrier result.
  await db.execute(`UPDATE company_event_sms_deliveries SET status = ?, status_reason = ?
    WHERE provider_message_id = ? AND status <> 'delivered' AND (? <> 'sent' OR status NOT IN ('failed', 'skipped'))`,
  [normalized, normalized === 'failed' ? String(status).slice(0,255) : null, String(messageId), normalized]);
}

export async function getCompanyEventSmsReport(eventId, agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT d.*, u.first_name, u.last_name FROM company_event_sms_deliveries d
    LEFT JOIN users u ON u.id = d.user_id WHERE d.company_event_id = ? AND d.agency_id = ? ORDER BY d.id DESC LIMIT 2000`, [Number(eventId), Number(agencyId)]);
  const [counts] = await db.execute('SELECT status, COUNT(*) AS total FROM company_event_sms_deliveries WHERE company_event_id = ? AND agency_id = ? GROUP BY status', [Number(eventId), Number(agencyId)]);
  const [muted] = await db.execute('SELECT COUNT(*) AS total FROM company_event_sms_preferences WHERE company_event_id = ?', [Number(eventId)]);
  const [interested] = await db.execute("SELECT COUNT(DISTINCT user_id) AS total FROM company_event_responses WHERE company_event_id = ? AND UPPER(response_key) IN ('Y','YES')", [Number(eventId)]);
  const summary = { queued: 0, sent: 0, delivered: 0, failed: 0, skipped: 0, interested: Number(interested[0]?.total || 0), muted: Number(muted[0]?.total || 0) };
  for (const row of counts) summary[row.status] = Number(row.total);
  const [batches] = await db.execute(`SELECT batch_id, dispatch_type, MIN(created_at) AS created_at, COUNT(*) AS recipients,
    SUM(status = 'sent') AS sent, SUM(status = 'delivered') AS delivered, SUM(status = 'failed') AS failed,
    SUM(status = 'skipped') AS skipped, SUM(response_key IS NOT NULL) AS responses, SUM(response_key = 'Y') AS interested
    FROM company_event_sms_deliveries WHERE company_event_id = ? AND agency_id = ? AND batch_id IS NOT NULL
    GROUP BY batch_id, dispatch_type ORDER BY created_at DESC LIMIT 100`, [Number(eventId), Number(agencyId)]);
  return { eventCode: await getCompanyEventSmsTopic(eventId, agencyId, db), summary, batches: batches.map(row => ({
    id: row.batch_id, dispatchType: row.dispatch_type, createdAt: row.created_at,
    ...Object.fromEntries(['recipients','sent','delivered','failed','skipped','responses','interested'].map(key => [key, Number(row[key] || 0)]))
  })), deliveries: rows.map(row => ({
    id: Number(row.id), userId: row.user_id, name: [row.first_name,row.last_name].filter(Boolean).join(' '), phone: row.phone,
    campaignNumber: Number(row.campaign_number), purpose: row.purpose, dispatchType: row.dispatch_type, batchId: row.batch_id, status: row.status,
    statusReason: row.status_reason, responseKey: row.response_key, respondedAt: row.responded_at, createdAt: row.created_at
  })) };
}

export async function getCompanyEventSmsConsentDetails(eventRow) {
  const audience = campaignAudience(eventRow), purpose = audience === 'staff' ? 'workforce' : 'reminders';
  const campaignNumber = audience === 'staff' ? 2 : 1;
  if (!readEventOperations(eventRow).attendeeSmsEnabled) return { enabled: false, campaignNumber, purpose, programKey: audience === 'staff' ? 'polling' : 'operations', reason: 'event_attendee_sms_disabled' };
  try {
    const { sender } = await resolveCompanyEventSmsSender({ agencyId: eventRow.agency_id || eventRow.agencyId, audience, purpose });
    const registration = sender.registration;
    const programName = `${registration.brandName} ${audience === 'staff' ? 'Employee and Company Event' : 'Service Event'} Texting`;
    return { enabled: true, campaignNumber, purpose, programName, programKey: audience === 'staff' ? 'polling' : 'operations', privacyUrl: registration.privacyUrl, termsUrl: registration.termsUrl, supportContact: registration.supportContact,
      disclosure: `Optional: I agree to receive texts from ${registration.brandName} about this event. Message frequency varies. Message and data rates may apply. Reply with the event code to mute this event, STOP to opt out of this texting program, or HELP for help. Consent is not required to attend or receive services. Enrollment requires reviewed SMS consent. Support: ${registration.supportContact}.` };
  } catch (error) { return { enabled: false, campaignNumber, purpose, programKey: audience === 'staff' ? 'polling' : 'operations', reason: error.code || 'sender_unavailable' }; }
}

export async function enrollCompanyEventGuestSms({ eventId, agencyId, phone, guestRegistrationId, evidence, actorUserId = null }) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized || evidence?.consented !== true) throw smsPolicyError('event_sms_consent_required', 'An optional affirmative event texting choice and mobile number are required');
  const [events] = await pool.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ?', [Number(eventId), Number(agencyId)]);
  if (!events[0]) throw smsPolicyError('event_sms_invalid_event', 'Event not found');
  const [guests] = await pool.execute('SELECT id, phone FROM company_event_guest_registrations WHERE id = ? AND company_event_id = ? AND agency_id = ?', [Number(guestRegistrationId), Number(eventId), Number(agencyId)]);
  if (!guests[0] || normalizeSmsPhone(guests[0].phone) !== normalized) throw smsPolicyError('event_sms_invalid_recipient', 'The phone must match this event registration');
  const details = await getCompanyEventSmsConsentDetails(events[0]);
  if (!readEventOperations(events[0]).attendeeSmsEnabled) throw smsPolicyError('event_attendee_sms_disabled', 'Attendee texting is disabled for this event');
  const audience = campaignAudience(events[0]);
  let status = 'pending_review';
  let consentRequest = null;
  if (details.enabled) {
    const { sender } = await resolveCompanyEventSmsSender({ agencyId, audience, purpose: details.purpose });
    if (await isSmsSuppressed(sender, normalized) || await isCompanyEventSmsMuted(eventId, normalized)) status = 'suppressed';
    else {
      try { await prepareSmsDelivery({ agencyId, from: sender.phone_number, to: normalized, purpose: details.purpose, body: 'Event enrollment verification', companyEventId: Number(eventId) }); status = 'active'; }
      catch { /* Existing reviewed campaign permission is required; checkbox evidence cannot grant it. */ }
    }
    if (status === 'pending_review') {
      const { createSmsConsentRequest } = await import('./smsConsentRequest.service.js');
      consentRequest = await createSmsConsentRequest({ agencyId: Number(agencyId), numberId: sender.id, phone: normalized,
        signerRole: audience === 'staff' ? 'staff' : 'client', actorUserId });
    }
  }
  const captured = { ...evidence, disclosure: details.disclosure || evidence.disclosure || '', collectedAt: new Date().toISOString(), source: 'event_registration', campaignNumber: details.campaignNumber, consentRequestId: consentRequest?.id || null };
  await pool.execute(`INSERT INTO company_event_sms_enrollments (company_event_id, phone, guest_registration_id, campaign_number, status, evidence_json)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE guest_registration_id = VALUES(guest_registration_id), status = VALUES(status), evidence_json = VALUES(evidence_json)`,
  [Number(eventId), normalized, Number(guestRegistrationId), details.campaignNumber, status, JSON.stringify(captured)]);
  return { status, campaignNumber: details.campaignNumber, consentPath: consentRequest?.path || null, consentRequestId: consentRequest?.id || null };
}

export async function listCompanyEventSmsAttendees(eventId, agencyId, db = pool) {
  const [events] = await db.execute('SELECT operations_json FROM company_events WHERE id = ? AND agency_id = ?', [Number(eventId), Number(agencyId)]);
  if (!events[0] || !readEventOperations(events[0]).attendeeSmsEnabled) throw smsPolicyError('event_attendee_sms_disabled', 'Attendee texting is disabled for this event');
  const [rows] = await db.execute(`SELECT g.id, g.first_name, g.last_name, g.phone, e.phone AS consent_phone
    FROM company_event_guest_registrations g
    JOIN company_event_sms_enrollments e ON e.company_event_id = g.company_event_id AND e.guest_registration_id = g.id
    WHERE g.company_event_id = ? AND g.agency_id = ? AND g.response = 'yes'
      AND JSON_EXTRACT(e.evidence_json, '$.consented') = TRUE`, [Number(eventId), Number(agencyId)]);
  const seen = new Set();
  return rows.filter(row => {
    const phone = normalizeSmsPhone(row.phone);
    if (!phone || phone !== normalizeSmsPhone(row.consent_phone) || seen.has(phone)) return false;
    seen.add(phone);
    return true;
  });
}

export async function revokeCompanyEventGuestSms({ eventId, guestRegistrationId }, db = pool) {
  // Revocation is event-local; it must not alter the recipient's other subscriptions.
  await db.execute(`INSERT INTO company_event_sms_preferences (company_event_id, phone)
    SELECT company_event_id, phone FROM company_event_sms_enrollments WHERE company_event_id = ? AND guest_registration_id = ?
    ON DUPLICATE KEY UPDATE muted_at = CURRENT_TIMESTAMP`, [Number(eventId), Number(guestRegistrationId)]);
  await db.execute("UPDATE company_event_sms_enrollments SET status = 'suppressed', evidence_json = JSON_SET(evidence_json, '$.consented', FALSE) WHERE company_event_id = ? AND guest_registration_id = ?", [Number(eventId), Number(guestRegistrationId)]);
}

export async function recordCompanyEventPollSmsResponse({ eventId, userId, responseKey }, db = pool) {
  await db.execute(`UPDATE company_event_sms_deliveries SET response_key = ?, responded_at = NOW()
    WHERE company_event_id = ? AND user_id = ? AND dispatch_type = 'vote_invite' AND status IN ('sent', 'delivered')
    ORDER BY id DESC LIMIT 1`, [String(responseKey).slice(0, 32), Number(eventId), Number(userId)]);
}
