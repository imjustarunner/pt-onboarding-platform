import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { cancellationRecipients, reviewedMessage } from './cancellationRecipients.service.js';
import { createCancellationSchoolNoticeService } from './cancellationSchoolNotice.service.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';
import { dayAbsenceMessage } from './dayAbsencePolicy.service.js';
import { schoolAbsenceHistory } from './schoolAbsenceHistory.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

async function sendRosterEmail({ agencyId, clientId, ...message }) {
  const { clientEmailContext } = await import('./clientPortalEmail.service.js');
  const { resolveWaitlistMailboxes } = await import('./providerWaitlistEmail.service.js');
  const { renderPortalEmail } = await import('./portalEmailBranding.service.js');
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const { isSchoolSessionEmailOptedOut, createSchoolSessionEmailOptOutLink, schoolSessionEmailOptOutContent, SCHOOL_EMAIL_TEMPLATE } = await import('./schoolSessionEmailPreferences.service.js');
  const scope = { agencyId, clientId, to: message.to };
  if (await isSchoolSessionEmailOptedOut(scope)) return { skipped: true, reason: 'school_session_email_opted_out' };
  const context = await clientEmailContext({ agencyId, clientId });
  const mailbox = await resolveWaitlistMailboxes(pool, agencyId);
  const optOut = await createSchoolSessionEmailOptOutLink(scope);
  const footer = schoolSessionEmailOptOutContent(optOut.url);
  const brand = { ...context.brand, replyTo: mailbox.support, displayName: `${context.tenant.name} Notifications` };
  const text = `${message.text}\n\nPlease log in to see upcoming changes to your schedule: ${context.url('login')}` + footer.text;
  return sendEmailFromIdentity({ ...message, agencyId, clientId, text,
    html: renderPortalEmail({ brand, text }), portalEmailBrand: brand,
    senderIdentityId: mailbox.senderIdentityId, replyToOverride: mailbox.support, fromDisplayNameOverride: brand.displayName,
    templateType: SCHOOL_EMAIL_TEMPLATE, schoolSessionScopeKey: optOut.scopeKey });
}

