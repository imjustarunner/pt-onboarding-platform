import pool from '../config/database.js';
import User from '../models/User.model.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { isAppOnlyProvider } from './messageReminderRecipient.service.js';

const email = value => String(value?.email || value || '').trim().toLowerCase();
export async function verifiedAppOnlyProvider(userId) {
  const user = userId ? await User.findById(userId) : null;
  if (!user || !isAppOnlyProvider(user) || !Directory.isConfigured()) return null;
  if (user.is_active === 0 || !['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user.status || '').toUpperCase())) return null;
  const login = email(user.email);
  if (!login) return null;
  try {
    if (await Directory.getUser({ primaryEmail: login })) return null;
  } catch (error) {
    if (Number(error.code || error.response?.status) !== 400 || !/Type not supported: userKey/i.test(String(error.message))) throw error;
  }
  return await Directory.getGroup({ groupEmail: login }) ? user : null;
}

export async function eligibleClientAfterHoursReply({ agencyId, ownerUserId, inbox, recipientEmails, senderTrust, fromEmail }) {
  // Missing original recipient context fails closed, including old queued replies.
  if (!['client', 'guardian'].includes(senderTrust) || inbox?.kind !== 'personal' || Number(inbox.owner_user_id) !== Number(ownerUserId) || Number(inbox.agency_id) !== Number(agencyId)) return null;
  const recipients = [...new Set((recipientEmails || []).map(email).filter(Boolean))];
  if (recipients.length !== 1 || recipients[0] !== email(inbox.from_email)) return null;
  const provider = await verifiedAppOnlyProvider(ownerUserId);
  if (!provider) return null;
  const sender = email(fromEmail), domain = sender.split('@')[1];
  if (!domain || sender === email(inbox.from_email)) return null;
  // A testing/guardian record must not make a managed staff address eligible.
  const [[internal]] = await pool.execute(
    `SELECT id FROM email_sender_identities WHERE is_active=1
     AND LOWER(TRIM(SUBSTRING_INDEX(from_email,'@',-1)))=? LIMIT 1`, [domain]
  );
  return internal ? null : provider;
}
