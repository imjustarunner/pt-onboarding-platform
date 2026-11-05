import pool from '../config/database.js';
import { departmentalGroupKeysForUser, normalizeDepartmentalGroupKey } from './departmentalGroupPolicy.js';
export { DEPARTMENTAL_GROUPS, groupKeyForIdentity, departmentalGroupKeysForUser } from './departmentalGroupPolicy.js';

export async function listUserDepartmentalGroupKeys({ agencyId, userId, db = pool }) {
  if (!Number(agencyId) || !Number(userId)) return [];
  const [rows] = await db.execute(`SELECT u.*,ua.agency_role,ua.is_active AS membership_active,
    ua.has_payroll_access,ua.has_billing_access,ua.can_manage_credentialing
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE u.id=? AND ua.agency_id=? LIMIT 1`, [userId, agencyId]);
  return departmentalGroupKeysForUser(rows[0]);
}

export async function canAccessDepartmentalGroup({ agencyId, userId, groupKey, db = pool }) {
  const key = normalizeDepartmentalGroupKey(groupKey);
  return !!key && (await listUserDepartmentalGroupKeys({ agencyId, userId, db })).includes(key);
}

export async function assertDepartmentalGroupAccess(args) {
  if (!await canAccessDepartmentalGroup(args)) throw Object.assign(new Error('You do not have access to this agency group mailbox.'), {
    status: 403, code: 'DEPARTMENTAL_GROUP_ACCESS_REQUIRED'
  });
}
