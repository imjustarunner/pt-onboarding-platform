import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';

const ELIGIBLE_ROLES = new Set([
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'schedule_manager',
  'supervisor',
  'intern'
]);

export function isPersonalMailboxEligibleRole(role) {
  return ELIGIBLE_ROLES.has(String(role || '').toLowerCase());
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function normalizeNamePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveWorkspaceDomain(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (!v) return null;
  return v.startsWith('@') ? v.slice(1) : v;
}

function resolveWorkspaceFormat(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (!v) return 'first_last_initial';
  if (['first', 'first_name', 'firstname'].includes(v)) return 'first';
  if (
    ['first_last_initial', 'firstlastinitial', 'firstname_lastinitial', 'firstnameL', 'firstl'].includes(v)
  ) {
    return 'first_last_initial';
  }
  if (['first_initial_last', 'firstinitiallast', 'flast'].includes(v)) return 'first_initial_last';
  if (['last_first_initial', 'lastfirstinitial', 'lastf'].includes(v)) return 'last_first_initial';
  if (['first_last', 'firstlast', 'first.last'].includes(v)) return 'first_last';
  return 'first_last_initial';
}

function buildLocalPart(user, format) {
  const first = normalizeNamePart(user?.first_name);
  const last = normalizeNamePart(user?.last_name);
  if (!first && !last) return `user${user?.id || ''}`;
  if (format === 'first') return first || last;
  if (format === 'first_last_initial') return `${first || 'user'}${(last || 'x')[0]}`;
  if (format === 'last_first_initial') return `${last || 'user'}${(first || 'x')[0]}`;
  if (format === 'first_last') return [first, last].filter(Boolean).join('.');
  return `${(first || 'x')[0]}${last || first}`;
}

async function uniqueAliasEmail({ agencyId, user, domain, format }) {
  const base = buildLocalPart(user, format) || `user${user.id}`;
  for (let i = 0; i < 200; i += 1) {
    const local = i === 0 ? base : `${base}${i}`;
    const email = `${local}@${domain}`.toLowerCase();
    const [rows] = await pool.execute(
      `SELECT id FROM email_sender_identities
       WHERE agency_id = ? AND LOWER(from_email) = ?
       LIMIT 1`,
      [agencyId, email]
    );
    if (!rows[0]) {
      const [inboxRows] = await pool.execute(
        `SELECT id FROM communication_inboxes
         WHERE agency_id = ? AND LOWER(from_email) = ?
         LIMIT 1`,
        [agencyId, email]
      );
      if (!inboxRows[0]) return email;
    }
  }
  return `u${user.id}.${Date.now().toString(36)}@${domain}`.toLowerCase();
}

/**
 * Ensure a personal communication inbox + sender identity + membership for a user.
 * Does not create a Google Workspace seat — alias is app-routed via EmailSenderIdentity.
 */
export async function ensurePersonalMailbox({ agencyId, userId, actorUserId = null }) {
  const uid = Number(userId);
  const aid = Number(agencyId);
  if (!uid || !aid) throw new Error('agencyId and userId are required');

  const user = await User.findById(uid);
  if (!user) throw new Error('User not found');
  if (!isPersonalMailboxEligibleRole(user.role)) {
    throw new Error('This role is not eligible for an app mailbox');
  }

  // Prefer existing personal inbox
  const [existing] = await pool.execute(
    `SELECT * FROM communication_inboxes
     WHERE agency_id = ? AND kind = 'personal' AND owner_user_id = ?
     LIMIT 1`,
    [aid, uid]
  );
  if (existing[0]) {
    await ensureMember(existing[0].id, uid, 'owner');
    return CommunicationInbox.findById(existing[0].id);
  }

  const agency = await Agency.findById(aid);
  const flags = parseFeatureFlags(agency?.feature_flags);
  const domain =
    resolveWorkspaceDomain(flags.workspaceEmailDomain) ||
    resolveWorkspaceDomain(process.env.WORKSPACE_EMAIL_DOMAIN) ||
    'plottwisthq.com';
  const format = resolveWorkspaceFormat(flags.workspaceEmailFormat);
  const fromEmail = await uniqueAliasEmail({ agencyId: aid, user, domain, format });
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || fromEmail;
  const identityKey = `personal_${uid}`;

  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, identityKey);

  if (!identity) {
    identity = await EmailSenderIdentity.create({
      agencyId: aid,
      identityKey,
      displayName,
      fromEmail,
      replyTo: fromEmail,
      inboundAddresses: [fromEmail],
      isActive: true
    });
  } else if (Number(identity.is_active) === 0) {
    identity = await EmailSenderIdentity.update(identity.id, { isActive: true });
  }

  const [ins] = await pool.execute(
    `INSERT INTO communication_inboxes
     (agency_id, sender_identity_id, kind, owner_user_id, identity_key, display_name, from_email, is_active)
     VALUES (?, ?, 'personal', ?, ?, ?, ?, 1)`,
    [aid, identity.id, uid, identityKey, `${displayName} (My Inbox)`, fromEmail]
  );

  const inboxId = ins.insertId;
  await ensureMember(inboxId, uid, 'owner');

  if (actorUserId && Number(actorUserId) !== uid) {
    // no-op audit hook point
  }

  return CommunicationInbox.findById(inboxId);
}

