import pool from '../config/database.js';
import User from '../models/User.model.js';
import { hasEstablishedPortalPassword } from '../utils/portalAccountCredentials.js';

export async function preparePortalInvitationAccess(user, { db = pool, users = User } = {}) {
  const existingAccount = hasEstablishedPortalPassword(user);
  if (existingAccount) return { existingAccount, tokenResult: null };
  // Invitations from another agency must not invalidate a usable setup link.
  const [tokens] = await db.execute(`SELECT passwordless_token AS token FROM users
    WHERE id = ? AND passwordless_token_purpose = 'setup'
      AND passwordless_token IS NOT NULL AND passwordless_token_expires_at > NOW() LIMIT 1`, [user.id]);
  const tokenResult = tokens?.[0] || await users.generatePasswordlessToken(user.id, 48, 'setup');
  return { existingAccount, tokenResult };
}
