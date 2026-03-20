import pool from '../config/database.js';
import User from '../models/User.model.js';
import Kudos from '../models/Kudos.model.js';
import PayrollSummary from '../models/PayrollSummary.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import { isSupervisorActor } from '../utils/supervisorSchoolAccess.js';
import {
  computeKudosRecipientEligibility,
  loadAgencyTierThresholds,
  tierLevelFromWeeklyAvg
} from '../services/kudosRecipientEligibility.service.js';

const MIN_REASON_LENGTH = 10;

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

async function getAgencyAdminUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_agencies ua ON ua.user_id = u.id
     WHERE (
       (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) = 'admin')
       OR LOWER(COALESCE(u.role, '')) = 'super_admin'
     )
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [agencyId]
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

function normalizeDigestLine({ recipientName, reason }) {
  const who = String(recipientName || 'Someone').trim() || 'Someone';
  const why = String(reason || '').trim();
  const base = why ? `${who}: ${why}` : `${who}: Kudos earned`;
  return `- ${base}`.slice(0, 300);
}

async function appendAdminKudosDigestNotification({ agencyId, recipientName, reason, relatedEntityId = null }) {
  const adminIds = await getAgencyAdminUserIds(agencyId);
  if (!adminIds.length) return;
  const line = normalizeDigestLine({ recipientName, reason });
  for (const adminUserId of adminIds) {
    const [existingRows] = await pool.execute(
      `SELECT id, message
       FROM notifications
       WHERE type = 'kudos_earned_admin_digest'
         AND agency_id = ?
         AND user_id = ?
         AND is_resolved = FALSE
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [agencyId, adminUserId]
    );
    const existing = existingRows?.[0] || null;
    if (existing?.id) {
      const prev = String(existing.message || '').trim();
      const next = prev ? `${line}\n${prev}` : line;
      await pool.execute(
        `UPDATE notifications
         SET title = ?, message = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        ['Kudos earned updates', next.slice(0, 4000), existing.id]
      );
      continue;
    }
    await createNotificationAndDispatch({
      type: 'kudos_earned_admin_digest',
      severity: 'info',
      title: 'Kudos earned updates',
      message: line,
      userId: adminUserId,
      agencyId,
      relatedEntityType: 'kudos',
      relatedEntityId: relatedEntityId || undefined
    }).catch(() => {});
  }
}

async function canGiveUnlimitedKudos(reqUser) {
  const role = String(reqUser?.role || '').toLowerCase();
  if (role === 'provider_plus') {
    return false;
  }
  if (role === 'admin' || role === 'super_admin' || role === 'clinical_practice_assistant') {
    return true;
  }
  const supervisorCapable = await isSupervisorActor({
    userId: reqUser?.id,
    role,
    user: reqUser
  });
  return !!supervisorCapable;
}

function getGiveBalancePolicy(reqUser) {
  const role = String(reqUser?.role || '').toLowerCase();
  if (role === 'provider_plus') {
    return {
      monthlyAllowance: 5,
      rolloverCap: 5
    };
  }
  return {
    monthlyAllowance: 1,
    rolloverCap: 2
  };
}