async function ensureMember(inboxId, userId, role = 'owner') {
  await pool.execute(
    `INSERT INTO communication_inbox_members (inbox_id, user_id, role)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [inboxId, userId, role]
  );
}

export async function findPersonalInbox({ agencyId, userId }) {
  const [rows] = await pool.execute(
    `SELECT * FROM communication_inboxes
     WHERE agency_id = ? AND kind = 'personal' AND owner_user_id = ? AND is_active = 1
     LIMIT 1`,
    [agencyId, userId]
  );
  return rows[0] || null;
}

/**
 * Ensure a personal communication inbox + sender identity for a specific address
 * (hire Google Group work email). Registers inbound routes so Gmail poll delivers
 * into this user's My Inbox in the app.
 */
export async function ensurePersonalMailboxForAddress({
  agencyId,
  userId,
  fromEmail,
  displayName = null,
  actorUserId = null
} = {}) {
  const uid = Number(userId);
  const aid = Number(agencyId);
  const email = String(fromEmail || '')
    .trim()
    .toLowerCase();
  if (!uid || !aid || !email.includes('@')) {
    throw new Error('agencyId, userId, and fromEmail are required');
  }

  const user = await User.findById(uid);
  if (!user) throw new Error('User not found');
  const role = String(user.role || '').toLowerCase();
  const status = String(user.status || '').toUpperCase();
  const prehireStatus = ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'PROSPECTIVE'].includes(status);
  if (!isPersonalMailboxEligibleRole(role) && !prehireStatus) {
    throw new Error('This role is not eligible for an app mailbox');
  }

  const name =
    String(displayName || '').trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    email;
  const identityKey = `personal_${uid}`;

  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, identityKey);
  if (!identity) {
    identity = await EmailSenderIdentity.create({
      agencyId: aid,
      identityKey,
      displayName: name,
      fromEmail: email,
      replyTo: email,
      inboundAddresses: [email],
      isActive: true
    });
  } else {
    identity = await EmailSenderIdentity.update(identity.id, {
      displayName: name,
      fromEmail: email,
      replyTo: email,
      inboundAddresses: [email],
      isActive: true
    });
  }

  const [existing] = await pool.execute(
    `SELECT * FROM communication_inboxes
     WHERE agency_id = ? AND kind = 'personal' AND owner_user_id = ?
     LIMIT 1`,
    [aid, uid]
  );

  let inboxId = existing[0]?.id || null;
  if (inboxId) {
    await pool.execute(
      `UPDATE communication_inboxes
       SET sender_identity_id = ?, identity_key = ?, display_name = ?, from_email = ?, is_active = 1
       WHERE id = ?`,
      [identity.id, identityKey, `${name} (My Inbox)`, email, inboxId]
    );
  } else {
    const [ins] = await pool.execute(
      `INSERT INTO communication_inboxes
       (agency_id, sender_identity_id, kind, owner_user_id, identity_key, display_name, from_email, is_active)
       VALUES (?, ?, 'personal', ?, ?, ?, ?, 1)`,
      [aid, identity.id, uid, identityKey, `${name} (My Inbox)`, email]
    );
    inboxId = ins.insertId;
  }

  await ensureMember(inboxId, uid, 'owner');
  if (actorUserId && Number(actorUserId) !== uid) {
    // audit hook point
  }
  return CommunicationInbox.findById(inboxId);
}

/**
 * Ingest an inbound Gmail message into a personal My Inbox conversation.
 */
export async function ingestPersonalMailboxInbound({
  agencyId,
  identity,
  fromEmail,
  subject,
  bodyText,
  messageIdHeader = null,
  threadId = null,
  receivedAt = null,
  to = [],
  cc = []
} = {}) {
  const aid = Number(agencyId || identity?.agency_id || 0);
  const key = String(identity?.identity_key || '').trim().toLowerCase();
  const ownerMatch = /^personal_(\d+)$/.exec(key);
  const ownerUserId = ownerMatch ? Number(ownerMatch[1]) : null;
  if (!aid || !identity?.id) return { ingested: false, reason: 'missing_identity' };

  const CommunicationConversation = (await import('../models/CommunicationConversation.model.js')).default;

  let inbox = null;
  const [inboxRows] = await pool.execute(
    `SELECT * FROM communication_inboxes
     WHERE sender_identity_id = ? AND is_active = 1
     LIMIT 1`,
    [identity.id]
  );
  inbox = inboxRows[0] || null;
  if (!inbox && ownerUserId) {
    inbox = await findPersonalInbox({ agencyId: aid, userId: ownerUserId });
  }
  if (!inbox) return { ingested: false, reason: 'no_inbox' };

  const ownerId = Number(inbox.owner_user_id || ownerUserId || 0) || null;
  const msgId = String(messageIdHeader || '').trim() || null;
  if (msgId) {
    const [dup] = await pool.execute(
      `SELECT id FROM communication_messages WHERE internet_message_id = ? LIMIT 1`,
      [msgId]
    );
    if (dup[0]) return { ingested: false, reason: 'duplicate', conversationId: null };
  }

  let conv = threadId
    ? await CommunicationConversation.findByExternalThreadId(aid, String(threadId))
    : null;
  if (conv && inbox.id && Number(conv.inbox_id) !== Number(inbox.id)) {
    conv = null;
  }

  const preview = String(bodyText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  const when = receivedAt || new Date();

  if (!conv) {
    conv = await CommunicationConversation.create({
      agencyId: aid,
      inboxId: inbox.id,
      channel: 'email',
      subject: subject || '(no subject)',
      status: 'needs_reply',
      priority: 'normal',
      ownerUserId: ownerId,
      lastMessageAt: when,
      lastMessagePreview: preview || null,
      externalThreadId: threadId ? String(threadId) : null
    });
  } else {
    await CommunicationConversation.update(conv.id, {
      status: conv.status === 'resolved' ? 'needs_reply' : conv.status || 'needs_reply',
      lastMessageAt: when,
      lastMessagePreview: preview || conv.last_message_preview
    });
  }

  if (fromEmail) {
    await CommunicationConversation.upsertParticipant(conv.id, {
      kind: 'external',
      email: String(fromEmail).trim().toLowerCase(),
      displayName: String(fromEmail).trim(),
      isPrimary: true
    });
  }

  const messageDbId = await CommunicationConversation.addMessage({
    conversationId: conv.id,
    channel: 'email',
    direction: 'inbound',
    from: fromEmail ? { email: fromEmail, name: fromEmail } : null,
    to: (to || []).map((e) => ({ email: e })),
    cc: (cc || []).map((e) => ({ email: e })),
    subject: subject || null,
    bodyText: bodyText || '',
    internetMessageId: msgId,
    sentAt: when
  });

  try {
    const { processInboundCommunicationEvent } = await import('./inboundCommunication.service.js');
    await processInboundCommunicationEvent({
      agencyId: aid,
      conversationId: conv.id,
      messageId: messageDbId,
      fromEmail,
      subject,
      bodyText: bodyText || ''
    });
  } catch (e) {
    console.warn('[personalMailbox] inbound post-process failed:', e?.message || e);
  }

  return { ingested: true, conversationId: conv.id, messageId: messageDbId, inboxId: inbox.id };
}

export function isPersonalMailboxIdentity(identity) {
  const key = String(identity?.identity_key || '').trim().toLowerCase();
  return key.startsWith('personal_');
}
