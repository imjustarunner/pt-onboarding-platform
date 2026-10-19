import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { ensureWorkspaceSenderGroup } from './workspaceSenderGroup.service.js';
import { ensureSendAsAlias } from './gmailSendAs.service.js';

const verifiedSenders = new Map();

export async function securityMailboxPlan(agency) {
  // Tenants without their own mail domain use the verified platform sender,
  // with their own agency identity and email branding.
  const domain = await inferAgencyMailDomain(agency.id) || await inferAgencyMailDomain(1);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error('Agency email domain is not configured');
  return { agencyId: agency.id, fromEmail: `security@${domain}`, replyTo: `admin@${domain}`, displayName: `${agency.name} Security` };
}

export async function provisionSecurityMailbox(agency, { apply = false } = {}) {
  const plan = await securityMailboxPlan(agency);
  if (!apply) return plan;
  const mailboxName = `Account Security — ${plan.fromEmail.split('@')[1]}`;
  let result = verifiedSenders.get(plan.fromEmail);
  if (!result) {
    // Reports must arrive at an existing monitored address. Provision missing
    // admin groups with the same owner/manager policy as other app groups.
    await ensureWorkspaceSenderGroup({ email: plan.replyTo, displayName: `${plan.fromEmail.split('@')[1]} Administration` });
    result = await ensureWorkspaceSenderGroup({ email: plan.fromEmail, displayName: mailboxName });
    if (!result.group) throw new Error('Security address must be a Google Group; an existing individual mailbox was left unchanged.');
    const sending = await ensureSendAsAlias({ sendAsEmail: plan.fromEmail, displayName: mailboxName, replyToAddress: plan.replyTo, treatAsAlias: false });
    if (!sending.ok || sending.sendAs?.verificationStatus !== 'accepted') throw new Error(`Security sender is not verified: ${sending.error || sending.sendAs?.verificationStatus}`);
    verifiedSenders.set(plan.fromEmail, result);
  }
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agency.id, 'security');
  const [[route]] = await pool.execute('SELECT sender_identity_id FROM email_inbound_routes WHERE email_address=? AND is_active=1 LIMIT 1', [plan.fromEmail]);
  const inboundAddresses = !route || Number(route.sender_identity_id) === Number(identity?.id) ? [plan.fromEmail] : [];
  const fields = { displayName: plan.displayName, fromEmail: plan.fromEmail, replyTo: plan.replyTo, isActive: true, inboundAddresses };
  identity = identity ? await EmailSenderIdentity.update(identity.id, fields) : await EmailSenderIdentity.create({ agencyId: agency.id, identityKey: 'security', ...fields });
  return { ...plan, groupId: result.group.id, identityId: identity.id, sending: 'accepted' };
}

export async function resolveSecurityMailbox(agencyId) {
  const agency = await Agency.findById(agencyId);
  if (!agency) throw new Error('Security notification agency is not available');
  const plan = await securityMailboxPlan(agency);
  const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agency.id, 'security');
  if (!identity || !Number(identity.is_active) || String(identity.from_email).toLowerCase() !== plan.fromEmail || Number(identity.agency_id) !== Number(agency.id)) {
    throw new Error(`Configure the verified ${plan.fromEmail} sender before sending security notifications`);
  }
  return { agency, identity, ...plan };
}

export async function securityMailboxAgencies() {
  const [rows] = await pool.execute("SELECT id,name,slug,organization_type,feature_flags FROM agencies WHERE is_active=1 AND organization_type IN ('agency','life_coach','consultant')");
  return rows;
}