/** School-day assignments are notification evidence, never synthetic appointments. */
export function createCancellationSchoolRosterService(overrides = {}) {
  const d = { database: pool, contacts: (...args) => cancellationRecipients.review(...args),
    permitted: (...args) => cancellationRecipients.permitted(...args), sendEmail: sendRosterEmail, history: schoolAbsenceHistory, ...overrides };
  async function list({ agencyId, providerId, date }) {
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [rows] = await d.database.execute(`SELECT cpa.id AS assignment_id,cpa.client_id,cpa.organization_id AS school_id,
      cpa.service_day,cpa.updated_at,c.status,c.full_name AS client_name,c.initials AS client_initials,s.status_key AS client_status_key,s.label AS client_status_label,
      school.name AS school_name,CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name,
      ss.id AS slot_id,ss.start_time,ss.end_time,ss.note AS slot_note,ss.updated_at AS slot_updated_at
      FROM client_provider_assignments cpa
      JOIN clients c ON c.id=cpa.client_id AND c.agency_id=?
      JOIN users u ON u.id=cpa.provider_user_id
      JOIN agencies school ON school.id=cpa.organization_id
      JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.agency_id=c.agency_id AND oa.is_active=1
      JOIN provider_school_assignments psa ON psa.provider_user_id=cpa.provider_user_id
        AND psa.school_organization_id=cpa.organization_id AND BINARY psa.day_of_week=BINARY cpa.service_day AND psa.is_active=1
      LEFT JOIN client_statuses s ON s.id=c.client_status_id
      LEFT JOIN soft_schedule_slots ss ON ss.client_id=cpa.client_id AND ss.school_organization_id=cpa.organization_id
        AND ss.provider_user_id=cpa.provider_user_id AND BINARY ss.weekday=BINARY cpa.service_day
      WHERE cpa.provider_user_id=? AND cpa.service_day=? AND cpa.is_active=1
      ORDER BY cpa.client_id,cpa.organization_id,cpa.id`, [agencyId, providerId, weekday]);
    const clients = new Map();
    for (const row of rows.filter(r => !['ARCHIVED','INACTIVE'].includes(r.status) && !hasTerminalClientStatus(r)
      && !['waitlist','inactive'].includes(String(r.client_status_key || '').toLowerCase()))) {
      const { slot_id, start_time, end_time, slot_note, slot_updated_at, ...assignment } = row;
      const key = `${row.client_id}:${row.school_id}`;
      if (!clients.has(key)) clients.set(key, { ...assignment, slots: [] });
      if (slot_id && !clients.get(key).slots.some(s => s.id === Number(slot_id))) clients.get(key).slots.push({ id: Number(slot_id), startTime: start_time, endTime: end_time, note: slot_note, updatedAt: slot_updated_at });
    }
    return [...clients.values()];
  }
  async function review(row, { agencyId, providerId, date, reason, reasonCategory, urgent = true, absenceSource = 'cancel_day', choices, message, required = false, followUpAction, followUpMessage = '' }) {
    const clientId = Number(row.client_id);
    const client = await d.contacts(clientId, agencyId, choices, { required, allowMissingEmail: true });
    // Assigned-day notices have no appointment/portal session to attach texts or replacement offers to.
    if (client.channels.some(c => c !== 'email')) throw fail('Assigned-day school notices support email. Review other contact methods separately.');
    if (followUpAction === 'private_slots') throw fail('Private replacement times require scheduled appointments. Choose contact support for assigned-day clients.');
    return { key: `school_roster:${agencyId}:${providerId}:${date}:${clientId}:${row.school_id}`, kind: 'school_roster',
      id: clientId, clientId, agencyId, providerId, schoolId: Number(row.school_id), date,
      reason, reasonCategory, urgent, absenceSource,
      title: `${client.clientName} — ${row.school_name} assigned-day notice`, clients: [{ ...client, emailOnly: true }],
      recipients: [client.clientName],
      message: reviewedMessage(message, dayAbsenceMessage({ urgent, providerName: row.provider_name, schoolName: row.school_name, date, reason })),
      source: { assignment: row, contacts: client.contacts } };
  }
  async function deliver(_token, item, actorUserId) {
    const current = (await list(item)).find(r => Number(r.client_id) === item.clientId && Number(r.school_id) === item.schoolId);
    if (!current || JSON.stringify(current) !== JSON.stringify(item.source.assignment)) throw fail('This school-day assignment changed. Review it again before notifying the family.');
    const client = item.clients[0];
    const fresh = await d.contacts(item.clientId, item.agencyId, client, { required: true, allowMissingEmail: true });
    if (JSON.stringify(fresh.contacts) !== JSON.stringify(client.contacts)) throw fail('This family’s contacts changed. Review the recipients again.');
    if (client.mode === 'none' || !client.recipients.length) return { sent: 0, skipped: 1, reason: 'No family contact selected; follow up separately.' };
    // Stable across separate reviews and recovery attempts; no second notice for the same provider/day/client/address.
    const deliveryToken = createHash('sha256').update(`school-roster:${item.agencyId}:${item.providerId}:${item.date}`).digest('hex').slice(0,36);
    const missing = client.recipients.filter(r => !r.email).map(r => ({ status: 'skipped', recipient_name: r.name, recipient_address: '', error_message: 'No family email on file. Follow up through an approved contact method.' }));
    const notices = createCancellationSchoolNoticeService({ database: d.database, sendEmail: async args => {
      const matching = client.recipients.filter(r => r.email.toLowerCase() === args.to);
      let allowed = false;
      for (const r of matching) if (await d.permitted(item.clientId, item.agencyId, r, 'email')) allowed = true;
      if (!allowed) return { skipped: true, reason: 'Family notification preference or access prevents delivery.' };
      return d.sendEmail({ ...args, clientId: item.clientId });
    } });
    const addresses = [...new Set(client.recipients.map(r => r.email.toLowerCase()).filter(Boolean))];
    const result = addresses.length ? await notices.send(deliveryToken, { ...item, recipients: addresses }, actorUserId) : { sent: 0, deliveries: [] };
    return { ...result, skipped: missing.length, deliveries: [...result.deliveries, ...missing].map(r => ({ ...r,
      recipient_name: r.recipient_name || client.recipients.filter(c => c.email.toLowerCase() === r.recipient_address).map(c => c.name).join(', '), channel: 'email' })) };
  }
  async function send(token, item, actorUserId, { suppressed = false } = {}) {
    const id = await d.history.begin(token, item, actorUserId);
    try {
      const result = suppressed ? { sent: 0, suppressed: 1, reason: 'Emails deferred; follow-up review is required.' } : await deliver(token, item, actorUserId);
      await d.history.finish(id, result);
      return result;
    } catch (error) {
      await d.history.finish(id, { sent: 0, held: 1, reason: error.message });
      throw error;
    }
  }
  return { list, review, send };
}
export const cancellationSchoolRoster = createCancellationSchoolRosterService();
