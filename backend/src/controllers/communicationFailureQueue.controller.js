import pool from '../config/database.js';
import User from '../models/User.model.js';
import { FAILURE_QUEUE_STATUSES } from '../utils/communicationFailureQueue.js';

export async function removeFailedCommunications(req, res, next) {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'support', 'staff', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId);
    const input = req.body?.ids;
    if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !Array.isArray(input)
      || !input.length || input.length > 500
      || input.some(id => !Number.isSafeInteger(id) || id < 1)) {
      return res.status(400).json({ error: { message: 'Select an agency and between 1 and 500 communication records.' } });
    }
    if (role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some(agency => Number(agency.id) === agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    const ids = [...new Set(input)];
    // Scope and status are rechecked by the update, including concurrent retries.
    // Do not delete the record or change what actually happened during delivery.
    const [result] = await pool.execute(
      `UPDATE user_communications
       SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()),
         '$.failedListRemovedAt', ?, '$.failedListRemovedByUserId', ?)
       WHERE agency_id = ? AND channel = 'email'
         AND id IN (${ids.map(() => '?').join(',')})
         AND delivery_status IN (${FAILURE_QUEUE_STATUSES.map(() => '?').join(',')})
         AND JSON_EXTRACT(metadata, '$.failedListRemovedAt') IS NULL`,
      [new Date().toISOString(), req.user.id, agencyId, ...ids, ...FAILURE_QUEUE_STATUSES]
    );
    return res.json({ removed: Number(result.affectedRows || 0) });
  } catch (error) {
    next(error);
  }
}
