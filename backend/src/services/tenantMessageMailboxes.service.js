import { nluTutoringQaMailDomain } from '../utils/nluTutoringQaPolicy.js';
/**
 * Tenant shared message mailboxes: messages@{domain} and securemessage@{domain}.
 */
import pool from '../config/database.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';

export const TENANT_MESSAGE_DOMAINS = [
  'plottwistco.com',
  'itsco.health',
  'innerstrengthin.com',
  'nextleveluplcc.com',
  'mh4kidz.com',
  'mh4kidz.org',
  'risereviveco.com'
];

export async function inferAgencyMailDomain(agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id,slug,is_active,is_archived,organization_type,feature_flags FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    const managed = rows?.[0] && managedDomain(rows[0]);
    if (managed) return managed;
    const qaDomain = nluTutoringQaMailDomain(rows?.[0]);
    if (qaDomain) return qaDomain;
    const flags =
      typeof rows?.[0]?.feature_flags === 'string'
        ? JSON.parse(rows[0].feature_flags || '{}')
        : rows?.[0]?.feature_flags || {};
    const fromFlags = String(flags.workspaceEmailDomain || flags.mailDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    if (fromFlags) {
      return fromFlags === 'theinnerstrengthinstitute.com' ? 'innerstrengthin.com' : fromFlags;
    }
  } catch {
    /* ignore */
  }
  try {
    const [ids] = await pool.execute(
      `SELECT from_email FROM email_sender_identities
       WHERE agency_id = ? AND is_active = 1 AND from_email LIKE '%@%'
       ORDER BY id ASC LIMIT 20`,
      [agencyId]
    );
    for (const r of ids || []) {
      const domain = String(r.from_email || '')
        .split('@')[1]
        ?.trim()
        .toLowerCase();
      if (domain === 'theinnerstrengthinstitute.com') return 'innerstrengthin.com';
      if (domain && TENANT_MESSAGE_DOMAINS.includes(domain)) return domain;
      if (domain && !domain.includes('plottwisthq.com')) return domain;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function ensureIdentity({ agencyId, identityKey, displayName, fromEmail, replyTo }) {
  let row = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, identityKey);
  if (row) {
    if (String(row.from_email || '').toLowerCase() !== String(fromEmail).toLowerCase()) {
      await pool.execute(
        `UPDATE email_sender_identities SET from_email = ?, reply_to = ?, display_name = ?, is_active = 1 WHERE id = ?`,
        [fromEmail, replyTo || fromEmail, displayName, row.id]
      );
      row = await EmailSenderIdentity.findById(row.id);
    }
    try {
      await EmailSenderIdentity.replaceInboundRoutes(row.id, [fromEmail]);
    } catch {
      /* optional */
    }
    return row;
  }
  return EmailSenderIdentity.create({
    agencyId,
    identityKey,
    displayName,
    fromEmail,
    replyTo: replyTo || fromEmail,
    inboundAddresses: [fromEmail],
    isActive: true
  });
}

const nluQaSenderError = (message, code) => Object.assign(new Error(message), { code, status: 503 });
async function nluQaSenderContext(agencyId, domainOverride, code) {
  if (![453, 454].includes(Number(agencyId))) return null;
  const [[agency]] = await pool.execute(
    'SELECT id,slug,is_active,is_archived,organization_type,feature_flags FROM agencies WHERE id = ? LIMIT 1', [agencyId]
  );
  const domain = nluTutoringQaMailDomain(agency);
  if (!domain || (domainOverride && String(domainOverride).trim().toLowerCase() !== domain)) {
    throw nluQaSenderError('The retained NLU tutoring QA mail configuration is not ready.', code);
  }
  return { agencyId: Number(agencyId), domain, code };
}

async function prepareNluQaSender(context, identityKey, localPart) {
  const source = await EmailSenderIdentity.findByAgencyAndIdentityKey(6, identityKey);
  const replyTo = source?.reply_to || source?.from_email;
  if (!source?.id || Number(source.agency_id) !== 6 || Number(source.is_active) !== 1
    || String(source.from_email || '').trim().toLowerCase() !== `${localPart}@${context.domain}`
    || !/^[^@\s]+@nextleveluplcc\.com$/i.test(String(replyTo || ''))) {
    throw nluQaSenderError(`Configure an active existing NLU ${identityKey} sender before sending QA email. Sender verification is still required.`, context.code);
  }
  const existing = await EmailSenderIdentity.findByAgencyAndIdentityKey(context.agencyId, identityKey, { includeInactive: true });
  if (existing && (Number(existing.agency_id) !== context.agencyId || Number(existing.is_active) !== 1)) {
    throw nluQaSenderError(`Review the disabled QA ${identityKey} sender before sending email.`, context.code);
  }
  return { source, existing, identityKey,
    values: { displayName: source.display_name || 'Next Level Up Notifications', fromEmail: source.from_email, replyTo } };
}

async function reuseNluQaSender(context, { source, existing, identityKey, values }) {
  let identity = existing;
  if (!identity) identity = await EmailSenderIdentity.create({
    agencyId: context.agencyId, identityKey, ...values, inboundAddresses: [], isActive: true
  });
  else if (identity.from_email !== values.fromEmail || identity.reply_to !== values.replyTo || identity.display_name !== values.displayName) {
    // Updating headers does not replace inbound routes or touch live NLU rows.
    identity = await EmailSenderIdentity.update(identity.id, values);
  }
  return { ...identity, qaSenderSource: { agencyId: 6, identityId: source.id, identityKey } };
}

async function ensureSharedInbox({ agencyId, identity, displayName, identityKey }) {
  if (!identity?.id) return null;
  await CommunicationInbox.ensureFromSenderIdentities?.(agencyId);
  const [rows] = await pool.execute(
    `SELECT * FROM communication_inboxes WHERE agency_id = ? AND sender_identity_id = ? LIMIT 1`,
    [agencyId, identity.id]
  );
  if (rows?.[0]) return rows[0];
  try {
    const [ins] = await pool.execute(
      `INSERT INTO communication_inboxes
        (agency_id, kind, display_name, from_email, identity_key, sender_identity_id, is_active)
       VALUES (?, 'shared', ?, ?, ?, ?, 1)`,
      [agencyId, displayName, identity.from_email, identityKey, identity.id]
    );
    const [created] = await pool.execute(`SELECT * FROM communication_inboxes WHERE id = ?`, [ins.insertId]);
    return created?.[0] || null;
  } catch (e) {
    // Column set may vary — try minimal insert
    console.warn('[tenantMessageMailboxes] inbox ensure:', e?.message || e);
    return null;
  }
}

/**
 * Ensure messages@ + securemessage@ (+ noreply) identities and shared inboxes for an agency.
 */
export async function ensureTenantMessageMailboxes(agencyId, domainOverride = null) {
  const qa = await nluQaSenderContext(agencyId, domainOverride, 'NLU_QA_MESSAGE_SENDERS_NOT_READY');
  if (qa) {
    const plans = [];
    for (const [key, localPart] of [['messages', 'messages'], ['secure_message', 'securemessage'], ['noreply', 'noreply'], ['notifications', 'notifications']]) {
      plans.push(await prepareNluQaSender(qa, key, localPart));
    }
    // Check every required source first. Missing readiness never leaves a
    // partially configured QA mailbox or takes a shared inbound address.
    const identities = [];
    for (const plan of plans) identities.push(await reuseNluQaSender(qa, plan));
    const [messages, secure, noreply, notifications] = identities;
    const messagesInbox = await ensureSharedInbox({ agencyId: qa.agencyId, identity: messages, displayName: 'Messages', identityKey: 'messages' });
    const secureInbox = await ensureSharedInbox({ agencyId: qa.agencyId, identity: secure, displayName: 'Secure Messages', identityKey: 'secure_message' });
    return { domain: qa.domain, messages, secure, noreply, notifications, messagesInbox, secureInbox };
  }
  const domain = String(domainOverride || (await inferAgencyMailDomain(agencyId)) || '')
    .trim()
    .toLowerCase();
  if (!domain) {
    const err = new Error('Agency mail domain is not configured');
    err.status = 400;
    throw err;
  }

  const messages = await ensureIdentity({
    agencyId,
    identityKey: 'messages',
    displayName: 'Messages',
    fromEmail: `messages@${domain}`,
    replyTo: `messages@${domain}`
  });
  const secure = await ensureIdentity({
    agencyId,
    identityKey: 'secure_message',
    displayName: 'Secure Messages',
    fromEmail: `securemessage@${domain}`,
    replyTo: `noreply@${domain}`
  });
  const noreply = await ensureIdentity({
    agencyId,
    identityKey: 'noreply',
    displayName: 'No Reply',
    fromEmail: `noreply@${domain}`,
    replyTo: `noreply@${domain}`
  });
  const notifications = await ensureIdentity({
    agencyId,
    identityKey: 'notifications',
    displayName: 'Notifications',
    fromEmail: `notifications@${domain}`,
    replyTo: `notifications@${domain}`
  });

  const messagesInbox = await ensureSharedInbox({
    agencyId,
    identity: messages,
    displayName: 'Messages',
    identityKey: 'messages'
  });
  const secureInbox = await ensureSharedInbox({
    agencyId,
    identity: secure,
    displayName: 'Secure Messages',
    identityKey: 'secure_message'
  });

  return { domain, messages, secure, noreply, notifications, messagesInbox, secureInbox };
}

/**
 * Real tenant messages@ mailbox for manual compose/reply.
 * Personal App-inbox aliases (haleyi@…) are not Google addresses and bounce.
 */
export async function resolveMessagesSendMailbox(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('agencyId is required to send email');
    err.status = 400;
    throw err;
  }
  const mailboxes = await ensureTenantMessageMailboxes(aid);
  const fromEmail = String(mailboxes.messages?.from_email || '').trim();
  const lower = fromEmail.toLowerCase();
  if (!mailboxes.messages?.id || !fromEmail.includes('@')) {
    const err = new Error('Could not provision messages@ mailbox for this agency');
    err.status = 400;
    throw err;
  }
  if (lower === 'ai@plottwistco.com' || lower.startsWith('ai@')) {
    const err = new Error('This tenant needs a real messages@ address (cannot send as ai@plottwistco.com).');
    err.status = 400;
    throw err;
  }
  return {
    identity: mailboxes.messages,
    inbox: mailboxes.messagesInbox,
    fromEmail: mailboxes.messages.from_email,
    replyTo: mailboxes.messages.reply_to || mailboxes.messages.from_email,
    displayName: mailboxes.messages.display_name || 'Messages'
  };
}

/**
 * Ensure notifications@{domain} sender identity for an agency.
 */
export async function ensureTenantNotificationsMailbox(agencyId, domainOverride = null) {
  // The retained tutoring sandbox shares NLU's already configured sender. It
  // must not claim that live mailbox's globally unique inbound route.
  const qa = await nluQaSenderContext(agencyId, domainOverride, 'NLU_QA_NOTIFICATIONS_SENDER_NOT_READY');
  if (qa) {
    const notifications = await reuseNluQaSender(qa, await prepareNluQaSender(qa, 'notifications', 'notifications'));
    return { domain: qa.domain, notifications };
  }
  const domain = String(domainOverride || (await inferAgencyMailDomain(agencyId)) || '')
    .trim()
    .toLowerCase();
  if (!domain) {
    const err = new Error('Agency mail domain is not configured');
    err.status = 400;
    throw err;
  }
  const notifications = await ensureIdentity({
    agencyId,
    identityKey: 'notifications',
    displayName: 'Notifications',
    fromEmail: `notifications@${domain}`,
    replyTo: `notifications@${domain}`
  });
  return { domain, notifications };
}

export async function listMessageAliasesForAgency(agencyId, { userId = null } = {}) {
  const mailboxes = await ensureTenantMessageMailboxes(agencyId).catch(error => {
    if (error.code === 'NLU_QA_MESSAGE_SENDERS_NOT_READY') throw error;
    return null;
  });
  const shared = mailboxes
    ? [
        {
          id: mailboxes.messages?.id,
          email: mailboxes.messages?.from_email,
          displayName: mailboxes.messages?.display_name || 'Messages',
          kind: 'messages',
          inboxId: mailboxes.messagesInbox?.id || null
        },
        {
          id: mailboxes.secure?.id,
          email: mailboxes.secure?.from_email,
          displayName: mailboxes.secure?.display_name || 'Secure Messages',
          kind: 'secure_message',
          inboxId: mailboxes.secureInbox?.id || null
        }
      ].filter((a) => a.email)
    : [];

  const out = [];
  let personalAliasUnavailableReason = null;
  if (userId) {
    try {
      const { ensureStaffTenantSendAlias } = await import('./personalMailbox.service.js');
      const personal = await ensureStaffTenantSendAlias({ agencyId, userId });
      if (personal?.email && personal.id) {
        out.push({
          id: personal.id,
          email: personal.email,
          displayName: personal.displayName || 'You',
          kind: personal.kind || 'personal',
          inboxId: personal.inboxId || null
        });
      }
    } catch (e) {
      if (e.code === 'NLU_QA_PERSONAL_ALIAS_UNAVAILABLE') personalAliasUnavailableReason = e.message;
      console.warn('[listMessageAliasesForAgency] personal:', e?.message || e);
    }
  }
  for (const a of shared) {
    if (personalAliasUnavailableReason) a.personalAliasUnavailableReason = personalAliasUnavailableReason;
    if (!out.some((x) => String(x.email || '').toLowerCase() === String(a.email || '').toLowerCase())) {
      out.push(a);
    }
  }
  if (userId) {
    const { resolveEmailSendMailbox } = await import('./emailSendMailbox.service.js');
    for (const alias of out.filter(a => ['personal', 'messages'].includes(a.kind))) {
      try {
        const inbox = await CommunicationInbox.findById(alias.inboxId);
        const sender = await resolveEmailSendMailbox({ agencyId, userId, inbox });
        alias.fromEmail = sender.fromEmail;
        alias.replyTo = sender.replyTo;
        alias.routing = sender.routing;
      } catch {
        alias.sendingUnavailable = true;
      }
    }
  }
  return out;
}

/** Clinical portal forms always use the tenant's forms mailbox and staffed support replies. */
export async function ensureTenantFormsMailbox(agencyId) {
  const domain=await inferAgencyMailDomain(agencyId);
  if(!domain||!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))throw new Error('Agency mail domain is not configured');
  const forms=await ensureIdentity({agencyId,identityKey:'forms',displayName:'Forms · AuricWell',fromEmail:`forms@${domain}`,replyTo:`support@${domain}`});
  if(Number(forms?.is_active)!==1||Number(forms.agency_id)!==Number(agencyId)||String(forms.from_email).toLowerCase()!==`forms@${domain}`)throw new Error('Configure the agency forms sender before sending notifications');
  return {forms,domain};
}