async function assertAgencyAccess(reqUser, agencyId) {
  if (reqUser.role === 'super_admin') return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
  if (!ids.includes(Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function assertUserInAgency(userId, agencyId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [userId, agencyId]
  );
  if (!rows?.length) {
    const err = new Error('User is not in this agency');
    err.status = 400;
    throw err;
  }
}

async function assertKudosEnabled(agencyId) {
  const [rows] = await pool.execute(
    'SELECT feature_flags FROM agencies WHERE id = ?',
    [agencyId]
  );
  let flags = {};
  if (rows?.[0]?.feature_flags) {
    try {
      flags = typeof rows[0].feature_flags === 'string'
        ? JSON.parse(rows[0].feature_flags)
        : rows[0].feature_flags;
    } catch {
      /* ignore */
    }
  }
  if (flags.kudosEnabled !== true) {
    const err = new Error('Kudos is not enabled for this agency');
    err.status = 403;
    throw err;
  }
}

/**
 * POST /api/kudos - Give kudos to a coworker
 */
export const giveKudos = async (req, res, next) => {
  try {
    const fromUserId = req.user.id;
    const toUserId = req.body.toUserId ? parseInt(req.body.toUserId, 10) : null;
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    if (!toUserId || !agencyId) {
      return res.status(400).json({ error: { message: 'toUserId and agencyId are required' } });
    }
    if (fromUserId === toUserId) {
      return res.status(400).json({ error: { message: 'Cannot give kudos to yourself' } });
    }
    if (!reason || reason.length < MIN_REASON_LENGTH) {
      return res.status(400).json({
        error: { message: `Reason is required and must be at least ${MIN_REASON_LENGTH} characters` }
      });
    }

    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);
    await assertUserInAgency(toUserId, agencyId);

    const eligMap = await computeKudosRecipientEligibility({ agencyId, userIds: [toUserId] });
    const elig = eligMap.get(Number(toUserId));
    if (!elig?.eligible) {
      return res.status(400).json({
        error: {
          message: elig?.reasonMessage || 'This person is not eligible to receive kudos right now.',
          code: elig?.reason || 'not_eligible',
          benefitTierLevel: elig?.benefitTierLevel ?? null,
          unpaidNotesCount: elig?.unpaidNotesCount ?? null
        }
      });
    }

    const giverCanGiveUnlimited = await canGiveUnlimitedKudos(req.user);
    const giveBalancePolicy = getGiveBalancePolicy(req.user);
    let kudos = null;
    let giverBalanceRemaining = null;

    if (giverCanGiveUnlimited) {
      kudos = await Kudos.create({
        fromUserId,
        toUserId,
        agencyId,
        reason,
        source: 'peer'
      });
    } else {
      const result = await Kudos.createPeerKudosWithGiveBalance({
        fromUserId,
        toUserId,
        agencyId,
        reason,
        balancePolicy: giveBalancePolicy
      });
      kudos = result.kudos;
      giverBalanceRemaining = Number(result.remainingGiveBalance ?? 0);
    }

    const points = await Kudos.getPoints(toUserId, agencyId);

    res.status(201).json({
      kudos: {
        id: kudos.id,
        fromUserId: kudos.from_user_id,
        toUserId: kudos.to_user_id,
        agencyId: kudos.agency_id,
        reason: kudos.reason,
        source: kudos.source,
        createdAt: kudos.created_at
      },
      recipientPoints: points,
      giverBalanceRemaining,
      giverCanGiveUnlimited,
      giverMonthlyAllowance: giveBalancePolicy.monthlyAllowance,
      giverRolloverCap: giveBalancePolicy.rolloverCap
    });
  } catch (e) {
    if (e?.code === 'NO_KUDOS_GIVE_BALANCE') {
      return res.status(400).json({
        error: {
          message: 'You have no kudos left to give this month. You get 1 each month and can roll over up to 2 total.'
        }
      });
    }
    next(e);
  }
};

/**
 * GET /api/kudos/me - My received kudos and points
 */
export const getMyKudos = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const giverCanGiveUnlimited = await canGiveUnlimitedKudos(req.user);
    const giveBalancePolicy = getGiveBalancePolicy(req.user);
    const [kudos, totalCount, points, tierProgress, giveBalance] = await Promise.all([
      Kudos.listReceivedByUser(userId, agencyId, { limit, offset }),
      Kudos.countReceivedByUser(userId, agencyId),
      Kudos.getPoints(userId, agencyId),
      Kudos.getTierProgress(userId, agencyId),
      giverCanGiveUnlimited
        ? Promise.resolve(null)
        : Kudos.getGiveBalance(userId, agencyId, giveBalancePolicy)
    ]);

    const items = (kudos || []).map((k) => ({
      id: k.id,
      fromUserId: k.from_user_id,
      fromName: k.from_preferred_name
        ? `${k.from_first_name || ''} "${k.from_preferred_name}" ${k.from_last_name || ''}`.trim()
        : `${k.from_first_name || ''} ${k.from_last_name || ''}`.trim() || 'Someone',
      fromProfilePhotoUrl: publicUploadsUrlFromStoredPath(k.from_profile_photo_path),
      reason: k.reason,
      source: k.source,
      approvalStatus: k.approval_status || 'approved',
      createdAt: k.created_at
    }));

    res.json({
      kudos: items,
      totalCount,
      points,
      tierProgress,
      giveBalance,
      giverCanGiveUnlimited,
      giverMonthlyAllowance: giveBalancePolicy.monthlyAllowance,
      giverRolloverCap: giveBalancePolicy.rolloverCap
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/give-balance - My remaining kudos to give in this month (with rollover cap)
 */
export const getMyGiveBalance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const giverCanGiveUnlimited = await canGiveUnlimitedKudos(req.user);
    const giveBalancePolicy = getGiveBalancePolicy(req.user);
    const giveBalance = giverCanGiveUnlimited
      ? null
      : await Kudos.getGiveBalance(userId, agencyId, giveBalancePolicy);
    res.json({
      giveBalance,
      giverCanGiveUnlimited,
      giverMonthlyAllowance: giveBalancePolicy.monthlyAllowance,
      giverRolloverCap: giveBalancePolicy.rolloverCap
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/pending-summary - Summary of pending kudos across admin's agencies (for task list)
 */
export const getPendingSummary = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencies = await User.getAgencies(req.user.id);
    const agencyIds = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
    if (agencyIds.length === 0) {
      return res.json({ totalPending: 0, agencies: [] });
    }

    const [rows] = await pool.execute(
      `SELECT a.id AS agency_id, a.name AS agency_name,
              (SELECT COUNT(*) FROM kudos k
               WHERE k.agency_id = a.id AND k.approval_status = 'pending' AND k.source = 'peer') AS pending_count
       FROM agencies a
       WHERE a.id IN (${agencyIds.map(() => '?').join(',')})
         AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.feature_flags, '{}'), '$.kudosEnabled')) = 'true'`,
      agencyIds
    );

    const agenciesWithPending = (rows || [])
      .filter((r) => Number(r.pending_count || 0) > 0)
      .map((r) => ({
        agencyId: r.agency_id,
        agencyName: r.agency_name || 'Agency',
        count: Number(r.pending_count || 0)
      }));

    const totalPending = agenciesWithPending.reduce((sum, a) => sum + a.count, 0);

    res.json({ totalPending, agencies: agenciesWithPending });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/pending - List pending peer kudos for admin approval
 */
export const listPendingKudos = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const [items, totalCount] = await Promise.all([
      Kudos.listPending(agencyId, { limit, offset }),
      Kudos.countPending(agencyId)
    ]);

    const kudos = (items || []).map((k) => ({
      id: k.id,
      fromUserId: k.from_user_id,
      fromName: k.from_preferred_name
        ? `${k.from_first_name || ''} "${k.from_preferred_name}" ${k.from_last_name || ''}`.trim()
        : `${k.from_first_name || ''} ${k.from_last_name || ''}`.trim() || 'Someone',
      fromProfilePhotoUrl: publicUploadsUrlFromStoredPath(k.from_profile_photo_path),
      toUserId: k.to_user_id,
      toName: k.to_preferred_name
        ? `${k.to_first_name || ''} "${k.to_preferred_name}" ${k.to_last_name || ''}`.trim()
        : `${k.to_first_name || ''} ${k.to_last_name || ''}`.trim() || 'Someone',
      reason: k.reason,
      createdAt: k.created_at
    }));

    res.json({ kudos, totalCount });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/kudos/:id/approve - Approve a pending peer kudos (admin only)
 */
export const approveKudos = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid kudos id' } });

    const existing = await Kudos.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Kudos not found' } });
    await assertAgencyAccess(req.user, existing.agency_id);
    await assertKudosEnabled(existing.agency_id);

    const kudos = await Kudos.approve(id);
    if (!kudos) {
      return res.status(400).json({ error: { message: 'Kudos is not pending or already processed' } });
    }
    if (kudos.approval_status !== 'approved') {
      return res.status(400).json({ error: { message: 'Failed to approve' } });
    }

    // Notify recipient with reason and +1
    const fromUser = await User.findById(kudos.from_user_id);
    const fromName = fromUser
      ? (fromUser.preferred_name
          ? `${fromUser.first_name || ''} "${fromUser.preferred_name}" ${fromUser.last_name || ''}`.trim()
          : `${fromUser.first_name || ''} ${fromUser.last_name || ''}`.trim() || 'A coworker')
      : 'A coworker';
    await createNotificationAndDispatch({
      type: 'kudos_received',
      severity: 'info',
      title: 'Kudos received +1',
      message: `${fromName}: ${kudos.reason || ''}`,
      userId: kudos.to_user_id,
      agencyId: kudos.agency_id,
      relatedEntityType: 'kudos',
      relatedEntityId: kudos.id
    }).catch(() => {});

    const recipient = await User.findById(kudos.to_user_id);
    const recipientName = recipient
      ? (recipient.preferred_name
          ? `${recipient.first_name || ''} "${recipient.preferred_name}" ${recipient.last_name || ''}`.trim()
          : `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.email || `User #${kudos.to_user_id}`)
      : `User #${kudos.to_user_id}`;
    await appendAdminKudosDigestNotification({
      agencyId: kudos.agency_id,
      recipientName,
      reason: kudos.reason || '',
      relatedEntityId: kudos.id
    }).catch(() => {});

    const points = await Kudos.getPoints(kudos.to_user_id, kudos.agency_id);
    res.json({ kudos, recipientPoints: points });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/kudos/:id/reject - Reject a pending peer kudos (admin only)
 */
export const rejectKudos = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid kudos id' } });

    const existing = await Kudos.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Kudos not found' } });
    await assertAgencyAccess(req.user, existing.agency_id);
    await assertKudosEnabled(existing.agency_id);

    const kudos = await Kudos.reject(id);
    if (!kudos) {
      return res.status(400).json({ error: { message: 'Kudos is not pending or already processed' } });
    }
    res.json({ kudos });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/tiers - List reward tiers for agency
 */
export const listTiers = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);
    const tiers = await Kudos.listRewardTiers(agencyId);
    res.json({ tiers });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/kudos/tiers - Create reward tier (admin only)
 */
export const createTier = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const tierName = typeof req.body.tierName === 'string' ? req.body.tierName.trim() : '';
    const pointsThreshold = parseInt(req.body.pointsThreshold, 10);
    const rewardDescription = typeof req.body.rewardDescription === 'string' ? req.body.rewardDescription.trim() || null : null;
    const sortOrder = parseInt(req.body.sortOrder, 10) || 0;

    if (!agencyId || !tierName || !Number.isFinite(pointsThreshold) || pointsThreshold < 0) {
      return res.status(400).json({ error: { message: 'agencyId, tierName, and pointsThreshold (>= 0) are required' } });
    }
    await assertAgencyAccess(req.user, agencyId);

    const tier = await Kudos.createRewardTier({
      agencyId,
      tierName,
      pointsThreshold,
      rewardDescription,
      sortOrder
    });
    res.status(201).json({ tier });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/kudos/tiers/:id - Update reward tier (admin only)
 */
export const updateTier = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid tier id' } });

    const existing = await Kudos.findRewardTierById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Tier not found' } });
    await assertAgencyAccess(req.user, existing.agency_id);

    const tierName = req.body.tierName !== undefined ? String(req.body.tierName).trim() : undefined;
    const pointsThreshold = req.body.pointsThreshold !== undefined ? parseInt(req.body.pointsThreshold, 10) : undefined;
    const rewardDescription = req.body.rewardDescription !== undefined
      ? (typeof req.body.rewardDescription === 'string' ? req.body.rewardDescription.trim() || null : null)
      : undefined;
    const sortOrder = req.body.sortOrder !== undefined ? parseInt(req.body.sortOrder, 10) : undefined;

    const tier = await Kudos.updateRewardTier(id, {
      tierName,
      pointsThreshold: Number.isFinite(pointsThreshold) ? pointsThreshold : undefined,
      rewardDescription,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined
    });
    res.json({ tier });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/kudos/tiers/:id - Delete reward tier (admin only)
 */
export const deleteTier = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid tier id' } });

    const existing = await Kudos.findRewardTierById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Tier not found' } });
    await assertAgencyAccess(req.user, existing.agency_id);

    await Kudos.deleteRewardTier(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/tier-progress - My tier progress for an agency
 */
export const getTierProgress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const tierProgress = await Kudos.getTierProgress(userId, agencyId);
    res.json(tierProgress);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/kudos/notes-complete - Award +1 for completing all notes this pay period
 */
export const awardNotesComplete = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const all = await PayrollSummary.listForUser({ userId, agencyId, limit: 100, offset: 0 });
    const posted = (all || []).filter((r) => {
      const st = String(r.status || '').toLowerCase();
      return st === 'posted' || st === 'finalized';
    });
    const lastPaycheck = posted?.[0] || null;

    if (!lastPaycheck?.payroll_period_id) {
      return res.json({ awarded: false, reason: 'no_pay_period' });
    }

    const periodId = Number(lastPaycheck.payroll_period_id);

    const thresholds = await loadAgencyTierThresholds(agencyId);
    const biWeeklyAward =
      Number(lastPaycheck.tier_credits_final ?? lastPaycheck.tier_credits_current ?? 0) || 0;
    const weeklyAvgAward = biWeeklyAward / 2;
    const benefitTierForAward = tierLevelFromWeeklyAvg(weeklyAvgAward, thresholds);
    if (benefitTierForAward < 2) {
      return res.json({
        awarded: false,
        reason: 'benefit_tier_below_2',
        benefitTierLevel: benefitTierForAward
      });
    }

    const [impRows] = await pool.execute(
      `SELECT id FROM payroll_imports
       WHERE payroll_period_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [periodId]
    );
    const payrollImportId = impRows?.[0]?.id || null;
    if (!payrollImportId) {
      return res.json({ awarded: false, reason: 'no_import' });
    }

    const [cntRows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN UPPER(TRIM(note_status)) = 'NO_NOTE' THEN 1 ELSE 0 END) AS noNoteNotes,
         SUM(CASE WHEN UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0 THEN 1 ELSE 0 END) AS draftNotes
       FROM payroll_import_rows
       WHERE payroll_period_id = ?
         AND payroll_import_id = ?
         AND agency_id = ?
         AND user_id = ?
         AND (
           UPPER(TRIM(note_status)) = 'NO_NOTE'
           OR (UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0)
         )`,
      [periodId, payrollImportId, agencyId, userId]
    );
    const r = cntRows?.[0] || {};
    const unpaidCount = Number(r.noNoteNotes || 0) + Number(r.draftNotes || 0);

    if (unpaidCount > 0) {
      return res.json({ awarded: false, reason: 'has_unpaid_notes', unpaidCount });
    }

    const alreadyAwarded = await Kudos.hasNotesCompletionAward(userId, agencyId, periodId);
    if (alreadyAwarded) {
      const points = await Kudos.getPoints(userId, agencyId);
      return res.json({ awarded: false, alreadyAwarded: true, points });
    }

    const recorded = await Kudos.recordNotesCompletionAward(userId, agencyId, periodId);
    if (!recorded) {
      const points = await Kudos.getPoints(userId, agencyId);
      return res.json({ awarded: false, alreadyAwarded: true, points });
    }

    await Kudos.create({
      fromUserId: null,
      toUserId: userId,
      agencyId,
      reason: 'Completed all clinical notes for this pay period.',
      source: 'notes_complete',
      payrollPeriodId: periodId
    });

    const recipient = await User.findById(userId);
    const recipientName = recipient
      ? (recipient.preferred_name
          ? `${recipient.first_name || ''} "${recipient.preferred_name}" ${recipient.last_name || ''}`.trim()
          : `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.email || `User #${userId}`)
      : `User #${userId}`;
    await appendAdminKudosDigestNotification({
      agencyId,
      recipientName,
      reason: 'Completed all clinical notes for this pay period.'
    }).catch(() => {});

    const points = await Kudos.getPoints(userId, agencyId);

    res.json({
      awarded: true,
      points,
      payrollPeriodId: periodId
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/leaderboard - Top recipients in agency
 */
export const getLeaderboard = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const rows = await Kudos.getLeaderboard(agencyId, { limit });

    const items = (rows || []).map((r) => ({
      userId: r.user_id,
      points: r.points,
      displayName: r.preferred_name
        ? `${r.first_name || ''} "${r.preferred_name}" ${r.last_name || ''}`.trim()
        : `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
      profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path)
    }));

    res.json({ leaderboard: items });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/kudos/admin/tracker - Agency provider kudos tracker for admin workflows
 */
export const getAdminKudosTracker = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const [providers] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.preferred_name, u.email, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE (u.role IN ('provider', 'provider_plus') OR u.has_provider_access = TRUE)
         AND LOWER(COALESCE(u.role, '')) <> 'supervisor'
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [agencyId]
    );
    const providerIds = (providers || []).map((p) => Number(p.id)).filter(Boolean);
    if (!providerIds.length) {
      return res.json({ ok: true, agencyId, providers: [] });
    }

    const placeholders = providerIds.map(() => '?').join(',');
    const [pointsRows] = await pool.execute(
      `SELECT user_id, points
       FROM user_kudos_points
       WHERE agency_id = ?
         AND user_id IN (${placeholders})`,
      [agencyId, ...providerIds]
    );
    const pointsByUserId = new Map((pointsRows || []).map((r) => [Number(r.user_id), Number(r.points || 0)]));

    const [givenCountRows] = await pool.execute(
      `SELECT from_user_id AS user_id, COUNT(*) AS cnt
       FROM kudos
       WHERE agency_id = ?
         AND from_user_id IN (${placeholders})
       GROUP BY from_user_id`,
      [agencyId, ...providerIds]
    );
    const givenCountByUserId = new Map((givenCountRows || []).map((r) => [Number(r.user_id), Number(r.cnt || 0)]));

    const [receivedRows] = await pool.execute(
      `SELECT
         k.id,
         k.to_user_id AS user_id,
         k.reason,
         k.approval_status,
         k.source,
         k.created_at,
         k.from_user_id,
         fu.first_name AS from_first_name,
         fu.last_name AS from_last_name,
         fu.preferred_name AS from_preferred_name,
         fu.email AS from_email
       FROM kudos k
       LEFT JOIN users fu ON fu.id = k.from_user_id
       WHERE k.agency_id = ?
         AND k.to_user_id IN (${placeholders})
       ORDER BY k.created_at DESC`,
      [agencyId, ...providerIds]
    );

    const [givenRows] = await pool.execute(
      `SELECT
         k.id,
         k.from_user_id AS user_id,
         k.reason,
         k.approval_status,
         k.source,
         k.created_at,
         k.to_user_id,
         tu.first_name AS to_first_name,
         tu.last_name AS to_last_name,
         tu.preferred_name AS to_preferred_name,
         tu.email AS to_email
       FROM kudos k
       LEFT JOIN users tu ON tu.id = k.to_user_id
       WHERE k.agency_id = ?
         AND k.from_user_id IN (${placeholders})
       ORDER BY k.created_at DESC`,
      [agencyId, ...providerIds]
    );

    const receivedByUserId = new Map();
    for (const row of receivedRows || []) {
      const uid = Number(row.user_id || 0);
      if (!uid) continue;
      if (!receivedByUserId.has(uid)) receivedByUserId.set(uid, []);
      const fromName = row.from_user_id
        ? (row.from_preferred_name
            ? `${row.from_first_name || ''} "${row.from_preferred_name}" ${row.from_last_name || ''}`.trim()
            : `${row.from_first_name || ''} ${row.from_last_name || ''}`.trim() || row.from_email || `User #${row.from_user_id}`)
        : 'System';
      receivedByUserId.get(uid).push({
        id: Number(row.id),
        fromUserId: row.from_user_id ? Number(row.from_user_id) : null,
        fromName,
        reason: row.reason || '',
        source: row.source || 'peer',
        approvalStatus: row.approval_status || 'approved',
        createdAt: row.created_at || null
      });
    }

    const givenByUserId = new Map();
    for (const row of givenRows || []) {
      const uid = Number(row.user_id || 0);
      if (!uid) continue;
      if (!givenByUserId.has(uid)) givenByUserId.set(uid, []);
      const toName = row.to_user_id
        ? (row.to_preferred_name
            ? `${row.to_first_name || ''} "${row.to_preferred_name}" ${row.to_last_name || ''}`.trim()
            : `${row.to_first_name || ''} ${row.to_last_name || ''}`.trim() || row.to_email || `User #${row.to_user_id}`)
        : 'Unknown';
      givenByUserId.get(uid).push({
        id: Number(row.id),
        toUserId: row.to_user_id ? Number(row.to_user_id) : null,
        toName,
        reason: row.reason || '',
        source: row.source || 'peer',
        approvalStatus: row.approval_status || 'approved',
        createdAt: row.created_at || null
      });
    }

    const eligByUser = await computeKudosRecipientEligibility({ agencyId, userIds: providerIds });

    const out = (providers || []).map((p) => {
      const providerName = p.preferred_name
        ? `${p.first_name || ''} "${p.preferred_name}" ${p.last_name || ''}`.trim()
        : `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || `User #${p.id}`;
      const pid = Number(p.id);
      const elig = eligByUser.get(pid) || {
        eligible: false,
        reason: 'no_payroll_period',
        reasonMessage: 'Unable to determine kudos eligibility.',
        benefitTierLevel: 0,
        unpaidNotesCount: 0,
        payrollPeriodId: null
      };
      return {
        providerId: pid,
        providerName,
        email: p.email || '',
        role: p.role || '',
        points: Number(pointsByUserId.get(pid) || 0),
        givenCount: Number(givenCountByUserId.get(pid) || 0),
        received: receivedByUserId.get(pid) || [],
        given: givenByUserId.get(pid) || [],
        kudosEligible: !!elig.eligible,
        kudosIneligibleReason: elig.reason,
        kudosIneligibleMessage: elig.reasonMessage,
        benefitTierLevel: elig.benefitTierLevel,
        unpaidNotesCount: elig.unpaidNotesCount,
        kudosEligibilityPayrollPeriodId: elig.payrollPeriodId
      };
    });

    res.json({ ok: true, agencyId, providers: out });
  } catch (e) {
    next(e);
  }
};
