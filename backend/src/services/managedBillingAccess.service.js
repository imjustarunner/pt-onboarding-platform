import { isBillingAgency } from './billingAgencyPolicy.js';
import pool from '../config/database.js';

// A billing relationship grants financial access only. It never adds memberships,
// clinical permissions, or access merely because two organizations are affiliated.
export async function managedBillingAgencies(userId, db = pool) {
  if (!Number(userId)) return [];
  try {
    const [rows] = await db.execute(`SELECT a.*, i.file_path AS icon_file_path, m.id AS billing_manager_id, m.name AS billing_manager_name
      FROM agency_billing_management bm
      JOIN agencies a ON a.id = bm.agency_id
      LEFT JOIN icons i ON i.id = a.icon_id
      JOIN agencies m ON m.id = bm.manager_agency_id
      JOIN user_agencies ua ON ua.agency_id = m.id AND ua.user_id = ?
      JOIN users u ON u.id = ua.user_id
      WHERE bm.is_active = 1 AND ua.has_billing_access = 1 AND ua.is_active = 1
        AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0
        AND m.is_active = 1 AND COALESCE(m.is_archived, 0) = 0
        AND COALESCE(u.is_archived, 0) = 0 AND COALESCE(u.is_active, 1) = 1
        AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED')
      ORDER BY a.name, a.id`, [userId]);
    return rows.filter(isBillingAgency);
  } catch (error) {
    // Older deployments retain direct billing grants while the migration rolls out.
    if (error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

export async function directBillingAgencyIds(userId, db = pool) {
  const [rows] = await db.execute(`SELECT a.id,a.organization_type,a.feature_flags,ua.agency_id FROM user_agencies ua
    JOIN agencies a ON a.id = ua.agency_id
    WHERE ua.user_id = ? AND ua.has_billing_access = 1 AND ua.is_active = 1
      AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0`, [userId]);
  return rows.filter(isBillingAgency).map(row => Number(row.agency_id));
}

export async function isActiveBillingAgency(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT id,organization_type,feature_flags FROM agencies WHERE id = ? AND is_active = 1 AND COALESCE(is_archived, 0) = 0', [agencyId]);
  return isBillingAgency(agency);
}
