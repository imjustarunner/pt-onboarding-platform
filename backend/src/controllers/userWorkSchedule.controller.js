import User from '../models/User.model.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import {
  canManageOthersSchedule
} from '../services/scheduleSummaryPrivacy.service.js';
import pool from '../config/database.js';
import { timezoneFromUsHomeState } from '../utils/usStateTimezone.js';

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

function serializeWorkSchedule(data, extras = {}) {
  const blocks = (data?.blocks || []).map((b) => ({
    id: Number(b.id || 0) || null,
    dayOfWeek: Number(b.day_of_week),
    startTime: String(b.start_time || '').slice(0, 8),
    endTime: String(b.end_time || '').slice(0, 8)
  }));
  const hasSavedSchedule = !!data?.schedule;
  const suggestedTimezone = String(extras.suggestedTimezone || '').trim() || 'America/New_York';
  return {
    ok: true,
    timezone: hasSavedSchedule
      ? String(data?.timezone || suggestedTimezone)
      : suggestedTimezone,
    isActive: !!data?.isActive,
    agencyId: data?.schedule?.agency_id != null ? Number(data.schedule.agency_id) : null,
    blocks,
    hasSavedSchedule,
    suggestedTimezone,
    homeState: extras.homeState || null,
    timezoneSource: hasSavedSchedule
      ? 'work_schedule'
      : (extras.timezoneSource || 'default'),
    note: 'Work hours control reachability / notifications. Virtual working hours remain booking-only.'
  };
}

async function resolveSuggestedTimezone(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT timezone, home_state FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const row = rows?.[0] || {};
    const profileTz = String(row.timezone || '').trim();
    const homeState = row.home_state != null ? String(row.home_state).trim() : '';
    // Prefer home address so new work-hours editors match where the user lives.
    if (homeState) {
      return {
        suggestedTimezone: timezoneFromUsHomeState(homeState),
        homeState,
        timezoneSource: 'home_address'
      };
    }
    if (profileTz) {
      return { suggestedTimezone: profileTz, homeState: null, timezoneSource: 'profile' };
    }
    return { suggestedTimezone: 'America/New_York', homeState: null, timezoneSource: 'default' };
  } catch {
    return { suggestedTimezone: 'America/New_York', homeState: null, timezoneSource: 'default' };
  }
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
    const suggested = await resolveSuggestedTimezone(userId);
    return res.json(serializeWorkSchedule(data, suggested));
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

    const suggested = await resolveSuggestedTimezone(userId);
    const timezone = String(req.body?.timezone || '').trim() || suggested.suggestedTimezone;
    const data = await UserWorkSchedule.upsertForUser(userId, {
      agencyId,
      timezone,
      isActive: req.body?.isActive !== false,
      blocks: req.body?.blocks
    });
    return res.json(serializeWorkSchedule(data, suggested));
  } catch (e) {
    next(e);
  }
};
