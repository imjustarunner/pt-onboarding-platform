import { getSchoolReportsSnapshot } from '../services/schoolReports.service.js';
import { safeInt } from '../services/schoolCoverageMetrics.service.js';
import pool from '../config/database.js';

function canViewReports(role) {
  const r = String(role || '').toLowerCase();
  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider_plus'
  ].includes(r);
}

async function resolveAgencyId(req) {
  const fromQuery = safeInt(req.query?.agencyId);
  const fromUser = safeInt(req.user?.agencyId || req.user?.agency_id);
  const agencyId = fromQuery || fromUser;
  if (!agencyId) return null;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return agencyId;
  try {
    const uid = safeInt(req.user?.id);
    if (!uid) return agencyId;
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [uid, agencyId]
    );
    if (rows?.[0]) return agencyId;
    if (fromUser === agencyId) return agencyId;
  } catch {
    /* fall through */
  }
  return fromUser || agencyId;
}

export const getSnapshot = async (req, res, next) => {
  try {
    if (!canViewReports(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = await resolveAgencyId(req);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const snapshot = await getSchoolReportsSnapshot(agencyId, {
      schoolYear: req.query?.schoolYear || req.query?.year || null
    });
    return res.json(snapshot);
  } catch (err) {
    next(err);
  }
};
