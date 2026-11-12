import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import Notification from '../models/Notification.model.js';
import { listUserDepartmentalGroupKeys } from './departmentalGroupAccess.service.js';

const email = value => String(value || '').trim().toLowerCase();

/** Group email delivery NONE is independent of app alerts. Only current group
 * members with active payroll access receive these notices; no roster is changed. */
export async function notifyPayrollTicket({ agencyId, ticketId, mailbox, actorUserId = null }, dependencies = {}) {
  const db = dependencies.db || pool;
  const directory = dependencies.directory || Directory;
  const create = dependencies.createNotification || (value => Notification.create(value));
  const access = dependencies.access || (userId => listUserDepartmentalGroupKeys({ agencyId, userId, db }));
  const recipients = new Set();
  const visited = new Set();
  async function collect(group) {
    const key = email(group);
    if (visited.has(key)) return;
    if (visited.size >= 100) throw Object.assign(new Error('Payroll group nesting needs review.'), { code: 'PAYROLL_GROUP_NESTING_LIMIT' });
    visited.add(key);
    for (const member of await directory.listGroupMembers(key, { maxResults: 10000 })) {
      if (String(member.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
      if (member.type === 'GROUP') { await collect(member.email); continue; }
      // Include aliases only after the Directory proves they belong to this
      // current member. Cached app rosters cannot resurrect removed recipients.
      const user = await directory.getUser({ primaryEmail: member.email });
      if (!user || user.suspended || user.archived) continue;
      for (const address of [member.email, user.primaryEmail, ...(user.aliases || []), ...(user.nonEditableAliases || [])]) {
        if (email(address)) recipients.add(email(address));
      }
    }
  }
  await collect(mailbox);
  const [staff] = await db.execute(`SELECT u.id,u.email,u.username,u.work_email,u.personal_email FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0`, [agencyId]);
  let notified = 0;
  for (const user of staff) {
    if (![user.email, user.username, user.work_email, user.personal_email].some(address => recipients.has(email(address)))
      || !(await access(user.id)).includes('payroll')) continue;
    const [[existing]] = await db.execute(`SELECT id FROM notifications WHERE type='support_ticket_created'
      AND agency_id=? AND user_id=? AND related_entity_type='support_ticket' AND related_entity_id=? LIMIT 1`, [agencyId, user.id, ticketId]);
    if (existing) continue;
    await create({ type: 'support_ticket_created', severity: 'info', title: 'Payroll email received',
      message: 'A message is available in the Payroll group inbox and ticket queue.',
      userId: user.id, agencyId, relatedEntityType: 'support_ticket', relatedEntityId: ticketId,
      actorUserId, actorSource: 'Payroll mailbox' });
    notified++;
  }
  return { notified };
}
