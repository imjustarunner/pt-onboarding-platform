import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import UserLoginEmail from '../models/UserLoginEmail.model.js';
import GoogleWorkspaceDirectory from './googleWorkspaceDirectory.service.js';

const email = value => String(value || '').trim().toLowerCase();
const directoryCache = new Map();

async function workspaceUser(address) {
  if (!address || !GoogleWorkspaceDirectory.isConfigured()) return null;
  const cached = directoryCache.get(address);
  if (cached?.expires > Date.now()) return cached.value;
  try {
    const value = await GoogleWorkspaceDirectory.getUser({ primaryEmail: address });
    if (value && !value.suspended) directoryCache.set(address, { value, expires: Date.now() + 300000 });
    return value?.suspended ? null : value;
  } catch { return null; }
}

export function tenantMeetingEmail(user, domain, account, affiliatedEmail = '') {
  const addresses = [account?.primaryEmail, ...(account?.aliases || []), ...(account?.nonEditableAliases || [])].map(email);
  // An agency affiliation chooses a delivery address, not a new account or
  // permission. Only honor it when Directory confirms the same account owns it.
  const affiliated = email(affiliatedEmail);
  if (affiliated && addresses.includes(affiliated)) return affiliated;
  // Only use an existing alias belonging to this Workspace account. Never invent
  // first-name@tenant addresses or accidentally route candidates to staff mailboxes.
  const preferred = `${email(user.email || user.work_email).split('@')[0]}@${domain}`;
  const tenantAddress = domain && (addresses.includes(preferred) ? preferred : addresses.find(address => address.endsWith(`@${domain}`)));
  return tenantAddress || email(user.work_email || user.email);
}

export async function resolveMeetingRecipient({ agencyId, user, guest = false }) {
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || email(user.email);
  if (guest) return { email: email(user.email), displayName, calendarAccountEmail: null };
  const agency = await Agency.findById(agencyId);
  let flags = agency?.feature_flags || {};
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
  let domain = email(agency?.workspace_email_domain || flags.workspaceEmailDomain).replace(/^@/, '');
  if (!domain) {
    const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
    domain = email(identities.find(i => Number(i.agency_id) === Number(agencyId) && /^po@/i.test(i.from_email || ''))?.from_email).split('@')[1] || '';
  }
  const primary = email(user.work_email || user.email);
  const account = await workspaceUser(primary) || (primary !== email(user.email) ? await workspaceUser(email(user.email)) : null);
  let affiliations = [];
  if (Number(user.id)) {
    try { affiliations = await UserLoginEmail.listForUser(Number(user.id)); }
    catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      // Keep existing delivery working on installations predating alias storage.
    }
  }
  const affiliated = affiliations.find(row => Number(row.agency_id) === Number(agencyId))?.email;
  return { email: tenantMeetingEmail(user, domain, account, affiliated), displayName, calendarAccountEmail: email(account?.primaryEmail) || primary };
}
