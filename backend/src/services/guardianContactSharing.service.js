import pool from '../config/database.js';

const fields = ['name', 'email', 'phone'];
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) || {} : value || {}; } catch { return {}; } };
const fail = (message, status = 403) => Object.assign(new Error(message), { status });
export function guardianContactSharing(permissions) {
  const saved = parse(permissions).contactSharing || {};
  return Object.fromEntries(fields.map(key => [key, saved[key] !== false]));
}
export async function guardianContactRows(clientId, db = pool) {
  if(!Number.isSafeInteger(Number(clientId)) || Number(clientId)<1)throw fail('Choose a valid dependent.',400);
  const [rows] = await db.execute(`SELECT cg.guardian_user_id AS id, cg.access_enabled, cg.permissions_json,
    u.first_name, u.last_name, u.email, u.personal_email,
    COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),u.work_phone) AS phone
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=?`, [clientId]);
  return rows;
}
function ownContact(rows, userId) {
  const own = rows.find(row => Number(row.id) === Number(userId) && Number(row.access_enabled));
  if (!own) throw fail('An active guardian relationship is required.');
  return own;
}
export function sharedGuardianContact(row, viewerId, viewerPermissions = {}) {
  const own = Number(row.id) === Number(viewerId);
  const restrictions = parse(viewerPermissions);
  const hidden = restrictions.noView || restrictions.noViewOtherGuardian || parse(row.permissions_json).noViewOtherGuardian;
  const choices = guardianContactSharing(row.permissions_json);
  const show = key => own || (!hidden && choices[key]);
  return { id: Number(row.id), name: show('name') ? [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Guardian' : 'Guardian',
    email: show('email') ? row.email || null : null, phone: show('phone') ? row.phone || null : null,
    hiddenFields: fields.filter(key => !show(key)) };
}
export async function readGuardianContactSharing(clientId, userId, db = pool) {
  const rows = await guardianContactRows(clientId, db), own = ownContact(rows, userId);
  return { sharing: guardianContactSharing(own.permissions_json),
    contacts: rows.filter(row => Number(row.access_enabled)).map(row => sharedGuardianContact(row, userId, own.permissions_json)) };
}
export async function saveGuardianContactSharing(clientId, userId, sharing, db = pool) {
  if (!sharing || Object.keys(sharing).length !== fields.length || fields.some(key => typeof sharing[key] !== 'boolean')
      || Object.keys(sharing).some(key => !fields.includes(key))) throw fail('Choose whether to share your name, email and phone.', 400);
  ownContact(await guardianContactRows(clientId, db), userId);
  // Update only this user's preferences, retaining every access/clinical permission.
  const [result] = await db.execute(`UPDATE client_guardians SET permissions_json=JSON_SET(COALESCE(permissions_json,JSON_OBJECT()),
    '$.contactSharing', CAST(? AS JSON)) WHERE client_id=? AND guardian_user_id=? AND access_enabled=1`,
  [JSON.stringify(sharing), clientId, userId]);
  if (!result.affectedRows) throw fail('Your guardian access changed. Refresh before saving.');
  return readGuardianContactSharing(clientId, userId, db);
}
export function sharedHistoryRecipient(value, channel, rows, viewerId) {
  const own = ownContact(rows, viewerId);
  const raw = String(value || '').trim();
  const normalizePhone = v => {const digits=String(v || '').replace(/\D/g, '');return digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;};
  const row = rows.find(contact => channel === 'sms'
    ? normalizePhone(raw) && normalizePhone(contact.phone) === normalizePhone(raw)
    : channel === 'email'
      ? [contact.email, contact.personal_email].some(email => email && raw.toLowerCase() === String(email).trim().toLowerCase())
      : raw === [contact.first_name, contact.last_name].filter(Boolean).join(' '));
  if (!row) return channel === 'in_app' ? 'Account notification' : 'Authorized account contact';
  const contact = sharedGuardianContact(row, viewerId, own.permissions_json);
  const field = channel === 'email' ? 'email' : channel === 'sms' ? 'phone' : 'name';
  return contact.hiddenFields.includes(field) ? 'Guardian (contact details hidden)' : raw;
}

export async function redactGuardianThreadAuthors(threadId, viewerId, messages, db = pool) {
  const [links] = await db.execute('SELECT DISTINCT client_id FROM guardian_client_threads WHERE thread_id=?', [threadId]);
  if (!links.length) return messages;
  const hidden = new Set();
  for (const link of links) {
    const rows = await guardianContactRows(link.client_id, db);
    const own = ownContact(rows, viewerId);
    for (const row of rows) if (sharedGuardianContact(row, viewerId, own.permissions_json).hiddenFields.includes('name')) hidden.add(Number(row.id));
  }
  return messages.map(message => hidden.has(Number(message.sender_user_id)) ? { ...message,
    sender_first_name: 'Guardian', sender_last_name: '', sender_profile_photo_path: null } : message);
}
