import User from '../models/User.model.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import {
  canManageOthersSchedule
} from '../services/scheduleSummaryPrivacy.service.js';
import pool from '../config/database.js';

async function actorIsSupervisorOfTarget(actorUserId, targetUserId, agencyId = null) {
  try {
    const actor = await User.findById(actorUserId);
    if (!actor || !User.isSupervisor(actor)) return false;
    return !!(await User.supervisorHasAccess(actorUserId, targetUserId, agencyId));
  } catch {
    return false;
  }
}

async function assertCanAccessWorkSchedule({ actorUserId, actorRole, targetUserId, agencyId = null }) {
  if (Number(actorUserId) === Number(targetUserId)) return true;
  if (canManageOthersSchedule(actorRole)) {
    if (actorRole === 'super_admin' || actorRole === 'superadmin') return true;
    const [rows] = await pool.execute(
      `SELECT 1
       FROM user_agencies a
       JOIN user_agencies b ON b.agency_id = a.agency_id
       WHERE a.user_id = ? AND b.user_id = ?
       LIMIT 1`,
      [actorUserId, targetUserId]
    );
    if (rows?.length) return true;
  }
  return actorIsSupervisorOfTarget(actorUserId, targetUserId, agencyId);
}

function serializeWorkSchedule(data) {
  const blocks = (data?.blocks || []).map((b) => ({
    id: Number(b.id || 0) || null,
    dayOfWeek: Number(b.day_of_week),
    startTime: String(b.start_time || '').slice(0, 8),
    endTime: String(b.end_time || '').slice(0, 8)
  }));
  return {
    ok: true,
    timezone: data?.timezone || 'America/New_York',
    isActive: !!data?.isActive,
    agencyId: data?.schedule?.agency_id != null ? Number(data.schedule.agency_id) : null,
    blocks,
    note: 'Work hours control reachability / notifications. Virtual working hours remain booking-only.'
  };
}

export const getUserWorkSchedule = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const agencyId = req.query?.agencyId != null && String(req.query.agencyId).trim() !== ''
      ? Number(req.query.agencyId)
      : null;

    if (!(await assertCanAccessWorkSchedule({ actorUserId, actorRole, targetUserId: userId, agencyId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const data = await UserWorkSchedule.getForUser(userId, { agencyId });
    return res.json(serializeWorkSchedule(data));
  } catch (e) {
    next(e);
  }
};

export const putUserWorkSchedule = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const agencyId = req.body?.agencyId != null && String(req.body.agencyId).trim() !== ''
      ? Number(req.body.agencyId)
      : null;

    if (!(await assertCanAccessWorkSchedule({ actorUserId, actorRole, targetUserId: userId, agencyId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const data = await UserWorkSchedule.upsertForUser(userId, {
      agencyId,
      timezone: req.body?.timezone,
      isActive: req.body?.isActive !== false,
      blocks: req.body?.blocks
    });
    return res.json(serializeWorkSchedule(data));
  } catch (e) {
    next(e);
  }
};
