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
  if (!v) return 'first_initial_last';
  if (['first', 'first_name', 'firstname'].includes(v)) return 'first';
  if (['first_initial_last', 'firstinitiallast', 'flast'].includes(v)) return 'first_initial_last';
  if (['last_first_initial', 'lastfirstinitial', 'lastf'].includes(v)) return 'last_first_initial';
  if (['first_last', 'firstlast', 'first.last'].includes(v)) return 'first_last';
  return 'first_initial_last';
}

function buildLocalPart(user, format) {
  const first = normalizeNamePart(user?.first_name);
  const last = normalizeNamePart(user?.last_name);
  if (!first && !last) return `user${user?.id || ''}`;
  if (format === 'first') return first || last;
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
