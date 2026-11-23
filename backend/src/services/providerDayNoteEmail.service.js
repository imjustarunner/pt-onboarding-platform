import pool from '../config/database.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { cancellationSchoolRoster } from './cancellationSchoolRoster.service.js';
import { cancellationRecipients } from './cancellationRecipients.service.js';
import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function createProviderDayNoteEmail({
  database = pool,
  roster = cancellationSchoolRoster,
  contacts = cancellationRecipients,
  mailboxFor = resolveEmailSendMailbox,
  send = sendEmailFromIdentity
} = {}) {
  async function clientsForDay({ agencyId, providerId, date, timeZone = 'America/Denver' }) {
    const day = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail('Choose a day.');
    const start = wallMysqlToUtcMysql(`${day} 00:00:00`, timeZone);
    const end = wallMysqlToUtcMysql(`${addDaysYmd(day, 1)} 00:00:00`, timeZone);
    if (!start || !end) throw fail('Choose a valid timezone.');
    const soft = await roster.list({ agencyId, providerId, date: day });
    const [rows] = await database.execute(
      `SELECT DISTINCT p.client_id AS clientId, c.full_name AS clientName
       FROM appointments a
       JOIN appointment_participants p ON p.appointment_id = a.id
       JOIN clients c ON c.id = p.client_id AND c.agency_id = a.agency_id
       WHERE a.agency_id = ? AND a.provider_user_id = ? AND a.start_at >= ? AND a.start_at < ?
         AND UPPER(a.status) NOT IN ('CANCELLED','CANCELED','LATE_CANCELED','LATE_CANCELLED','VOID','VOIDED')`,
      [agencyId, providerId, start, end]
    );
    const people = new Map();
    for (const row of soft || []) {
      const clientId = Number(row.client_id);
      if (clientId) people.set(clientId, { clientId, clientName: row.client_name || row.client_initials || `Client #${clientId}`, source: 'school' });
    }
    for (const row of rows || []) {
      const clientId = Number(row.clientId);
      if (clientId && !people.has(clientId)) people.set(clientId, { clientId, clientName: row.clientName || `Client #${clientId}`, source: 'appointment' });
    }
    return [...people.values()].sort((a, b) => String(a.clientName).localeCompare(String(b.clientName)));
  }

  async function preview(input) {
    const clients = await clientsForDay(input);
    const mailbox = clients.length && input.actorUserId
      ? await mailboxFor({ agencyId: input.agencyId, userId: input.actorUserId }).catch(() => null)
      : null;
    return { date: String(input.date).slice(0, 10), count: clients.length, clients, fromEmail: mailbox?.fromEmail || null };
  }

  async function sendNote({ agencyId, providerId, actorUserId, date, timeZone, subject, text }) {
    const title = String(subject || '').trim();
    const body = String(text || '').trim();
    if (!title || title.length > 200 || /[\r\n]/.test(title)) throw fail('Write a subject of up to 200 characters.');
    if (!body || body.length > 4000) throw fail('Write a message of up to 4,000 characters.');
    const clients = await clientsForDay({ agencyId, providerId, date, timeZone });
    if (!clients.length) throw fail('No clients are on this day.', 404);
    const mailbox = await mailboxFor({ agencyId, userId: actorUserId });
    if (!mailbox?.identity?.id) throw fail('Configure your work mailbox before sending email.');
    const results = [];
    for (const client of clients) {
      let reviewed;
      try {
        reviewed = await contacts.review(client.clientId, agencyId, { channels: ['email'] }, { allowMissingEmail: true });
      } catch (error) {
        results.push({ clientId: client.clientId, clientName: client.clientName, status: 'skipped', reason: error.message || 'No email contact' });
        continue;
      }
      const recipients = (reviewed.recipients || []).filter(recipient => recipient.email);
      if (!recipients.length) {
        results.push({ clientId: client.clientId, clientName: client.clientName, status: 'skipped', reason: reviewed.contactIssue || 'No email is available.' });
        continue;
      }
      let sent = 0;
      let attempted = 0;
      for (const recipient of recipients) {
        const allowed = await contacts.permitted(client.clientId, agencyId, recipient, 'email', { actorUserId });
        if (!allowed) continue;
        attempted += 1;
        try {
          const delivered = await send({
            senderIdentityId: mailbox.identity.id,
            replyToOverride: mailbox.replyTo,
            fromDisplayNameOverride: mailbox.displayName,
            agencyId,
            clientId: client.clientId,
            to: recipient.email,
            blindClientRecipient: true,
            userId: recipient.userId || null,
            subject: title,
            text: body,
            html: `<p>${escapeHtml(body).replaceAll('\n', '<br>')}</p>`,
            templateType: 'provider_day_note',
            source: 'manual',
            generatedByUserId: actorUserId
          });
          if (delivered?.id && !delivered.skipped && !delivered.blocked) sent += 1;
        } catch {
          // Continue with other clients. A transport error may be ambiguous.
        }
      }
      results.push(sent
        ? { clientId: client.clientId, clientName: client.clientName, status: 'sent', sent, unconfirmed: attempted - sent }
        : { clientId: client.clientId, clientName: client.clientName, status: attempted ? 'unconfirmed' : 'skipped', reason: attempted ? 'Delivery was not confirmed.' : 'Email is not allowed for this contact.' });
    }
    return {
      date: String(date).slice(0, 10),
      sent: results.filter(item => item.status === 'sent').length,
      skipped: results.filter(item => item.status === 'skipped').length,
      unconfirmed: results.filter(item => item.status === 'unconfirmed' || item.unconfirmed > 0).length,
      results
    };
  }

  return { preview, sendNote, clientsForDay };
}

export const providerDayNoteEmail = createProviderDayNoteEmail();
