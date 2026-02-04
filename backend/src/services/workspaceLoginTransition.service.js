import pool from '../config/database.js';
import User from '../models/User.model.js';

async function hasUserLoginEmailTable() {
  try {
    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [tables] = await pool.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' LIMIT 1",
      [dbName]
    );
    return Array.isArray(tables) && tables.length > 0;
  } catch {
    return false;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function upsertLoginAlias({ userId, agencyId = null, email }) {
  const alias = normalizeEmail(email);
  if (!alias || !alias.includes('@')) return;
  if (!(await hasUserLoginEmailTable())) return;
  await pool.execute(
    `INSERT INTO user_login_emails (user_id, agency_id, email)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
    [userId, agencyId, alias]
  );
}

async function removeLoginAlias({ userId, email }) {
  const alias = normalizeEmail(email);
  if (!alias || !alias.includes('@')) return;
  if (!(await hasUserLoginEmailTable())) return;
  await pool.execute(
    'DELETE FROM user_login_emails WHERE user_id = ? AND email = ?',
    [userId, alias]
  );
}

async function getPrimaryAgencyId(userId) {
  try {
    const agencies = await User.getAgencies(userId);
    return agencies?.[0]?.id ? Number(agencies[0].id) : null;
  } catch {
    return null;
  }
}

export async function enableWorkspaceLoginForUser(userId) {
  const user = typeof userId === 'object' ? userId : await User.findById(userId);
  if (!user) throw new Error('User not found');

  const workEmail = normalizeEmail(user.work_email);
  if (!workEmail) throw new Error('Work email is required to enable workspace login');

  const currentEmail = normalizeEmail(user.email);
  const agencyId = await getPrimaryAgencyId(user.id);

  if (currentEmail && currentEmail !== workEmail) {
    await User.update(user.id, { email: workEmail });
    await upsertLoginAlias({ userId: user.id, agencyId, email: currentEmail });
  } else if (!currentEmail) {
    await User.update(user.id, { email: workEmail });
  }

  return { workEmail, previousEmail: currentEmail || null };
}

export async function enforceWorkspaceLoginForUser(userId) {
  const user = typeof userId === 'object' ? userId : await User.findById(userId);
  if (!user) throw new Error('User not found');

  const workEmail = normalizeEmail(user.work_email);
  if (!workEmail) return { workEmail: null };

  const currentEmail = normalizeEmail(user.email);
  if (currentEmail !== workEmail) {
    await User.update(user.id, { email: workEmail });
  }

  const personalEmail = normalizeEmail(user.personal_email);
  if (personalEmail && personalEmail !== workEmail) {
    await removeLoginAlias({ userId: user.id, email: personalEmail });
  }

  if (currentEmail && currentEmail !== workEmail) {
    await removeLoginAlias({ userId: user.id, email: currentEmail });
  }

  return { workEmail };
}
