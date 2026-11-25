import pool from '../config/database.js';
import { isStaffAccount, isInactiveStaffAccount } from '../utils/staffEligibility.js';
import { accessProfileSchemaReady, agencyIdsWithPermission, readAgencyAccess } from './agencyAccessProfiles.service.js';

const enabled = value => [true, 1, '1'].includes(value);
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

async function activeActor(userId, db) {
  if (!positive(userId)) return null;
  const [[user]] = await db.execute(`SELECT u.id,u.role,u.email,u.work_email,u.is_active,u.is_archived,
    u.is_assistant_account,u.is_demo,u.status,u.has_hiring_access
    FROM users u WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND COALESCE(u.is_demo,0)=0 AND u.terminated_at IS NULL`, [userId]);
  return user && isStaffAccount(user) && !isInactiveStaffAccount(user) && !enabled(user.is_demo)
    && ['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(user.status || '').toUpperCase()) ? user : null;
}

/** People Operations follows the selected company's hiring permission. Payroll
 * rights, queue ownership, and a broad staff role do not substitute for it. */
export async function canAccessPeopleOperations(userId, agencyId, db = pool) {
  if (!positive(agencyId)) return false;
  const user = await activeActor(userId, db);
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (await accessProfileSchemaReady(db)) {
    const access = await readAgencyAccess(user.id, agencyId, db);
    return enabled(access?.permissions?.has_hiring_access);
  }
  if (!enabled(user.has_hiring_access)) return false;
  const [[membership]] = await db.execute(`SELECT ua.agency_id FROM user_agencies ua
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 LIMIT 1`, [user.id, agencyId]);
  return !!membership;
}

export async function peopleOperationsAgencyIds(userId, db = pool) {
  const user = await activeActor(userId, db);
  if (!user) return [];
  if (user.role === 'super_admin') {
    const [agencies] = await db.execute('SELECT id FROM agencies WHERE is_active=1 AND COALESCE(is_archived,0)=0');
    return agencies.map(row => Number(row.id));
  }
  if (await accessProfileSchemaReady(db)) {
    const ids = await agencyIdsWithPermission(user.id, 'has_hiring_access', db);
    const allowed = await Promise.all(ids.map(agencyId => canAccessPeopleOperations(user.id, agencyId, db)));
    return ids.filter((_, index) => allowed[index]);
  }
  if (!enabled(user.has_hiring_access)) return [];
  const [memberships] = await db.execute(`SELECT ua.agency_id FROM user_agencies ua
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1`, [user.id]);
  return memberships.map(row => Number(row.agency_id));
}

/** Apply before counting/pagination. Requesters retain their own conversations;
 * a previous staff claim does not preserve access after permission is removed. */
export async function appendPeopleOperationsTicketVisibility(userId, where, params, db = pool) {
  const user = await activeActor(userId, db);
  if (user?.role === 'super_admin') return;
  const ids = user ? await peopleOperationsAgencyIds(user.id, db) : [];
  where.push(`(LOWER(COALESCE(t.topic,''))<>'people_operations' OR t.created_by_user_id=?${ids.length ? ` OR t.agency_id IN (${ids.map(() => '?').join(',')})` : ''})`);
  params.push(Number(userId), ...ids);
}

/** Notifications and assignment choices use the same current company grants,
 * including platform staff whose access is separate from employment. */
export async function peopleOperationsRecipients(agencyId, db = pool) {
  if (!positive(agencyId)) return [];
  const profilesReady = await accessProfileSchemaReady(db);
  const [rows] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.work_email,
    u.role,u.status,u.is_active,u.is_archived,u.is_assistant_account
    FROM users u WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_assistant_account,0)=0 AND u.terminated_at IS NULL
      AND (u.role='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua
        WHERE ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1)
        ${profilesReady ? `OR EXISTS(SELECT 1 FROM user_agency_access_profiles p
          WHERE p.user_id=u.id AND p.agency_id=? AND JSON_EXTRACT(p.effective_permissions,'$.has_hiring_access')=TRUE)` : ''})
    ORDER BY u.last_name,u.first_name,u.id`, profilesReady ? [agencyId, agencyId] : [agencyId]);
  const permitted = await Promise.all(rows.map(user => canAccessPeopleOperations(user.id, agencyId, db)));
  return rows.filter((_, index) => permitted[index]);
}
