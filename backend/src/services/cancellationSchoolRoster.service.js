import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { cancellationRecipients, reviewedMessage } from './cancellationRecipients.service.js';
import { createCancellationSchoolNoticeService } from './cancellationSchoolNotice.service.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';

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
  const text = message.text + footer.text;
  return sendEmailFromIdentity({ ...message, agencyId, clientId, text,
    html: renderPortalEmail({ brand, text }), portalEmailBrand: brand,
    senderIdentityId: mailbox.senderIdentityId, replyToOverride: mailbox.support, fromDisplayNameOverride: brand.displayName,
    templateType: SCHOOL_EMAIL_TEMPLATE, schoolSessionScopeKey: optOut.scopeKey });
}

/** School-day assignments are notification evidence, never synthetic appointments. */
export function createCancellationSchoolRosterService(overrides = {}) {
  const d = { database: pool, contacts: (...args) => cancellationRecipients.review(...args),
    permitted: (...args) => cancellationRecipients.permitted(...args), sendEmail: sendRosterEmail, ...overrides };
  async function list({ agencyId, providerId, date }) {
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [rows] = await d.database.execute(`SELECT cpa.id AS assignment_id,cpa.client_id,cpa.organization_id AS school_id,
      cpa.service_day,cpa.updated_at,c.status,s.status_key AS client_status_key,s.label AS client_status_label,
      school.name AS school_name,CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name
      FROM client_provider_assignments cpa
      JOIN clients c ON c.id=cpa.client_id AND c.agency_id=?
      JOIN users u ON u.id=cpa.provider_user_id
      JOIN agencies school ON school.id=cpa.organization_id
      JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.agency_id=c.agency_id AND oa.is_active=1
      JOIN provider_school_assignments psa ON psa.provider_user_id=cpa.provider_user_id
        AND psa.school_organization_id=cpa.organization_id AND BINARY psa.day_of_week=BINARY cpa.service_day AND psa.is_active=1
      LEFT JOIN client_statuses s ON s.id=c.client_status_id
      WHERE cpa.provider_user_id=? AND cpa.service_day=? AND cpa.is_active=1
      ORDER BY cpa.client_id,cpa.organization_id,cpa.id`, [agencyId, providerId, weekday]);
    return [...new Map(rows.filter(r => !['ARCHIVED','INACTIVE'].includes(r.status) && !hasTerminalClientStatus(r)
      && !['waitlist','inactive'].includes(String(r.client_status_key || '').toLowerCase()))
      .map(r => [`${r.client_id}:${r.school_id}`, r])).values()];
  }
  async function review(row, { agencyId, providerId, date, reason, choices, message, required = false, followUpAction, followUpMessage = '' }) {
    const clientId = Number(row.client_id);
    const client = await d.contacts(clientId, agencyId, choices, { required });
    // Assigned-day notices have no appointment/portal session to attach texts or replacement offers to.
    if (client.channels.some(c => c !== 'email')) throw fail('Assigned-day school notices support email. Review other contact methods separately.');
    if (followUpAction === 'private_slots') throw fail('Private replacement times require scheduled appointments. Choose contact support for assigned-day clients.');
    const followup = followUpAction === 'none' ? '' : '\n\nPlease contact our support team if you need help arranging another session.';
    return { key: `school_roster:${agencyId}:${providerId}:${date}:${clientId}:${row.school_id}`, kind: 'school_roster',
      id: clientId, clientId, agencyId, providerId, schoolId: Number(row.school_id), date,
      title: `${client.clientName} — ${row.school_name} assigned-day notice`, clients: [{ ...client, emailOnly: true }],
      recipients: [client.clientName],
      message: reviewedMessage(message, { subject: `School schedule update — ${date}`,
        text: `${row.provider_name} will be unavailable at ${row.school_name} on ${date}, so school sessions with this provider will not take place that day.\n\nCategory: ${reason}${followUpMessage ? `\n\n${followUpMessage}` : ''}${followup}` }),
      source: { assignment: row, contacts: client.contacts } };
  }
  async function send(_token, item, actorUserId) {
    const current = (await list(item)).find(r => Number(r.client_id) === item.clientId && Number(r.school_id) === item.schoolId);
    if (!current || JSON.stringify(current) !== JSON.stringify(item.source.assignment)) throw fail('This school-day assignment changed. Review it again before notifying the family.');
    const client = item.clients[0];
    const fresh = await d.contacts(item.clientId, item.agencyId, client, { required: true });
    if (JSON.stringify(fresh.contacts) !== JSON.stringify(client.contacts)) throw fail('This family’s contacts changed. Review the recipients again.');
    if (client.mode === 'none' || !client.recipients.length) return { sent: 0, skipped: 1, reason: 'No family contact selected; follow up separately.' };
    // Stable across separate reviews and recovery attempts; no second notice for the same provider/day/client/address.
    const deliveryToken = createHash('sha256').update(`school-roster:${item.agencyId}:${item.providerId}:${item.date}`).digest('hex').slice(0,36);
    const notices = createCancellationSchoolNoticeService({ database: d.database, sendEmail: async args => {
      const matching = client.recipients.filter(r => r.email.toLowerCase() === args.to);
      let allowed = false;
      for (const r of matching) if (await d.permitted(item.clientId, item.agencyId, r, 'email')) allowed = true;
      if (!allowed) return { skipped: true, reason: 'Family notification preference or access prevents delivery.' };
      return d.sendEmail({ ...args, clientId: item.clientId });
    } });
    return notices.send(deliveryToken, { ...item, recipients: [...new Set(client.recipients.map(r => r.email.toLowerCase()))] }, actorUserId);
  }
  return { list, review, send };
}
export const cancellationSchoolRoster = createCancellationSchoolRosterService();
