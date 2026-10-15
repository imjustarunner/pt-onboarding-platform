import pool from '../config/database.js';
import { ffsExcessOptions } from '../services/ffsExcessTime.service.js';
export async function getMyFfsExcessOptions(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId);
    if (!Number.isInteger(agencyId) || agencyId <= 0) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const [membership] = await pool.execute('SELECT 1 FROM user_agencies WHERE agency_id=? AND user_id=? LIMIT 1', [agencyId, req.user.id]);
    if (!membership.length && !['admin','super_admin'].includes(req.user.role)) return res.status(403).json({ error: { message: 'Access denied' } });
    res.json(await ffsExcessOptions(agencyId));
  } catch (e) { next(e); }
}
