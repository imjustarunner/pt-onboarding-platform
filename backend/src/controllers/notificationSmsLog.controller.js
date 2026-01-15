import pool from '../config/database.js';
import User from '../models/User.model.js';

const canAdminView = (role) => role === 'admin' || role === 'super_admin' || role === 'support';

async function userHasAgencyAccess(userId, agencyId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => a.id === agencyId);
}

export const getMySmsLogs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit ? Math.min(500, parseInt(req.query.limit)) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;

    const params = [userId];
    let where = 'l.user_id = ?';
    if (agencyId) {
      where += ' AND l.agency_id = ?';
      params.push(agencyId);
    }
    params.push(limit, offset);

    const [rows] = await pool.execute(
      `SELECT
         l.*,
         n.type AS notification_type,
         n.title AS notification_title
       FROM notification_sms_logs l
       LEFT JOIN notifications n ON l.notification_id = n.id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
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

    const limit = req.query.limit ? Math.min(500, parseInt(req.query.limit)) : 200;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

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
    params.push(limit, offset);

    const [rows] = await pool.execute(
      `SELECT
         l.*,
         n.type AS notification_type,
         n.title AS notification_title
       FROM notification_sms_logs l
       LEFT JOIN notifications n ON l.notification_id = n.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

