import pool from '../config/database.js';
import UserCommunication from '../models/UserCommunication.model.js';
import { AURICWELL_QA_SLUG } from '../utils/auricwellQaPolicy.js';

const denied = () => Object.assign(new Error('Test email inbox not available for this account'), { status: 404 });
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export function emailAddresses(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
}

// The original recipient is authoritative. A caller-supplied userId, a client
// relationship, or the shared testing mailbox must never grant inbox access.
export function isOwnQaEmail(row, account) {
  const metadata = parse(row.metadata);
  // The sender's redirect receipt includes original To/Cc/Bcc recipients. It
  // must be an actual test redirect, never an arbitrary metadata email field.
  const redirectedRecipients = metadata.testInboxRedirect === true ? emailAddresses(metadata.originalTo) : [];
  return Number(row.agency_id) === Number(account.agency_id)
    && row.channel === 'email'
    && [...emailAddresses(row.recipient_address), ...redirectedRecipients].includes(account.email.toLowerCase());
}

async function ownAccount(user, db) {
  const [[account]] = await db.execute(`SELECT u.id, u.email, a.id AS agency_id, a.feature_flags
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE u.id=? AND u.is_demo=1 AND a.slug=?`, [user?.id || 0, AURICWELL_QA_SLUG]);
  if (!account || !/^[^@\s]+@example\.com$/i.test(account.email || '')
    || parse(account.feature_flags)?.qaSandbox?.syntheticOnly !== true) throw denied();
  // Duplicate identities are a setup error, not a shared inbox.
  const [[count]] = await db.execute('SELECT COUNT(*) AS total FROM users WHERE LOWER(email)=LOWER(?)', [account.email]);
  if (Number(count?.total) !== 1) throw denied();
  return account;
}

function receipt(row) {
  const metadata = parse(row.metadata);
  return {
    id: row.id, channel: 'email', subject: row.subject, recipient: row.recipient_address,
    from: metadata.fromEmail || metadata.from || null,
    deliveryStatus: row.delivery_status, generatedAt: row.generated_at,
    sentAt: row.sent_at, deliveredAt: row.delivered_at,
    // This is a transport receipt, not evidence of arrival in the real inbox.
    transportMessageId: row.external_message_id || null,
    redirectedTo: metadata.deliveredTo || null
  };
}

export async function listOwnQaEmails(user, { beforeId = null } = {}, db = pool) {
  const account = await ownAccount(user, db);
  const before = beforeId == null ? Number.MAX_SAFE_INTEGER : Number(beforeId);
  if (!Number.isSafeInteger(before) || before < 1) throw Object.assign(new Error('Invalid email cursor'), { status: 400 });
  // Fetch metadata only; message bodies require a separate, equally scoped read.
  const [rows] = await db.execute(`SELECT id, agency_id, channel, subject, recipient_address,
    delivery_status, generated_at, sent_at, delivered_at, external_message_id, metadata
    FROM user_communications WHERE agency_id=? AND channel='email' AND id<?
      AND (LOCATE(LOWER(?), LOWER(recipient_address))>0
        OR LOCATE(LOWER(?), LOWER(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.originalTo'))))>0)
    ORDER BY id DESC LIMIT 100`,
  [account.agency_id, before, account.email, account.email]);
  return { address: account.email, items: rows.filter(row => isOwnQaEmail(row, account)).map(receipt),
    nextCursor: rows.length === 100 ? rows.at(-1).id : null };
}

export async function readOwnQaEmail(user, id, db = pool) {
  const account = await ownAccount(user, db);
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw denied();
  const [[row]] = await db.execute(`SELECT id, agency_id, channel, subject, recipient_address,
    delivery_status, generated_at, sent_at, delivered_at, external_message_id, metadata, body, template_type
    FROM user_communications WHERE id=? AND agency_id=? AND channel='email'`, [id, account.agency_id]);
  if (!row || !isOwnQaEmail(row, account)) throw denied();
  return { ...receipt(row), body: UserCommunication.hydrateBody(row).body || '' };
}
