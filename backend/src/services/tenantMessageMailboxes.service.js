/**
 * Tenant shared message mailboxes: messages@{domain} and securemessage@{domain}.
 */
import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';

export const TENANT_MESSAGE_DOMAINS = [
  'plottwistco.com',
  'itsco.health',
  'innerstrengthin.com',
  'nextleveluplcc.com',
  'mh4kidz.com',
  'risereviveco.com'
];

export async function inferAgencyMailDomain(agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    const flags =
      typeof rows?.[0]?.feature_flags === 'string'
        ? JSON.parse(rows[0].feature_flags || '{}')
        : rows?.[0]?.feature_flags || {};
    const fromFlags = String(flags.workspaceEmailDomain || flags.mailDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    if (fromFlags) return fromFlags;
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

  return { domain, messages, secure, noreply, messagesInbox, secureInbox };
}

export async function listMessageAliasesForAgency(agencyId) {
  const mailboxes = await ensureTenantMessageMailboxes(agencyId).catch(() => null);
  if (!mailboxes) return [];
  return [
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
  ].filter((a) => a.email);
}
