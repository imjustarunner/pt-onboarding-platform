import pool from '../config/database.js';
import User from '../models/User.model.js';

const canAdminView = (role) => role === 'admin' || role === 'super_admin' || role === 'support';

async function userHasAgencyAccess(userId, agencyId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => a.id === agencyId);
}

// NOTE: LIMIT/OFFSET are intentionally inlined as validated integers rather
// than bound as prepared-statement placeholders. mysql2's `.execute()` binds
// `LIMIT ?` as a string under the hood, which MySQL rejects with
// "Incorrect arguments to mysqld_stmt_execute" — a red error banner then
// renders on the Communications tab in the user/guardian profile.
// The values are clamped via Math.min / parseInt with fallbacks, so there is
// no SQL-injection surface.
function safeInt(raw, { def, min = 0, max = 10_000 }) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return def;
  return Math.max(min, Math.min(max, parsed));
}

export const getMySmsLogs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = safeInt(req.query.limit, { def: 100, min: 1, max: 500 });
    const offset = safeInt(req.query.offset, { def: 0, min: 0, max: 10_000_000 });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;

    const params = [userId];
    let where = 'l.user_id = ?';
    if (agencyId) {
      where += ' AND l.agency_id = ?';
      params.push(agencyId);
    }

    const [rows] = await pool.execute(
      `SELECT
         l.*,
         n.type AS notification_type,
         n.title AS notification_title
       FROM notification_sms_logs l
       LEFT JOIN notifications n ON l.notification_id = n.id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getSmsLogs = async (req, res, next) => {
  try {
    if (!canAdminView(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const limit = safeInt(req.query.limit, { def: 200, min: 1, max: 500 });
    const offset = safeInt(req.query.offset, { def: 0, min: 0, max: 10_000_000 });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    if (!agencyId && !userId) {
      return res.status(400).json({ error: { message: 'agencyId or userId is required' } });
    }

    // Enforce agency boundary (unless super_admin)
    if (agencyId && req.user.role !== 'super_admin') {
      const ok = await userHasAgencyAccess(req.user.id, agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const params = [];
    const clauses = [];
    if (agencyId) {
      clauses.push('l.agency_id = ?');
      params.push(agencyId);
    }
    if (userId) {
      clauses.push('l.user_id = ?');
      params.push(userId);
    }

    const [rows] = await pool.execute(
      `SELECT
         l.*,
         n.type AS notification_type,
         n.title AS notification_title
       FROM notification_sms_logs l
       LEFT JOIN notifications n ON l.notification_id = n.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

