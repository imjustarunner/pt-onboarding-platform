import pool from '../config/database.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { cancellationSchoolRoster } from './cancellationSchoolRoster.service.js';
import { cancellationRecipients } from './cancellationRecipients.service.js';
import { sendClientPortalEmail } from './clientPortalEmail.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function createProviderDayNoteEmail({
  database = pool,
  roster = cancellationSchoolRoster,
  contacts = cancellationRecipients,
  send = sendClientPortalEmail
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
    return { date: String(input.date).slice(0, 10), count: clients.length, clients };
  }

  async function sendNote({ agencyId, providerId, actorUserId, date, timeZone, subject, text }) {
    const title = String(subject || '').trim();
    const body = String(text || '').trim();
    if (!title || title.length > 200 || /[\r\n]/.test(title)) throw fail('Write a subject of up to 200 characters.');
    if (!body || body.length > 4000) throw fail('Write a message of up to 4,000 characters.');
    const clients = await clientsForDay({ agencyId, providerId, date, timeZone });
    if (!clients.length) throw fail('No clients are on this day.', 404);
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
      for (const recipient of recipients) {
        const allowed = await contacts.permitted(client.clientId, agencyId, recipient, 'email', { actorUserId });
        if (!allowed) continue;
        await send({
          agencyId,
          clientId: client.clientId,
          to: recipient.email,
          userId: recipient.userId || null,
          subject: title,
          text: body,
          html: `<p>${escapeHtml(body).replaceAll('\n', '<br>')}</p>`,
          templateType: 'provider_day_note',
          source: 'manual',
          generatedByUserId: actorUserId
        });
        sent += 1;
      }
      results.push(sent
        ? { clientId: client.clientId, clientName: client.clientName, status: 'sent', sent }
        : { clientId: client.clientId, clientName: client.clientName, status: 'skipped', reason: 'Email is not allowed for this contact.' });
    }
    return {
      date: String(date).slice(0, 10),
      sent: results.filter(item => item.status === 'sent').length,
      skipped: results.filter(item => item.status === 'skipped').length,
      results
    };
  }

  return { preview, sendNote, clientsForDay };
}

export const providerDayNoteEmail = createProviderDayNoteEmail();
