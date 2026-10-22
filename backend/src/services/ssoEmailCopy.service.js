import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import User from '../models/User.model.js';
import { activeMessageStaff } from './messageReminderRecipient.service.js';

const header = value => Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : v?.email || '').filter(Boolean).join(', ') : String(value || '').trim();
const addresses = value => header(value).toLowerCase().match(/[^\s<>,;"]+@[^\s<>,;"]+/g) || [];

// This is a transport copy, not another participant or client contact. The
// verified personal mailbox is resolved on the server, never supplied by a caller.
export async function withSsoSenderCopy({ identity, generatedByUserId, source, to, cc, bcc }) {
  if (source !== 'manual' || !generatedByUserId ||
      !['messages', 'messages_at_tenant'].includes(identity?.identity_key)) return bcc;
  const user = await User.findById(generatedByUserId);
  const enabled = value => value === true || value === 1 || value === '1';
  if (!user || !activeMessageStaff(user) || enabled(user.sso_password_override) || enabled(user.login_is_group_email)) return bcc;
  const mailbox = await resolveEmailSendMailbox({ agencyId: identity.agency_id, userId: generatedByUserId });
  if (mailbox.routing !== 'workspace_user' || mailbox.fromEmail?.toLowerCase() !== identity.from_email?.toLowerCase()) return bcc;
  const copy = String(mailbox.inbox?.from_email || '').trim().toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+$/.test(copy)) throw new Error('The SSO sender copy address is unavailable');
  if ([...addresses(to), ...addresses(cc), ...addresses(bcc)].includes(copy)) return bcc;
  return [header(bcc), copy].filter(Boolean).join(', ');
}
