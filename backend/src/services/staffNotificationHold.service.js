import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const STAFF_TEXT_PURPOSES = ['workforce', 'polling'];

function phonesFor(user) {
  return [...new Set([user?.personal_phone, user?.work_phone, user?.phone_number].map(normalizeSmsPhone).filter(Boolean))];
}

async function openHold(db, userId) {
  const [rows] = await db.execute(
    'SELECT user_id FROM staff_notification_holds WHERE user_id = ? AND restored_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

export async function holdStaffPersonalNotifications(userId, database = pool) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) return { held: false };
  const db = database;
  const [[user]] = await db.execute(
    'SELECT id, personal_phone, work_phone, phone_number FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  if (!user || await openHold(db, id)) return { held: false, reason: user ? 'already_held' : 'missing' };
  const [[emailPref]] = await db.execute(
    'SELECT personal_email_notify FROM user_communication_prefs WHERE user_id = ? LIMIT 1',
    [id]
  );
  const [[smsPref]] = await db.execute(
    'SELECT sms_enabled FROM user_preferences WHERE user_id = ? LIMIT 1',
    [id]
  );
  const phones = phonesFor(user);
  let permissions = [];
  if (phones.length) {
    const marks = phones.map(() => '?').join(',');
    const purposeMarks = STAFF_TEXT_PURPOSES.map(() => '?').join(',');
    const [rows] = await db.execute(
      `SELECT scope_key, phone, purpose, status, evidence_json
       FROM sms_recipient_permissions
       WHERE phone IN (${marks}) AND purpose IN (${purposeMarks}) AND status = 'opted_in'`,
      [...phones, ...STAFF_TEXT_PURPOSES]
    );
    permissions = rows || [];
  }
  await db.execute(
    `INSERT INTO staff_notification_holds
      (user_id, personal_email_notify, had_personal_email_pref, sms_enabled, had_user_preferences, permissions_json, held_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      id,
      emailPref ? Number(emailPref.personal_email_notify) : null,
      emailPref ? 1 : 0,
      smsPref ? Number(smsPref.sms_enabled) : null,
      smsPref ? 1 : 0,
      JSON.stringify(permissions)
    ]
  );
  if (emailPref) await db.execute('UPDATE user_communication_prefs SET personal_email_notify = 0 WHERE user_id = ?', [id]);
  if (smsPref) await db.execute('UPDATE user_preferences SET sms_enabled = 0 WHERE user_id = ?', [id]);
  for (const permission of permissions) {
    const evidence = JSON.stringify({
      source: 'employment_inactive',
      heldAt: new Date().toISOString(),
      userId: id,
      previousStatus: permission.status
    });
    await db.execute(
      `UPDATE sms_recipient_permissions
       SET status = 'opted_out', evidence_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE scope_key = ? AND phone = ? AND purpose = ? AND status = 'opted_in'`,
      [evidence, permission.scope_key, permission.phone, permission.purpose]
    );
    await db.execute(
      `INSERT INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id)
       VALUES (?, ?, ?, 'opted_out', ?, NULL)`,
      [permission.scope_key, permission.phone, permission.purpose, evidence]
    );
  }
  return { held: true, permissions: permissions.length };
}

export async function restoreStaffPersonalNotifications(userId, database = pool) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) return { restored: false };
  const db = database;
  const [[hold]] = await db.execute(
    'SELECT * FROM staff_notification_holds WHERE user_id = ? AND restored_at IS NULL LIMIT 1',
    [id]
  );
  if (!hold) return { restored: false };
  if (hold.had_personal_email_pref) {
    await db.execute(
      'UPDATE user_communication_prefs SET personal_email_notify = ? WHERE user_id = ?',
      [Number(hold.personal_email_notify) ? 1 : 0, id]
    );
  }
  if (hold.had_user_preferences) {
    await db.execute('UPDATE user_preferences SET sms_enabled = ? WHERE user_id = ?', [Number(hold.sms_enabled) ? 1 : 0, id]);
  }
  const permissions = parse(hold.permissions_json) || [];
  for (const permission of permissions) {
    const [current] = await db.execute(
      `SELECT status, evidence_json FROM sms_recipient_permissions
       WHERE scope_key = ? AND phone = ? AND purpose = ? LIMIT 1`,
      [permission.scope_key, permission.phone, permission.purpose]
    );
    const evidence = parse(current[0]?.evidence_json);
    if (current[0]?.status !== 'opted_out' || evidence?.source !== 'employment_inactive') continue;
    const previous = typeof permission.evidence_json === 'string'
      ? permission.evidence_json
      : JSON.stringify(permission.evidence_json || {});
    await db.execute(
      `UPDATE sms_recipient_permissions
       SET status = 'opted_in', evidence_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE scope_key = ? AND phone = ? AND purpose = ?`,
      [previous, permission.scope_key, permission.phone, permission.purpose]
    );
    await db.execute(
      `INSERT INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id)
       VALUES (?, ?, ?, 'opted_in', ?, NULL)`,
      [permission.scope_key, permission.phone, permission.purpose, previous]
    );
  }
  await db.execute('UPDATE staff_notification_holds SET restored_at = UTC_TIMESTAMP() WHERE user_id = ? AND restored_at IS NULL', [id]);
  return { restored: true };
}
