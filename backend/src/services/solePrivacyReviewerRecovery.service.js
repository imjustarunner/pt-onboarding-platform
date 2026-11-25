import pool from '../config/database.js';
import { MFA_STAFF_ROLES } from '../utils/accountSecurity.js';

export function soleReviewerRecoveryAllowed(userId, rows) {
  const active = rows.filter(row => !row.revoked_at && Number(row.is_active) === 1 && !Number(row.is_archived)
    && !['ARCHIVED', 'INACTIVE', 'TERMINATED', 'DISABLED'].includes(String(row.status || '').toUpperCase())
    && MFA_STAFF_ROLES.has(row.role));
  return active.length === 1 && Number(active[0].user_id) === Number(userId)
    && ['super_admin', 'superadmin'].includes(active[0].role);
}

export async function mayRecoverOwnFileHold(userId, { database = pool, lock = false } = {}) {
  // The locking read protects the reviewer roster through the recovery commit.
  // Do not trust a count or permission sent by the browser.
  const [rows] = await database.execute(`SELECT p.user_id,p.revoked_at,u.role,u.status,u.is_active,u.is_archived
    FROM privacy_reviewers p JOIN users u ON u.id=p.user_id ORDER BY p.user_id${lock ? ' FOR UPDATE' : ''}`);
  return soleReviewerRecoveryAllowed(userId, rows);
}
