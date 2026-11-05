import pool from '../config/database.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

// Owner-authorized permanent file-access exception for Avery's existing demo
// account (2026-11-05). Recheck the database on each request: changing the
// identity, demo flag, or QA-only memberships removes the exception immediately.
export async function hasAveryDemoFileAccess(req, db = pool) {
  if (Number(req?.user?.id) !== 1433 || req.user.switchedFromUserId || req.user.testAccountSwitch) return false;
  const [rows] = await db.execute(`SELECT u.id AS user_id, u.email, u.role, u.is_demo,
      u.is_active, u.is_archived, a.id, a.slug, a.feature_flags, a.is_active AS agency_active
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.is_active = 1
    JOIN agencies a ON a.id = ua.agency_id WHERE u.id = ?`, [1433]);
  return rows.length > 0 && rows.some(isAuricwellQaAgency) && rows.every(row =>
    Number(row.user_id) === 1433 && row.email?.toLowerCase() === 'qa.provider.auricwell@example.com'
    && row.role === 'provider' && Number(row.is_demo) === 1 && Number(row.is_active) === 1
    && !Number(row.is_archived) && Number(row.agency_active) === 1
    && (isAuricwellQaAgency(row) || (Number(row.id) === 456 && row.slug === 'scb-qa-company'))
  );
}
