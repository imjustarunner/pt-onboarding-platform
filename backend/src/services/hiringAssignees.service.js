import pool from '../config/database.js';
import { accessProfileSchemaReady, ensurePlatformCompanyProfiles } from './agencyAccessProfiles.service.js';
import { STAFF_ROLES } from '../utils/staffEligibility.js';

export async function hiringAssigneesForAgency(agencyId, db = pool) {
  if (!await accessProfileSchemaReady(db)) {
    const [rows] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,u.role,u.has_hiring_access
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      WHERE u.is_active=1 AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
        AND UPPER(COALESCE(u.status,'')) IN ('','ACTIVE','ACTIVE_EMPLOYEE','COMPLETED')
        AND u.role IN (${STAFF_ROLES.map(() => '?').join(',')})
        AND (u.role IN ('admin','super_admin','support','staff') OR u.has_hiring_access=1)
      ORDER BY u.last_name,u.first_name`, [agencyId, ...STAFF_ROLES]);
    return rows;
  }
  await ensurePlatformCompanyProfiles(agencyId,db);
  const [rows] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,
      p.effective_role AS role,JSON_EXTRACT(p.effective_permissions,'$.has_hiring_access') AS has_hiring_access
    FROM users u JOIN user_agency_access_profiles p ON p.user_id=u.id AND p.agency_id=?
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_assistant_account,0)=0
      AND UPPER(COALESCE(u.status,'')) IN ('','ACTIVE','ACTIVE_EMPLOYEE','COMPLETED')
      AND u.role IN (${STAFF_ROLES.map(() => '?').join(',')})
      AND JSON_EXTRACT(p.effective_permissions,'$.has_hiring_access')=TRUE
      AND (EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=p.agency_id AND COALESCE(ua.is_active,1)=1)
        OR EXISTS(SELECT 1 FROM user_platform_access_defaults d JOIN user_agencies pt ON pt.user_id=d.user_id AND pt.agency_id=1 AND COALESCE(pt.is_active,1)=1 WHERE d.user_id=u.id AND d.enabled=1))
    ORDER BY u.last_name,u.first_name`, [agencyId, ...STAFF_ROLES]);
  return rows;
}
