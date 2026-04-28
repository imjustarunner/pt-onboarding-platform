import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import pool from '../config/database.js';
import { validationResult } from 'express-validator';
import {
  canUserManageClub,
  formatClubManagerDisplayName,
  getManagedClubsForUser,
  getPrimaryClubManager
} from '../utils/sscClubAccess.js';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import { sqlAffiliationUnderSummitPlatform } from '../utils/summitPlatformClubs.js';
import {
  isSstcInviteOnlyMemberSignup,
  getActiveInviteForTokenAndClub,
  inviteEmailMatchesInviteRow
} from '../utils/sstcInviteOnly.js';
import { estimateCalories } from '../utils/calorieUtils.js';
import { loadRetainedTotalsForClub } from '../utils/summitClubErasureRetainedTotals.js';

function slugify(name) {
  let s = String(name || '').trim();
  // Strip possessives (e.g. "Superhero's" -> "Superhero") to avoid awkward "s-s" in slug
  s = s.replace(/'s\b/gi, '').replace(/\s+/g, ' ');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-|-$/g, '');
}

const parseClubRecords = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const unitForMetricKey = (metricKey) => {
  const k = String(metricKey || '').trim().toLowerCase();
  if (k === 'distance_miles' || k === 'distance') return 'miles';
  if (k === 'weekly_distance_miles') return 'miles';
  if (k === 'monthly_distance_miles') return 'miles';
  if (k === 'season_distance_miles') return 'miles';
  if (k === 'season_month1_distance_miles') return 'miles';
  if (k === 'season_month2_distance_miles') return 'miles';
  if (k === 'rolling_4week_distance_miles') return 'miles';
  if (k === 'calendar_month_distance_miles') return 'miles';
  if (k === 'team_weekly_distance_miles') return 'miles';
  if (k === 'team_monthly_distance_miles') return 'miles';
  if (k === 'team_season_distance_miles') return 'miles';
  if (k === 'club_season_distance_miles') return 'miles';
  if (k === 'duration_minutes' || k === 'duration') return 'minutes';
  if (k === 'season_duration_minutes') return 'minutes';
  if (k === 'points') return 'points';
  if (k === 'race_chip_time_seconds') return 'seconds';
  if (k === 'elevation_gain_meters') return 'meters';
  return '';
};

// Metric keys where a LOWER value is better (e.g. fastest time)
const lowerIsBetterMetrics = new Set(['race_chip_time_seconds']);

const normalizeClubRecords = (input) => {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  const knownMetricKeys = new Set([
    'distance_miles', 'duration_minutes', 'points',
    'weekly_distance_miles', 'monthly_distance_miles', 'season_distance_miles',
    'season_month1_distance_miles', 'season_month2_distance_miles',
    'rolling_4week_distance_miles', 'calendar_month_distance_miles',
    'season_duration_minutes', 'race_chip_time_seconds',
    'elevation_gain_meters',
    'team_weekly_distance_miles', 'team_monthly_distance_miles',
    'team_season_distance_miles', 'club_season_distance_miles'
  ]);
  const normalizeMetricKey = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'distance_miles' || s === 'distance') return 'distance_miles';
    if (s === 'duration_minutes' || s === 'duration') return 'duration_minutes';
    if (s === 'points') return 'points';
    if (knownMetricKeys.has(s)) return s;
    return null;
  };
  const normalizeHolderYear = (raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const y = Math.trunc(n);
    if (y < 1900 || y > 2999) return null;
    return y;
  };
  const normalizeIconId = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.trunc(n);
  };
  const normalizeRaceDistance = (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
  };
  for (const row of rows) {
    const label = String(row?.label || '').trim();
    if (!label) continue;
    const rawValue = Number(row?.value);
    const numericValue = Number.isFinite(rawValue) ? rawValue : null;
    const metricKey = normalizeMetricKey(row?.metricKey);
    const unit = String(row?.unit || '').trim() || unitForMetricKey(metricKey);
    out.push({
      id: String(row?.id || `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      label,
      value: numericValue != null ? numericValue : null,
      unit,
      notes: String(row?.notes || '').trim(),
      metricKey,
      activityType: String(row?.activityType || '').trim() || null,
      terrain: String(row?.terrain || '').trim() || null,
      gender: String(row?.gender || '').trim().toLowerCase() || null,
      raceDistance: normalizeRaceDistance(row?.raceDistance),
      lowerIsBetter: lowerIsBetterMetrics.has(metricKey),
      holderName: String(row?.holderName || '').trim(),
      holderYear: normalizeHolderYear(row?.holderYear),
      holderTeam: String(row?.holderTeam || '').trim(),
      holderUserId: row?.holderUserId ? Math.trunc(Number(row.holderUserId)) : null,
      iconId: normalizeIconId(row?.iconId),
      iconUrl: null, // resolved on demand
      autoFill: row?.autoFill === true,
      calendarMonth: metricKey === 'calendar_month_distance_miles'
        ? (String(row?.calendarMonth || '').match(/^\d{4}-(?:0[1-9]|1[0-2])$/) ? row.calendarMonth : null)
        : null,
      verificationRequired: true,
      seededAt: row?.seededAt || null,
      updatedAt: row?.updatedAt || null,
      lastVerifiedAt: row?.lastVerifiedAt || null,
      lastVerifiedWorkoutId: row?.lastVerifiedWorkoutId || null,
      lastVerifiedByUserId: row?.lastVerifiedByUserId || null
    });
  }
  return out;
};

const mergeSeedRecords = ({ existingRecords, incomingRecords }) => {
  const existingById = new Map((existingRecords || []).map((r) => [String(r.id), r]));
  const now = new Date().toISOString();
  const merged = [];
  for (const incoming of incomingRecords || []) {
    const id = String(incoming.id);
    const prev = existingById.get(id);
    if (!prev) {
      merged.push({
        ...incoming,
        seededAt: now,
        updatedAt: now
      });
      continue;
    }
    // All user-configurable fields (label, metric, filters, seed value, holder info) are
    // taken from incoming. Verification history is preserved from prev.
    merged.push({
      id: prev.id,
      label: incoming.label,
      value: incoming.value != null ? incoming.value : prev.value,
      unit: incoming.unit || unitForMetricKey(incoming.metricKey || prev.metricKey),
      notes: incoming.notes,
      metricKey: incoming.metricKey || prev.metricKey || null,
      activityType: incoming.activityType != null ? incoming.activityType : (prev.activityType || null),
      terrain: incoming.terrain != null ? incoming.terrain : (prev.terrain || null),
      gender: incoming.gender != null ? incoming.gender : (prev.gender || null),
      raceDistance: incoming.raceDistance != null ? incoming.raceDistance : (prev.raceDistance || null),
      holderName: incoming.holderName,
      holderYear: incoming.holderYear,
      holderTeam: incoming.holderTeam,
      holderUserId: incoming.holderUserId != null ? incoming.holderUserId : (prev.holderUserId || null),
      autoFill: incoming.autoFill === true,
      calendarMonth: incoming.calendarMonth || null,
      iconId: incoming.iconId,
      verificationRequired: true,
      seededAt: prev.seededAt || now,
      updatedAt: now,
      lastVerifiedAt: prev.lastVerifiedAt || null,
      lastVerifiedWorkoutId: prev.lastVerifiedWorkoutId || null,
      lastVerifiedByUserId: prev.lastVerifiedByUserId || null
    });
  }
  return merged;
};

const getMetricValueFromWorkout = (metricKey, workout) => {
  if (!metricKey || !workout) return null;
  if (metricKey === 'distance_miles') {
    const n = Number(workout.distance_value);
    return Number.isFinite(n) ? n : null;
  }
  if (metricKey === 'duration_minutes') {
    const n = Number(workout.duration_minutes);
    return Number.isFinite(n) ? n : null;
  }
  if (metricKey === 'points') {
    const n = Number(workout.points);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const ensureClubAdminAccess = async ({ user, clubId }) => {
  if (!Number.isFinite(clubId) || clubId < 1) return { ok: false, status: 400, message: 'Invalid club ID' };
  if (!user?.id) return { ok: false, status: 401, message: 'Sign in required' };
  const [clubRows] = await pool.execute(
    'SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1',
    [clubId]
  );
  const club = clubRows?.[0];
  if (!club) {
    return { ok: false, status: 404, message: 'Club not found' };
  }
  if (String(club.organization_type || '').toLowerCase() !== 'affiliation') {
    return {
      ok: false,
      status: 400,
      message: 'That id is not a Summit club. Club settings and records use the club (affiliation) organization, not the platform tenant.'
    };
  }
  const hasAccess = await canUserManageClub({ user, clubId });
  if (!hasAccess) return { ok: false, status: 403, message: 'Club manager access required' };
  return { ok: true, club };
};

const hasUserEmailVerified = async (userId) => {
  const dbName = process.env.DB_NAME || 'onboarding_stage';
  try {
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at'",
      [dbName]
    );
    if (!cols?.length) return true;
    const [rows] = await pool.execute(
      'SELECT email_verified_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return !!rows?.[0]?.email_verified_at;
  } catch {
    return true;
  }
};

/** Resolve Summit Stats Team Challenge platform agency ID (for club creation, club manager emails, etc.). */
export async function getPlatformAgencyId() {
  const envId = process.env.SUMMIT_STATS_PLATFORM_AGENCY_ID;
  if (envId) {
    const id = parseInt(envId, 10);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const envSlug = String(process.env.SUMMIT_STATS_PLATFORM_SLUG || 'sstc').trim().toLowerCase();
  // Try the most-likely-current slug first, then legacy alternates.
  const slugCandidates = Array.from(new Set([envSlug, 'sstc', 'ssc', 'summit-stats'].filter(Boolean)));

  if (slugCandidates.length) {
    const placeholders = slugCandidates.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT id, LOWER(COALESCE(slug, '')) AS slug_key
       FROM agencies
       WHERE LOWER(COALESCE(slug, '')) IN (${placeholders})`,
      slugCandidates
    );
    const bySlug = new Map((rows || []).map((row) => [String(row.slug_key || '').toLowerCase(), Number(row.id)]));
    for (const slug of slugCandidates) {
      const agencyId = bySlug.get(slug);
      if (Number.isFinite(agencyId) && agencyId > 0) return agencyId;
    }
  }

  return null;
}

export async function getPlatformAgencyIds(platformSlug = null) {
  const envSlug = String(process.env.SUMMIT_STATS_PLATFORM_SLUG || 'sstc').trim().toLowerCase();
  const requestedSlug = String(platformSlug || '').trim().toLowerCase();
  const isSummitStatsAlias = ['ssc', 'sstc', 'summit-stats', envSlug].includes(requestedSlug);
  const slugSet = new Set();

  if (requestedSlug) slugSet.add(requestedSlug);
  if (!requestedSlug || isSummitStatsAlias) {
    slugSet.add(envSlug);
    slugSet.add('ssc');
    slugSet.add('sstc');
    slugSet.add('summit-stats');
  }

  const slugs = Array.from(slugSet).filter(Boolean);
  if (!slugs.length) {
    const fallbackId = await getPlatformAgencyId();
    return fallbackId ? [fallbackId] : [];
  }

  const placeholders = slugs.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT id
     FROM agencies
     WHERE LOWER(COALESCE(slug, '')) IN (${placeholders})`,
    slugs
  );
  const ids = (rows || []).map((r) => Number(r.id)).filter(Number.isFinite);

  if (ids.length > 0) return Array.from(new Set(ids));

  const fallbackId = await getPlatformAgencyId();
  return fallbackId ? [fallbackId] : [];
}

/**
 * Create a club (affiliation) under the Summit Stats Team Challenge platform.
 * Requires: auth + email verified. Manager power is scoped to the created club.
 */
export const createClub = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const {
      name,
      slug: inputSlug,
      city,
      state,
      managerUserId: rawManagerUserId,
      assistantManagerUserIds: rawAssistantIds
    } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) {
      return res.status(400).json({ error: { message: 'Club name is required' } });
    }

    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({
        error: { message: `${SUMMIT_STATS_TEAM_CHALLENGE_NAME} is not configured. Contact support.` }
      });
    }

    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Sign in required' } });
    }

    const callerRole = String(user.role || '').trim().toLowerCase();
    const callerIsSuperAdmin = callerRole === 'super_admin';

    const parsedManagerId = parseInt(rawManagerUserId, 10);
    const overrideManagerId =
      callerIsSuperAdmin && Number.isFinite(parsedManagerId) && parsedManagerId > 0
        ? parsedManagerId
        : null;
    const targetManagerId = overrideManagerId || user.id;

    let assistantManagerIds = [];
    if (callerIsSuperAdmin && Array.isArray(rawAssistantIds)) {
      const seen = new Set();
      for (const raw of rawAssistantIds) {
        const id = parseInt(raw, 10);
        if (!Number.isFinite(id) || id < 1) continue;
        if (id === targetManagerId) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        assistantManagerIds.push(id);
      }
    }

    if (overrideManagerId) {
      const managerExists = await User.findById(overrideManagerId);
      if (!managerExists) {
        return res.status(400).json({ error: { message: 'Manager user not found' } });
      }
    }
    if (assistantManagerIds.length) {
      for (const aid of assistantManagerIds) {
        const exists = await User.findById(aid);
        if (!exists) {
          return res.status(400).json({ error: { message: `Assistant manager user ${aid} not found` } });
        }
      }
    }

    if (!callerIsSuperAdmin) {
      const emailVerified = await hasUserEmailVerified(user.id);
      if (!emailVerified) {
        return res.status(403).json({
          error: {
            message: 'Email verification required before creating a club.',
            code: 'EMAIL_VERIFICATION_REQUIRED'
          }
        });
      }
    }

    const finalSlug = inputSlug?.trim() ? slugify(inputSlug) : slugify(nameTrimmed);
    if (!finalSlug) {
      return res.status(400).json({ error: { message: 'Could not generate a valid slug from the club name' } });
    }

    const existing = await Agency.findBySlug(finalSlug);
    if (existing) {
      return res.status(400).json({ error: { message: 'A club with this slug already exists' } });
    }

    const agency = await Agency.create({
      name: nameTrimmed,
      slug: finalSlug,
      organizationType: 'affiliation',
      isActive: true
    });

    await OrganizationAffiliation.upsert({
      agencyId: platformAgencyId,
      organizationId: agency.id,
      isActive: true
    });

    // Promote the *target* manager (not the caller, when superadmin acts on behalf of someone).
    const promoteIfNeeded = async (uid) => {
      const target = await User.findById(uid);
      const role = String(target?.role || '').trim().toLowerCase();
      if (!['super_admin', 'admin', 'support', 'club_manager'].includes(role)) {
        await User.update(uid, { role: 'club_manager' });
      }
    };

    await promoteIfNeeded(targetManagerId);
    await User.assignToAgency(targetManagerId, platformAgencyId, { isActive: true });
    await User.assignToAgency(targetManagerId, agency.id, { clubRole: 'manager', isActive: true });

    for (const aid of assistantManagerIds) {
      await promoteIfNeeded(aid);
      await User.assignToAgency(aid, platformAgencyId, { isActive: true });
      await User.assignToAgency(aid, agency.id, { clubRole: 'assistant_manager', isActive: true });
    }

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [agencyCols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('city','state')",
      [dbName]
    );
    const columnSet = new Set((agencyCols || []).map((row) => row.COLUMN_NAME));
    const updates = [];
    const params = [];
    if (columnSet.has('city')) {
      updates.push('city = ?');
      params.push(String(city || '').trim() || null);
    }
    if (columnSet.has('state')) {
      updates.push('state = ?');
      params.push(String(state || '').trim().toUpperCase().slice(0, 32) || null);
    }
    if (updates.length) {
      params.push(agency.id);
      await pool.execute(
        `UPDATE agencies SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    await pool.execute(
      `INSERT INTO club_billing_accounts
         (club_id, plan_type, trial_starts_at, trial_ends_at)
       VALUES (?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL 3 MONTH))
       ON DUPLICATE KEY UPDATE club_id = club_id`,
      [agency.id]
    );

    res.status(201).json(agency);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'A club with this slug already exists' } });
    }
    next(error);
  }
};

/**
 * Returns the billing status row for a club. Used to show trial countdowns etc.
 */
export const getClubBillingStatus = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    if (!clubId || isNaN(clubId)) {
      return res.status(400).json({ error: { message: 'Invalid club id' } });
    }
    const [rows] = await pool.execute(
      'SELECT * FROM club_billing_accounts WHERE club_id = ? LIMIT 1',
      [clubId]
    );
    res.json(rows[0] || null);
  } catch (error) {
    next(error);
  }
};

/**
 * Public: List clubs (affiliations under Summit Stats Team Challenge platform).
 * No auth required - for browsing/searching clubs.
 */
export const listClubs = async (req, res, next) => {
  try {
    const platformAgencyIds = await getPlatformAgencyIds(
      req.query?.platformSlug || req.query?.orgSlug || req.query?.organizationSlug
    );
    if (!platformAgencyIds.length) {
      return res.status(503).json({
        error: { message: `${SUMMIT_STATS_TEAM_CHALLENGE_NAME} is not configured.` }
      });
    }

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [agencyCols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'agencies'",
      [dbName]
    );
    const agencyColumnSet = new Set((agencyCols || []).map((r) => r.COLUMN_NAME));
    const hasState = agencyColumnSet.has('state');
    const hasCity = agencyColumnSet.has('city');

    const search = String(req.query?.search || req.query?.q || '').trim();
    const state = String(req.query?.state || '').trim();
    // Inline LIMIT/OFFSET: some MySQL/CloudSQL setups reject prepared-statement params for these
    const limit = Math.trunc(Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 50)));
    const offset = Math.trunc(Math.max(0, parseInt(req.query?.offset, 10) || 0));

    const platformPlaceholders = platformAgencyIds.map(() => '?').join(', ');
    let where = `oa.agency_id IN (${platformPlaceholders}) AND oa.is_active = 1 AND a.organization_type = 'affiliation' AND a.is_active = 1`;
    const params = [...platformAgencyIds];

    if (state && hasState) {
      where += ` AND (a.state = ? OR UPPER(TRIM(a.state)) = ?)`;
      const stateNorm = state.toUpperCase().trim();
      params.push(state, stateNorm);
    }

    if (search) {
      const searchConditions = ['a.name LIKE ?', 'a.slug LIKE ?'];
      if (hasCity) searchConditions.push('a.city LIKE ?');
      where += ` AND (${searchConditions.join(' OR ')})`;
      const pattern = `%${search.replace(/%/g, '\\%')}%`;
      params.push(...searchConditions.map(() => pattern));
    }

    const selectCols = ['a.id', 'a.name', 'a.slug'];
    if (hasState) selectCols.push('a.state');
    if (hasCity) selectCols.push('a.city');
    selectCols.push('a.organization_type', 'a.is_active', 'a.created_at');

    const searchLower = search ? search.toLowerCase().trim() : '';
    const orderBy = searchLower
      ? `CASE
           WHEN LOWER(a.name) = ? THEN 0
           WHEN LOWER(a.name) LIKE ? THEN 1
           WHEN LOWER(a.slug) LIKE ? THEN 2
           ELSE 3
         END, a.name ASC`
      : 'a.name ASC';
    const orderParams = searchLower
      ? [searchLower, `${searchLower}%`, `${searchLower}%`]
      : [];

    const [rows] = await pool.execute(
      `SELECT DISTINCT ${selectCols.join(', ')}
       FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      [...params, ...orderParams]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(DISTINCT a.id) as total FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE ${where}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);

    const clubs = await Promise.all((rows || []).map(async (club) => {
      const manager = await getPrimaryClubManager(club.id);
      return {
        ...club,
        primaryManagerName: formatClubManagerDisplayName(manager) || null,
        primaryManagerUserId: manager?.userId || null
      };
    }));

    res.json({
      clubs,
      total,
      inviteOnlyMemberSignup: isSstcInviteOnlyMemberSignup()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply to join a club. Requires auth. Assigns user to club.
 */
export const applyToClub = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'Invalid club ID' } });
    }

    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({ error: { message: `${SUMMIT_STATS_TEAM_CHALLENGE_NAME} is not configured.` } });
    }

    const [affRows] = await pool.execute(
      `SELECT oa.organization_id FROM organization_affiliations oa
       WHERE oa.agency_id = ? AND oa.organization_id = ? AND oa.is_active = 1`,
      [platformAgencyId, clubId]
    );
    if (!affRows?.length) {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Sign in to apply' } });
    }

    const agencies = await User.getAgencies(user.id);
    const alreadyMember = (agencies || []).some((a) => Number(a?.id) === clubId);
    if (alreadyMember) {
      return res.status(400).json({ error: { message: 'You are already a member of this club' } });
    }

    let inviteForJoin = null;
    if (isSstcInviteOnlyMemberSignup()) {
      const token = String(req.body?.inviteToken || '').trim();
      if (!token) {
        return res.status(403).json({
          error: {
            message: 'A valid club invite is required to join. Open the invitation link from your club, or ask your club leader for one.',
            code: 'INVITE_REQUIRED'
          }
        });
      }
      inviteForJoin = await getActiveInviteForTokenAndClub(token, clubId);
      if (!inviteForJoin) {
        return res.status(403).json({
          error: {
            message: 'That invite is invalid, expired, or already used.',
            code: 'INVITE_INVALID'
          }
        });
      }
      const userEmail = String(user.email || '').trim().toLowerCase();
      if (!inviteEmailMatchesInviteRow(inviteForJoin, userEmail)) {
        return res.status(400).json({
          error: { message: 'This invite was issued for a different email address than your signed-in account.' }
        });
      }
    }

    await User.assignToAgency(user.id, clubId, { clubRole: 'member', isActive: true });

    let enrolledSeasonId = null;
    if (inviteForJoin) {
      // Bump the times_used counter; for environments where migration 715
      // has not yet run, fall back to the legacy single-use behavior.
      try {
        await pool.execute(
          `UPDATE challenge_member_invites
           SET times_used = times_used + 1,
               used_at = CASE
                 WHEN max_uses IS NULL OR (times_used + 1) >= max_uses THEN NOW()
                 ELSE used_at
               END
           WHERE id = ?`,
          [inviteForJoin.id]
        );
      } catch (e) {
        const tolerable = e?.code === 'ER_BAD_FIELD_ERROR' || String(e?.message || '').includes('Unknown column');
        if (!tolerable) throw e;
        await pool.execute('UPDATE challenge_member_invites SET used_at = NOW() WHERE id = ?', [inviteForJoin.id]);
      }

      // Season fast-track: drop the user into the linked season as well.
      if (inviteForJoin.learning_class_id) {
        try {
          const LearningProgramClass = (await import('../models/LearningProgramClass.model.js')).default;
          await LearningProgramClass.addProviderMember({
            classId: Number(inviteForJoin.learning_class_id),
            providerUserId: user.id,
            membershipStatus: 'active',
            roleLabel: null,
            notes: 'Auto-enrolled via season invite link',
            actorUserId: null
          });
          enrolledSeasonId = Number(inviteForJoin.learning_class_id);
        } catch (enrollErr) {
          console.warn('[invite] season auto-enroll failed', enrollErr?.message || enrollErr);
        }
      }
    }

    const club = await Agency.findById(clubId);
    res.status(201).json({
      message: enrolledSeasonId
        ? 'You have joined the club and the season.'
        : 'You have joined the club.',
      seasonId: enrolledSeasonId,
      club: club ? { id: club.id, name: club.name, slug: club.slug } : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a member to a club by email. Club manager only.
 * Checks if user exists: if yes, assigns to club; if no, returns exists: false with invite guidance.
 */
export const addMemberToClub = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: errors.array()[0]?.msg || 'Validation failed', errors: errors.array() } });
    }

    const clubId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'Invalid club ID' } });
    }

    // Accept email, username, or phone number as the lookup identifier.
    const identifier = String(req.body?.identifier || req.body?.email || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: { message: 'Email, username, or phone number is required' } });
    }

    const user = req.user;
    const hasAccess = await canUserManageClub({ user, clubId });
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'You do not have access to this club' } });
    }

    const [clubRows] = await pool.execute(
      'SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1',
      [clubId]
    );
    const club = clubRows?.[0];
    if (!club || String(club.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    // Try email → username → phone (digits only) in order.
    const identifierLower = identifier.toLowerCase();
    const identifierDigits = identifier.replace(/\D/g, '');
    const looksLikePhone =
      identifierDigits.length >= 7 && identifierDigits.length <= 15 && !/[@.]/.test(identifier);

    let existingUser =
      (await User.findByEmail(identifierLower)) ||
      (await User.findByUsername(identifierLower));
    if (!existingUser && looksLikePhone) {
      existingUser = await User.findByPhone(identifier);
    }

    if (!existingUser) {
      return res.json({
        exists: false,
        message: 'No account found for that email, username, or phone number. They can sign up as a participant and apply to join your club.'
      });
    }

    const agencies = await User.getAgencies(existingUser.id);
    const alreadyMember = (agencies || []).some((a) => Number(a?.id) === clubId);
    if (alreadyMember) {
      return res.status(400).json({ error: { message: 'This person is already a member of your club' } });
    }

    await User.assignToAgency(existingUser.id, clubId, { clubRole: 'member', isActive: true });
    const displayName = `${(existingUser.first_name || '').trim()} ${(existingUser.last_name || '').trim()}`.trim() || identifier;
    return res.json({
      exists: true,
      added: true,
      message: displayName ? `${displayName} has been added to your club.` : 'Member added to your club.'
    });
  } catch (error) {
    next(error);
  }
};

export const startContactManagerThread = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'Invalid club ID' } });
    }
    if (!req.user?.id) {
      return res.status(401).json({ error: { message: 'Sign in required' } });
    }

    const club = await Agency.findById(clubId);
    if (!club || String(club.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const manager = await getPrimaryClubManager(clubId);
    if (!manager?.userId) {
      return res.status(404).json({ error: { message: 'No active club manager found for this club' } });
    }
    if (Number(manager.userId) === Number(req.user.id)) {
      return res.status(409).json({
        error: { message: 'You already manage this club. Open Messages from your dashboard to continue the conversation there.' }
      });
    }

    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({ error: { message: `${SUMMIT_STATS_TEAM_CHALLENGE_NAME} is not configured.` } });
    }

    await User.assignToAgency(req.user.id, platformAgencyId, { isActive: true });
    await User.assignToAgency(manager.userId, platformAgencyId, { isActive: true });

    const [existing] = await pool.execute(
      `SELECT tp.thread_id
       FROM chat_threads t
       INNER JOIN chat_thread_participants tp ON tp.thread_id = t.id
       WHERE t.agency_id = ?
         AND (t.organization_id <=> ?)
         AND t.thread_type = 'direct'
         AND tp.user_id IN (?, ?)
       GROUP BY tp.thread_id
       HAVING COUNT(DISTINCT tp.user_id) = 2
       LIMIT 1`,
      [platformAgencyId, clubId, req.user.id, manager.userId]
    );

    let threadId = Number(existing?.[0]?.thread_id || 0) || null;
    if (!threadId) {
      const [insert] = await pool.execute(
        'INSERT INTO chat_threads (agency_id, organization_id, thread_type) VALUES (?, ?, ?)',
        [platformAgencyId, clubId, 'direct']
      );
      threadId = Number(insert.insertId);
      await pool.execute(
        'INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?), (?, ?)',
        [threadId, req.user.id, threadId, manager.userId]
      );
    }

    return res.json({
      ok: true,
      threadId,
      agencyId: platformAgencyId,
      organizationId: clubId,
      managerUserId: manager.userId,
      managerName: formatClubManagerDisplayName(manager) || 'Club manager'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get club specs: fitness totals and current season metrics.
 * GET /api/summit-stats/club-specs?agencyId=123
 */
export const getClubSpecs = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!Number.isFinite(agencyId) || agencyId < 1) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const user = req.user;
    const hasAccess = await canUserManageClub({ user, clubId: agencyId });
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'You do not have access to this club' } });
    }

    const [orgRows] = await pool.execute(
      'SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const org = orgRows?.[0];
    if (!org || String(org.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const result = {
      agencyId,
      refreshedAt: new Date().toISOString(),
      totalMiles: 0,
      estimatedCalories: 0,
      totalPoints: 0,
      totalWorkouts: 0,
      currentSeason: null,
      // Per-activity-type mile breakdowns (only populated when > 0)
      activityMiles: {
        run: 0,
        ruck: 0,
        walk: 0,
        cycling: 0,
        steps: 0,
        other: 0,
      },
    };

    try {
      const [totals] = await pool.execute(
        `SELECT
           COUNT(w.id) AS workout_count,
           COALESCE(SUM(w.points), 0) AS total_points,
           COALESCE(SUM(w.distance_value), 0) AS total_distance,
           COALESCE(SUM(w.duration_minutes), 0) AS total_duration
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
           AND (w.proof_status IS NULL OR w.proof_status IN ('not_required','approved'))`,
        [agencyId]
      );
      const r = totals?.[0];
      result.totalWorkouts = Number(r?.workout_count || 0);
      result.totalPoints = Number(r?.total_points || 0);
      result.totalMiles = Math.round(Number(r?.total_distance || 0) * 100) / 100;

      // Use actual stored calories (from Strava/device imports) when available;
      // fall back to standardised activity estimates only for rows without them.
      // Also bucket distance by activity type for per-sport mile totals.
      const [byType] = await pool.execute(
        `SELECT w.activity_type, w.distance_value, w.duration_minutes, w.calories_burned
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
           AND (w.proof_status IS NULL OR w.proof_status IN ('not_required','approved'))`,
        [agencyId]
      );
      let totalCal = 0;
      const am = result.activityMiles;
      for (const row of byType || []) {
        const at  = String(row?.activity_type || '').toLowerCase();
        const dist = Number(row?.distance_value || 0);
        const dur  = Number(row?.duration_minutes || 0);

        // ── Calorie tally ──────────────────────────────────────────
        const stored = Number(row?.calories_burned || 0);
        if (stored > 0) {
          totalCal += stored;
        } else {
          const est = estimateCalories({ activityType: at, distanceMiles: dist, durationMinutes: dur });
          totalCal += est ?? 0;
        }

        // ── Per-activity distance tally ────────────────────────────
        if (dist <= 0) continue;
        // Use includes() so both canonical ("run") and legacy ("running") match
        if (at.includes('ruck'))                                         am.ruck    += dist;
        else if (at.includes('run') || at.includes('jog') || at.includes('sprint')) am.run  += dist;
        else if (at.includes('walk') || at.includes('hike'))            am.walk    += dist;
        else if (at.includes('cycl') || at.includes('bike') || at.includes('spin')) am.cycling += dist;
        else if (at.includes('step') || at.includes('stair'))           am.steps   += dist;
        else                                                             am.other   += dist;
      }
      try {
        const retained = await loadRetainedTotalsForClub(agencyId);
        const rq = retained.qual || {};
        result.totalWorkouts += Number(rq.workoutCount || 0);
        result.totalPoints += Number(rq.points || 0);
        result.totalMiles += Number(rq.distance || 0);
        totalCal += Number(rq.calories || 0);
        const ram = rq.activityMiles || {};
        for (const key of Object.keys(am)) {
          am[key] += Number(ram[key] || 0);
        }
      } catch (re) {
        if (re?.code !== 'ER_NO_SUCH_TABLE') throw re;
      }

      result.estimatedCalories = Math.round(totalCal);
      // Round to 2 decimals and drop zero buckets (frontend decides what to show)
      for (const key of Object.keys(am)) {
        am[key] = Math.round(am[key] * 100) / 100;
      }
      result.totalMiles = Math.round(Number(result.totalMiles || 0) * 100) / 100;
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }

    try {
      const [seasonRows] = await pool.execute(
        `SELECT c.id, c.class_name, c.status, c.starts_at, c.ends_at,
                (SELECT COUNT(DISTINCT pm.provider_user_id)
                 FROM learning_class_provider_memberships pm
                 WHERE pm.learning_class_id = c.id AND pm.membership_status IN ('active','completed')) AS participants,
                (SELECT COUNT(*) FROM challenge_teams t WHERE t.learning_class_id = c.id) AS teams,
                (SELECT COUNT(*) FROM challenge_workouts w WHERE w.learning_class_id = c.id) AS workouts
         FROM learning_program_classes c
         WHERE c.organization_id = ? AND c.is_active = 1
         ORDER BY CASE WHEN LOWER(COALESCE(c.status,'')) = 'active' THEN 0 ELSE 1 END, COALESCE(c.starts_at, '9999-12-31') DESC, c.id DESC
         LIMIT 1`,
        [agencyId]
      );
      const season = seasonRows?.[0];
      if (season) {
        result.currentSeason = {
          id: season.id,
          name: season.class_name,
          status: season.status || 'draft',
          participants: Number(season.participants || 0),
          teams: Number(season.teams || 0),
          workouts: Number(season.workouts || 0),
          startsAt: season.starts_at,
          endsAt: season.ends_at
        };
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get club manager context: clubs, email verified, can create club.
 */
export const getClubManagerContext = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Not authenticated' } });
    }

    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);

    const agencies = await User.getAgencies(user.id);
    let clubs = (agencies || []).filter(
      (a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation'
    );
    if (plat) {
      const cids = clubs.map((c) => Number(c.id)).filter((id) => id > 0);
      if (cids.length) {
        const ph = cids.map(() => '?').join(',');
        const [allowedRows] = await pool.execute(
          `SELECT a.id FROM agencies a WHERE a.id IN (${ph})${plat.sql}`,
          [...cids, ...plat.params]
        );
        const allowed = new Set((allowedRows || []).map((r) => Number(r.id)));
        clubs = clubs.filter((c) => allowed.has(Number(c.id)));
      } else {
        clubs = [];
      }
    }

    const emailVerified = await hasUserEmailVerified(user.id);
    let managedClubs = await getManagedClubsForUser(user.id, { includeAssistant: true });
    if (plat && managedClubs?.length) {
      const mids = managedClubs.map((row) => Number(row.id)).filter((id) => id > 0);
      if (mids.length) {
        const phm = mids.map(() => '?').join(',');
        const [mOk] = await pool.execute(
          `SELECT a.id FROM agencies a WHERE a.id IN (${phm})${plat.sql}`,
          [...mids, ...plat.params]
        );
        const allowM = new Set((mOk || []).map((r) => Number(r.id)));
        managedClubs = managedClubs.filter((row) => allowM.has(Number(row.id)));
      } else {
        managedClubs = [];
      }
    }
    const summitStatsScopedAdmin = managedClubs.length > 0;

    res.json({
      clubs,
      managedClubs,
      emailVerified,
      canCreateClub: !!emailVerified,
      summitStatsScopedAdmin
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/summit-stats/me/leave-club
 * Member leaves a Summit club (removes membership, season enrollments, team rows).
 * Does NOT delete challenge_workouts — club aggregate miles/points (summed by organization_id) are unchanged.
 */
export const leaveSummitClubMembership = async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({ error: { message: 'Sign in required' } });
    }
    const clubId = parseInt(req.body?.clubId, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'clubId is required' } });
    }

    const platformId = await getPlatformAgencyId();
    if (platformId && clubId === platformId) {
      return res.status(400).json({ error: { message: 'You cannot leave the platform organization this way.' } });
    }

    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
    const [clubRows] = await conn.execute(
      `SELECT id FROM agencies a WHERE id = ? AND LOWER(COALESCE(organization_type,'')) = 'affiliation'${plat.sql}`,
      [clubId, ...plat.params]
    );
    if (!clubRows?.length) {
      return res.status(404).json({ error: { message: 'Club not found or not available to leave.' } });
    }

    const [uaRows] = await conn.execute(
      `SELECT COALESCE(club_role,'member') AS club_role FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [userId, clubId]
    );
    if (!uaRows?.length) {
      return res.status(404).json({ error: { message: 'You are not a member of this club.' } });
    }

    const cr = String(uaRows[0].club_role || 'member').toLowerCase();
    if (cr === 'manager') {
      const [mc] = await conn.execute(
        `SELECT COUNT(*) AS n FROM user_agencies
         WHERE agency_id = ? AND COALESCE(is_active,1) = 1 AND LOWER(COALESCE(club_role,'member')) = 'manager'`,
        [clubId]
      );
      if (Number(mc[0]?.n) <= 1) {
        return res.status(403).json({
          error: {
            message:
              'You are the only club manager. Assign another manager in club settings before leaving, or contact support.',
            code: 'SOLE_MANAGER'
          }
        });
      }
    }

    await conn.beginTransaction();
    try {
      await conn.execute(
        `DELETE tm FROM challenge_team_members tm
         INNER JOIN challenge_teams t ON t.id = tm.team_id
         INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
         WHERE tm.provider_user_id = ? AND c.organization_id = ?`,
        [userId, clubId]
      );
      await conn.execute(
        `DELETE m FROM learning_class_provider_memberships m
         INNER JOIN learning_program_classes c ON c.id = m.learning_class_id
         WHERE m.provider_user_id = ? AND c.organization_id = ?`,
        [userId, clubId]
      );
      await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [userId, clubId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }

    return res.json({ ok: true, clubId, message: 'You have left this club.' });
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/summit-stats/me/data-export
 * JSON export of profile identifiers + challenge workouts (self-service).
 */
export const exportMySummitChallengeData = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Sign in required' } });

    const [userRows] = await pool.execute(
      `SELECT id, email, first_name, last_name, role, status, timezone, created_at, personal_phone, phone
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const profile = userRows?.[0] || null;

    let workouts = [];
    try {
      const [wRows] = await pool.execute(
        `SELECT w.id, w.learning_class_id, w.team_id, w.activity_type, w.distance_value, w.duration_minutes,
                w.points, w.completed_at, w.created_at, w.contributor_anonymized_at,
                c.organization_id AS club_id, c.class_name
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE w.user_id = ?
         ORDER BY w.completed_at DESC, w.id DESC`,
        [userId]
      );
      workouts = wRows || [];
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [wRows] = await pool.execute(
        `SELECT w.id, w.learning_class_id, w.team_id, w.activity_type, w.distance_value, w.duration_minutes,
                w.points, w.completed_at, w.created_at,
                c.organization_id AS club_id, c.class_name
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE w.user_id = ?
         ORDER BY w.completed_at DESC, w.id DESC`,
        [userId]
      );
      workouts = wRows || [];
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="my-summit-challenge-data.json"');
    return res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          profile,
          workouts
        },
        null,
        2
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/summit-stats/me/anonymize-club-contributions
 * Body: { clubId } — marks existing workouts in that club as anonymous in club-facing views (miles/points unchanged).
 */
export const anonymizeMyContributionsInClub = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Sign in required' } });
    const clubId = parseInt(req.body?.clubId, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'clubId is required' } });
    }

    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
    const [clubRows] = await pool.execute(
      `SELECT id FROM agencies a WHERE id = ? AND LOWER(COALESCE(organization_type,'')) = 'affiliation'${plat.sql}`,
      [clubId, ...plat.params]
    );
    if (!clubRows?.length) {
      return res.status(404).json({ error: { message: 'Club not found.' } });
    }

    const [mem] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [userId, clubId]
    );
    const [hasWork] = await pool.execute(
      `SELECT 1 FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       WHERE w.user_id = ? AND c.organization_id = ?
       LIMIT 1`,
      [userId, clubId]
    );
    if (!mem?.length && !hasWork?.length) {
      return res.status(403).json({
        error: { message: 'No membership or workout history found for this club.' }
      });
    }

    let result;
    try {
      [result] = await pool.execute(
        `UPDATE challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         SET w.contributor_anonymized_at = UTC_TIMESTAMP()
         WHERE w.user_id = ? AND c.organization_id = ?`,
        [userId, clubId]
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({
          error: { message: 'Anonymization is not available until the database migration for contributor anonymity is applied.' }
        });
      }
      throw e;
    }

    return res.json({
      ok: true,
      clubId,
      workoutsUpdated: Number(result?.affectedRows ?? 0),
      message:
        "Only your name on this club's leaderboards (and similar ranked views) will read as anonymous. Other members are unchanged. Miles and points are still stored on your existing workout rows — we did not create a second copy. Manager-edited record boards are unchanged unless they update them."
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get manual all-time club records.
 * GET /api/summit-stats/clubs/:id/records
 */
export const getClubRecords = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      `SELECT records_json, updated_at
       FROM summit_stats_club_records
       WHERE agency_id = ?
       LIMIT 1`,
      [clubId]
    );
    const rec = rows?.[0] || null;

    // Collect distinct genders present across all active seasons for this club
    let availableGenders = [];
    try {
      const [gRows] = await pool.execute(
        `SELECT DISTINCT g.gender
         FROM (
           SELECT a.gender
           FROM challenge_member_applications a
           INNER JOIN learning_program_classes c ON c.id = a.learning_class_id
           WHERE c.organization_id = ? AND a.gender IS NOT NULL AND a.gender != ''
           UNION
           SELECT p.gender
           FROM challenge_participant_profiles p
           INNER JOIN learning_program_classes c ON c.id = p.learning_class_id
           WHERE c.organization_id = ? AND p.gender IS NOT NULL AND p.gender != ''
         ) g`,
        [clubId, clubId]
      );
      availableGenders = (gRows || []).map(r => String(r.gender || '').trim().toLowerCase()).filter(Boolean);
    } catch { /* non-fatal */ }

    return res.json({
      agencyId: clubId,
      records: normalizeClubRecords(parseClubRecords(rec?.records_json)),
      updatedAt: rec?.updated_at || null,
      availableGenders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upsert manual all-time club records.
 * PUT /api/summit-stats/clubs/:id/records
 */
export const upsertClubRecords = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const incomingRecords = normalizeClubRecords(req.body?.records);
    const [existingRows] = await pool.execute(
      `SELECT records_json
       FROM summit_stats_club_records
       WHERE agency_id = ?
       LIMIT 1`,
      [clubId]
    );
    const existingRecords = normalizeClubRecords(parseClubRecords(existingRows?.[0]?.records_json));
    const records = mergeSeedRecords({ existingRecords, incomingRecords });
    await pool.execute(
      `INSERT INTO summit_stats_club_records
       (agency_id, records_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         records_json = VALUES(records_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [clubId, JSON.stringify(records), req.user.id, req.user.id]
    );
    // Synchronously recompute auto-fill records so the response reflects live data
    try { await recomputeAutoFillRecords({ clubId }); } catch { /* non-fatal */ }
    const [freshRows] = await pool.execute(
      `SELECT records_json FROM summit_stats_club_records WHERE agency_id = ? LIMIT 1`, [clubId]
    );
    const freshRecords = normalizeClubRecords(parseClubRecords(freshRows?.[0]?.records_json));
    return res.json({ agencyId: clubId, records: freshRecords });
  } catch (error) {
    next(error);
  }
};

// ─── Race Completion Clubs ────────────────────────────────────────────────────

const parseRaceClubsConfig = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const normalizeRaceClubsConfig = (input) => {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((rc) => ({
    id: String(rc?.id || `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    label: String(rc?.label || '').trim(),
    raceDistanceMiles: Number(rc?.raceDistanceMiles) || 0,
    tolerancePct: Math.min(Math.max(Number(rc?.tolerancePct) || 5, 1), 30),
    tiers: Array.isArray(rc?.tiers)
      ? rc.tiers
          .map((t) => ({
            count: Math.max(1, Math.trunc(Number(t?.count) || 1)),
            iconId: Number.isFinite(Number(t?.iconId)) && Number(t?.iconId) > 0 ? Math.trunc(Number(t.iconId)) : null,
            label: String(t?.label || '').trim()
          }))
          .sort((a, b) => a.count - b.count)
      : [],
    // manualOverrides: seed counts for members who completed races before system tracking
    manualOverrides: Array.isArray(rc?.manualOverrides)
      ? rc.manualOverrides
          .filter((o) => o?.userId && Number(o.userId) > 0)
          .map((o) => ({
            userId: Math.trunc(Number(o.userId)),
            seedCount: Math.max(0, Math.trunc(Number(o.seedCount) || 0))
          }))
      : []
  })).filter((rc) => rc.raceDistanceMiles > 0);
};

/**
 * GET /api/summit-stats/clubs/:id/race-clubs-config
 * Admin: get race completion clubs config for a club.
 */
export const getRaceClubsConfig = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const [rows] = await pool.execute(
      `SELECT race_clubs_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const config = normalizeRaceClubsConfig(parseRaceClubsConfig(rows?.[0]?.race_clubs_config_json));
    return res.json({ agencyId: clubId, raceClubs: config });
  } catch (error) { next(error); }
};

/**
 * PUT /api/summit-stats/clubs/:id/race-clubs-config
 * Admin: save race completion clubs config.
 */
export const putRaceClubsConfig = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const incoming = normalizeRaceClubsConfig(req.body?.raceClubs);
    await pool.execute(
      `UPDATE agencies SET race_clubs_config_json = ? WHERE id = ?`,
      [JSON.stringify(incoming), clubId]
    );
    return res.json({ agencyId: clubId, raceClubs: incoming });
  } catch (error) { next(error); }
};

/**
 * Compute each member's race completions against all race club configs for a club.
 * Merges auto-detected workout counts with admin-entered seed counts (manualOverrides).
 * Returns [{id, label, raceDistanceMiles, tiers, members:[{userId, name, autoCount, seedCount, count, linked, earnedTier, nextTier}]}]
 */
export const computeRaceClubMemberships = async ({ clubId, rosterNameFormat = 'full' }) => {
  const [cfgRows] = await pool.execute(
    `SELECT race_clubs_config_json FROM agencies WHERE id = ? LIMIT 1`,
    [clubId]
  );
  const configs = normalizeRaceClubsConfig(parseRaceClubsConfig(cfgRows?.[0]?.race_clubs_config_json));
  if (!configs.length) return [];

  // Fetch all approved races across all seasons for this club, including placeholder status
  const [workoutRows] = await pool.execute(
    `SELECT w.user_id, w.race_distance_miles,
            u.first_name, u.last_name,
            COALESCE(u.is_roster_placeholder, 0) AS is_placeholder,
            u.roster_placeholder_claim_email
     FROM challenge_workouts w
     INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
     INNER JOIN users u ON u.id = w.user_id
     WHERE c.organization_id = ?
       AND w.is_race = 1
       AND w.race_distance_miles IS NOT NULL
       AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       AND (w.proof_status IN ('approved','none') OR w.proof_status IS NULL)`,
    [clubId]
  );
  const workouts = workoutRows || [];

  // Also fetch user info for any seed-count-only users referenced in manualOverrides
  const allSeedUserIds = new Set();
  for (const rc of configs) {
    for (const o of rc.manualOverrides) allSeedUserIds.add(o.userId);
  }
  const seedUserInfo = new Map(); // userId -> {name, isPlaceholder, claimEmail}
  if (allSeedUserIds.size) {
    try {
      const ph = [...allSeedUserIds].map(() => '?').join(', ');
      const [uRows] = await pool.execute(
        `SELECT id, first_name, last_name,
                COALESCE(is_roster_placeholder, 0) AS is_placeholder,
                roster_placeholder_claim_email
         FROM users WHERE id IN (${ph})`,
        [...allSeedUserIds]
      );
      for (const u of uRows || []) {
        const fn = String(u.first_name || '').trim();
        const ln = String(u.last_name || '').trim();
        let name;
        if (rosterNameFormat === 'initial_last') {
          name = fn && ln ? `${fn.charAt(0).toUpperCase()}. ${ln}` : fn || ln || `Member ${u.id}`;
        } else {
          name = [fn, ln].filter(Boolean).join(' ') || `Member ${u.id}`;
        }
        seedUserInfo.set(Number(u.id), {
          name,
          isPlaceholder: !!Number(u.is_placeholder),
          claimEmail: u.roster_placeholder_claim_email || null
        });
      }
    } catch { /* non-fatal */ }
  }

  // Collect all icon IDs we need to resolve
  const allIconIds = new Set();
  for (const rc of configs) {
    for (const tier of rc.tiers) {
      if (tier.iconId) allIconIds.add(tier.iconId);
    }
  }
  const iconUrlById = new Map();
  if (allIconIds.size) {
    try {
      const { default: Icon } = await import('../models/Icon.model.js');
      const placeholders = [...allIconIds].map(() => '?').join(', ');
      const [iconRows] = await pool.execute(
        `SELECT id, file_path FROM icons WHERE id IN (${placeholders})`,
        [...allIconIds]
      );
      for (const icon of iconRows || []) {
        iconUrlById.set(Number(icon.id), Icon.getIconUrl(icon));
      }
    } catch { /* non-fatal */ }
  }

  const result = [];
  for (const rc of configs) {
    const tol = rc.raceDistanceMiles * (rc.tolerancePct / 100);
    const minDist = rc.raceDistanceMiles - tol;
    const maxDist = rc.raceDistanceMiles + tol;

    // Auto-detected counts from actual workout rows
    const autoCountByUser = new Map();
    const userInfoByUser = new Map(); // userId -> {name, isPlaceholder, claimEmail}
    for (const w of workouts) {
      const dist = Number(w.race_distance_miles);
      if (dist < minDist || dist > maxDist) continue;
      const uid = Number(w.user_id);
      autoCountByUser.set(uid, (autoCountByUser.get(uid) || 0) + 1);
      if (!userInfoByUser.has(uid)) {
        const fn = String(w.first_name || '').trim();
        const ln = String(w.last_name || '').trim();
        let name;
        if (rosterNameFormat === 'initial_last') {
          name = fn && ln ? `${fn.charAt(0).toUpperCase()}. ${ln}` : fn || ln || `Member ${uid}`;
        } else {
          name = [fn, ln].filter(Boolean).join(' ') || `Member ${uid}`;
        }
        userInfoByUser.set(uid, {
          name,
          isPlaceholder: !!Number(w.is_placeholder),
          claimEmail: w.roster_placeholder_claim_email || null
        });
      }
    }

    // Merge with seed counts — include seed-only members too
    const allUserIds = new Set([...autoCountByUser.keys(), ...rc.manualOverrides.map(o => o.userId)]);

    const tiersDesc = [...rc.tiers].sort((a, b) => b.count - a.count);

    const members = [];
    for (const userId of allUserIds) {
      const autoCount = autoCountByUser.get(userId) || 0;
      const seedEntry = rc.manualOverrides.find((o) => o.userId === userId);
      const seedCount = seedEntry?.seedCount || 0;
      const count = autoCount + seedCount;
      if (count <= 0) continue;

      const info = userInfoByUser.get(userId) || seedUserInfo.get(userId) || { name: `Member ${userId}`, isPlaceholder: true, claimEmail: null };
      const earnedTier = tiersDesc.find((t) => count >= t.count) || null;
      if (!earnedTier) continue;
      const nextTier = rc.tiers.find((t) => t.count > count) || null;

      // All tiers this member has qualified for (ascending by count threshold)
      const earnedTiers = rc.tiers
        .filter((t) => count >= t.count)
        .sort((a, b) => a.count - b.count)
        .map((t) => ({ ...t, iconUrl: t.iconId ? (iconUrlById.get(t.iconId) || null) : null }));

      members.push({
        userId,
        name: info.name,
        linked: !info.isPlaceholder,
        claimEmail: info.claimEmail,
        autoCount,
        seedCount,
        count,
        earnedTiers,
        earnedTier: {
          ...earnedTier,
          iconUrl: earnedTier.iconId ? (iconUrlById.get(earnedTier.iconId) || null) : null
        },
        nextTier: nextTier ? {
          ...nextTier,
          iconUrl: nextTier.iconId ? (iconUrlById.get(nextTier.iconId) || null) : null
        } : null
      });
    }
    members.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const tiersWithUrls = rc.tiers.map((t) => ({ ...t, iconUrl: t.iconId ? (iconUrlById.get(t.iconId) || null) : null }));
    // topTier = the highest-count tier (with or without icon), used for club card header display
    const topTier = [...tiersWithUrls].sort((a, b) => b.count - a.count)[0] || null;

    result.push({
      id: rc.id,
      label: rc.label,
      raceDistanceMiles: rc.raceDistanceMiles,
      tiers: tiersWithUrls,
      topTier,
      members
    });
  }
  return result;
};

/**
 * GET /api/summit-stats/clubs/:id/race-clubs-members
 * Admin: returns active club members + auto-detected race counts per race club (for seed count UI).
 */
export const getRaceClubsAdminMembers = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Load config to get race club distance ranges
    const [cfgRows] = await pool.execute(
      `SELECT race_clubs_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const configs = normalizeRaceClubsConfig(parseRaceClubsConfig(cfgRows?.[0]?.race_clubs_config_json));

    // All active members across all seasons for this club (distinct users),
    // plus any users directly assigned to the club agency (catches recently-created placeholders
    // who may not yet have a season enrollment).
    const [memberRows] = await pool.execute(
      `SELECT DISTINCT
         u.id AS userId,
         u.first_name, u.last_name,
         COALESCE(u.is_roster_placeholder, 0) AS is_placeholder,
         u.roster_placeholder_claim_email AS claim_email
       FROM users u
       WHERE u.id IN (
         SELECT pm.provider_user_id
         FROM learning_class_provider_memberships pm
         INNER JOIN learning_program_classes c ON c.id = pm.learning_class_id
         WHERE c.organization_id = ?
           AND pm.membership_status IN ('active','completed')
         UNION
         SELECT ua.user_id
         FROM user_agencies ua
         WHERE ua.agency_id = ?
       )
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [clubId, clubId]
    );
    const members = (memberRows || []).map((u) => {
      const full = [u.first_name, u.last_name].map(s => String(s || '').trim()).filter(Boolean).join(' ');
      return {
        userId: Number(u.userId),
        name: full || `Member ${u.userId}`,
        linked: !Number(u.is_placeholder),
        claimEmail: u.claim_email || null
      };
    });

    if (!configs.length) {
      return res.json({ agencyId: clubId, members, autoCountsByRcId: {} });
    }

    // Fetch approved race workouts for this club
    const [workoutRows] = await pool.execute(
      `SELECT w.user_id, w.race_distance_miles
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       WHERE c.organization_id = ?
         AND w.is_race = 1
         AND w.race_distance_miles IS NOT NULL
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND (w.proof_status IN ('approved','none') OR w.proof_status IS NULL)`,
      [clubId]
    );
    const workouts = workoutRows || [];

    // Build autoCountsByRcId: { [rcId]: { [userId]: count } }
    const autoCountsByRcId = {};
    for (const rc of configs) {
      const tol = rc.raceDistanceMiles * (rc.tolerancePct / 100);
      const minDist = rc.raceDistanceMiles - tol;
      const maxDist = rc.raceDistanceMiles + tol;
      const counts = {};
      for (const w of workouts) {
        const dist = Number(w.race_distance_miles);
        if (dist < minDist || dist > maxDist) continue;
        const uid = String(w.user_id);
        counts[uid] = (counts[uid] || 0) + 1;
      }
      autoCountsByRcId[rc.id] = counts;
    }

    return res.json({ agencyId: clubId, members, autoCountsByRcId });
  } catch (error) { next(error); }
};

/**
 * GET /api/summit-stats/clubs/:id/race-clubs
 * Public (authenticated-optional): computed race club memberships for display.
 */
export const getPublicRaceClubs = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    if (!clubId) return res.status(400).json({ error: { message: 'clubId required' } });
    // Fetch club's rosterNameFormat to apply correct name display on the public page
    const [cfgRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    let rosterNameFormat = 'full';
    try {
      const raw = cfgRows?.[0]?.store_config_json;
      const storeObj = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      const cfg = typeof storeObj?.publicPageConfig === 'string'
        ? JSON.parse(storeObj.publicPageConfig)
        : (storeObj?.publicPageConfig || {});
      if (['full', 'initial_last'].includes(cfg.rosterNameFormat)) {
        rosterNameFormat = cfg.rosterNameFormat;
      }
    } catch { /* use default */ }
    const memberships = await computeRaceClubMemberships({ clubId, rosterNameFormat });
    return res.json({ agencyId: clubId, raceClubs: memberships });
  } catch (error) { next(error); }
};

/**
 * POST /api/summit-stats/clubs/:id/race-clubs-placeholder
 * Admin: create a new unlinked placeholder member and add them to the club roster,
 * so they can immediately be given seed counts in Race Completion Clubs.
 * Body: { firstName, lastName, email? }
 */
export const createRaceClubPlaceholder = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    let firstName = String(req.body?.firstName || '').trim();
    const lastName  = String(req.body?.lastName  || '').trim();
    const email     = String(req.body?.email     || '').trim().toLowerCase() || null;

    if (!firstName) return res.status(400).json({ error: { message: 'firstName is required' } });
    if (!lastName && firstName.length === 1) {
      return res.status(400).json({ error: { message: 'Last name is required when only an initial is provided' } });
    }
    // Normalize single-character first name to just the initial (no period stored)
    if (firstName.length === 1) firstName = firstName.toUpperCase();

    // If an email is given, check for an existing user first
    let existingUserId = null;
    if (email) {
      const [existing] = await pool.execute(
        `SELECT id FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(roster_placeholder_claim_email)) = ? LIMIT 1`,
        [email, email]
      );
      if (existing?.[0]?.id) existingUserId = Number(existing[0].id);
    }

    let userId;
    if (existingUserId) {
      userId = existingUserId;
    } else {
      // Create a new placeholder user
      const { default: crypto } = await import('crypto');
      const syntheticEmail = email || `placeholder-${clubId}-${crypto.randomUUID()}@placeholder.sstc.local`;
      const { default: User } = await import('../models/User.model.js');
      const newUser = await User.create({
        email: syntheticEmail,
        personalEmail: email || syntheticEmail,
        passwordHash: null,
        firstName,
        lastName,
        phoneNumber: null,
        role: 'provider',
        status: 'ACTIVE_EMPLOYEE'
      });
      userId = newUser.id;
      await pool.execute(
        `UPDATE users
         SET is_roster_placeholder = 1,
             roster_placeholder_claim_email = ?,
             roster_placeholder_claimed_at = NULL
         WHERE id = ?`,
        [email || null, userId]
      );
    }

    // Assign to the club agency as an inactive member so they appear in club-level
    // tools (race completion clubs, trophy case) without being enrolled in any season.
    const { default: User } = await import('../models/User.model.js');
    await User.assignToAgency(userId, clubId, { clubRole: 'member', isActive: false });

    const displayName = firstName.length === 1 && lastName
      ? `${firstName}. ${lastName}`
      : [firstName, lastName].filter(Boolean).join(' ');

    return res.json({
      ok: true,
      member: {
        userId,
        name: displayName,
        linked: false,
        claimEmail: email
      }
    });
  } catch (error) { next(error); }
};

// ─── Member Trophy Case ───────────────────────────────────────────────────────

/**
 * Builds the trophy case data for a single member within a club.
 * Returns { raceClubs, recordsHeld, seasonAwards }
 */
export const getMemberTrophyCaseData = async ({ clubId, userId }) => {
  // Fetch user info upfront — needed for name/email fallback matching
  let userFullName = '';
  let userEmail = '';
  let userGender = null; // used to filter gendered club records (e.g. "Most Miles Season Male")
  try {
    const [uRows] = await pool.execute(
      `SELECT first_name, last_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
    );
    const u = uRows?.[0];
    userFullName = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim().toLowerCase();
    userEmail = String(u?.email || '').trim().toLowerCase();
  } catch { /* non-fatal */ }

  // Fetch gender from application or participant profile (any season for this club)
  try {
    const [gRows] = await pool.execute(
      `SELECT COALESCE(
         (SELECT a.gender FROM challenge_member_applications a
          INNER JOIN learning_program_classes c ON c.id = a.learning_class_id
          WHERE c.organization_id = ? AND a.user_id = ?
            AND a.gender IS NOT NULL AND a.gender != ''
          ORDER BY a.id DESC LIMIT 1),
         (SELECT p.gender FROM challenge_participant_profiles p
          INNER JOIN learning_program_classes c ON c.id = p.learning_class_id
          WHERE c.organization_id = ? AND p.provider_user_id = ?
            AND p.gender IS NOT NULL AND p.gender != ''
          ORDER BY p.updated_at DESC LIMIT 1)
       ) AS gender`,
      [clubId, userId, clubId, userId]
    );
    userGender = String(gRows?.[0]?.gender || '').trim().toLowerCase() || null;
  } catch { /* non-fatal — gender filter will be skipped if lookup fails */ }

  // 1. Race club memberships for this user
  // computeRaceClubMemberships uses full name format so name matching is reliable
  let allClubs = [];
  try { allClubs = await computeRaceClubMemberships({ clubId }); } catch { /* non-fatal */ }
  const raceClubs = allClubs
    .map((rc) => {
      // Primary: match by userId
      let m = rc.members.find((m) => Number(m.userId) === Number(userId));
      // Fallback 1: placeholder linked by claim email (when admin seeded a placeholder
      // with the member's email before they claimed/connected their account)
      if (!m && userEmail) {
        m = rc.members.find((m) => String(m.claimEmail || '').trim().toLowerCase() === userEmail);
      }
      // Fallback 2: match by full name (catches cases where userId mismatch exists
      // but the member was seeded with the correct name)
      if (!m && userFullName) {
        m = rc.members.find((m) => String(m.name || '').trim().toLowerCase() === userFullName);
      }
      if (!m) return null;
      return {
        id: rc.id,
        label: rc.label,
        raceDistanceMiles: rc.raceDistanceMiles,
        count: m.count,
        autoCount: m.autoCount,
        seedCount: m.seedCount,
        linked: m.linked,
        earnedTier: m.earnedTier,
        nextTier: m.nextTier,
        tiers: rc.tiers
      };
    })
    .filter(Boolean);

  // 2. Club records currently held by this user
  let allRecords = [];
  try {
    const [recRows] = await pool.execute(
      `SELECT records_json FROM summit_stats_club_records WHERE agency_id = ? LIMIT 1`,
      [clubId]
    );
    allRecords = normalizeClubRecords(parseClubRecords(recRows?.[0]?.records_json));
  } catch { /* non-fatal */ }

  // Resolve icon URLs for records that have an iconId
  const iconIds = [...new Set(allRecords.filter((r) => r.iconId).map((r) => r.iconId))];
  const iconUrlById = new Map();
  if (iconIds.length) {
    try {
      const { default: Icon } = await import('../models/Icon.model.js');
      const ph = iconIds.map(() => '?').join(', ');
      const [iconRows] = await pool.execute(`SELECT id, file_path FROM icons WHERE id IN (${ph})`, iconIds);
      for (const icon of iconRows || []) iconUrlById.set(Number(icon.id), Icon.getIconUrl(icon));
    } catch { /* non-fatal */ }
  }

  const recordsHeld = allRecords
    .filter((r) => {
      // Skip gendered records that don't match the member's gender
      if (r.gender && userGender && r.gender.trim().toLowerCase() !== userGender) return false;
      if (r.gender && !userGender) return false;

      if (r.holderUserId && Number(r.holderUserId) === Number(userId)) return true;
      // Fallback: match by holderName when the record was not yet linked to a user
      if (!r.holderUserId && r.holderName && userFullName) {
        return String(r.holderName).trim().toLowerCase() === userFullName;
      }
      return false;
    })
    .map((r) => ({ ...r, iconUrl: r.iconId ? (iconUrlById.get(r.iconId) || null) : null }));

  // 3. Personal Records — mirror the club record metrics, computed for this user
  // Skip team-wide and club-wide aggregate metrics; those aren't personal bests.
  const personalMetricKeys = new Set([
    'distance_miles', 'duration_minutes', 'points',
    'weekly_distance_miles', 'monthly_distance_miles', 'season_distance_miles',
    'season_month1_distance_miles', 'season_month2_distance_miles',
    'rolling_4week_distance_miles', 'calendar_month_distance_miles',
    'elevation_gain_meters',
    'season_duration_minutes', 'race_chip_time_seconds'
  ]);

  // Build a de-duped list of personal-metric club records (by metricKey + filters).
  // Skip records with a gender restriction that doesn't match the member's gender
  // (e.g. "Most Miles Season Male" should never appear in a female member's PR list).
  const prTemplates = allRecords.filter((r) => {
    if (!r.metricKey || !personalMetricKeys.has(r.metricKey)) return false;
    if (r.gender && userGender && r.gender.trim().toLowerCase() !== userGender) return false;
    if (r.gender && !userGender) return false; // gender-specific record, but we don't know member gender — skip
    return true;
  });

  const personalRecords = [];
  for (const tpl of prTemplates) {
    try {
      // Build activity_type / terrain WHERE clauses
      const actFilter = tpl.activityType ? `AND LOWER(COALESCE(w.activity_type,'')) LIKE ?` : '';
      const terrainFilter = tpl.terrain ? `AND LOWER(COALESCE(w.terrain,'')) = ?` : '';
      const actParam = tpl.activityType ? [`%${tpl.activityType.toLowerCase()}%`] : [];
      const terrainParam = tpl.terrain ? [tpl.terrain.toLowerCase()] : [];
      const baseWhere = `c.organization_id = ? AND w.user_id = ?
        AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
        ${actFilter} ${terrainFilter}`;
      const baseParams = [clubId, userId, ...actParam, ...terrainParam];

      let prValue = null;
      let prContext = null; // e.g. week/month label

      if (tpl.metricKey === 'distance_miles') {
        const [rows] = await pool.execute(
          `SELECT MAX(w.distance_value) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}`,
          baseParams
        );
        prValue = rows?.[0]?.val != null ? Math.round(Number(rows[0].val) * 100) / 100 : null;

      } else if (tpl.metricKey === 'duration_minutes') {
        const [rows] = await pool.execute(
          `SELECT MAX(w.duration_minutes) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}`,
          baseParams
        );
        prValue = rows?.[0]?.val != null ? Math.round(Number(rows[0].val)) : null;

      } else if (tpl.metricKey === 'points') {
        const [rows] = await pool.execute(
          `SELECT MAX(w.points) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}`,
          baseParams
        );
        prValue = rows?.[0]?.val != null ? Math.round(Number(rows[0].val)) : null;

      } else if (tpl.metricKey === 'weekly_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT SUM(w.distance_value) AS val,
                  YEAR(w.completed_at) AS yr, WEEK(w.completed_at, 1) AS wk
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere} AND w.completed_at IS NOT NULL
           GROUP BY yr, wk
           ORDER BY val DESC
           LIMIT 1`,
          baseParams
        );
        if (rows?.[0]?.val != null) {
          prValue = Math.round(Number(rows[0].val) * 100) / 100;
          prContext = `Week ${rows[0].wk}, ${rows[0].yr}`;
        }

      } else if (tpl.metricKey === 'monthly_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT SUM(w.distance_value) AS val,
                  YEAR(w.completed_at) AS yr, MONTH(w.completed_at) AS mo
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere} AND w.completed_at IS NOT NULL
           GROUP BY yr, mo
           ORDER BY val DESC
           LIMIT 1`,
          baseParams
        );
        if (rows?.[0]?.val != null) {
          const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          prValue = Math.round(Number(rows[0].val) * 100) / 100;
          prContext = `${MONTHS[rows[0].mo] || ''} ${rows[0].yr}`;
        }

      } else if (tpl.metricKey === 'season_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT SUM(w.distance_value) AS val, c.class_name
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}
           GROUP BY w.learning_class_id, c.class_name
           ORDER BY val DESC
           LIMIT 1`,
          baseParams
        );
        if (rows?.[0]?.val != null) {
          prValue = Math.round(Number(rows[0].val) * 100) / 100;
          prContext = rows[0].class_name || null;
        }

      } else if (tpl.metricKey === 'season_duration_minutes') {
        const [rows] = await pool.execute(
          `SELECT SUM(w.duration_minutes) AS val, c.class_name
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}
           GROUP BY w.learning_class_id, c.class_name
           ORDER BY val DESC
           LIMIT 1`,
          baseParams
        );
        if (rows?.[0]?.val != null) {
          prValue = Math.round(Number(rows[0].val));
          prContext = rows[0].class_name || null;
        }

      } else if (tpl.metricKey === 'race_chip_time_seconds') {
        const distFilter = tpl.raceDistance
          ? `AND ABS(w.race_distance_miles - ${Number(tpl.raceDistance)}) <= ${Number(tpl.raceDistance) * 0.10}`
          : '';
        const [rows] = await pool.execute(
          `SELECT MIN(w.race_chip_time_seconds) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE ${baseWhere}
             AND w.is_race = 1
             AND w.race_chip_time_seconds IS NOT NULL
             AND w.race_chip_time_seconds > 0
             ${distFilter}`,
          baseParams
        );
        prValue = rows?.[0]?.val != null ? Math.round(Number(rows[0].val)) : null;
      }

      if (prValue == null) continue;

      // Only show this in the trophy case if the member actually holds the club record.
      // We don't want to show "Most Miles Single Run - Road: 3 mi" just because they ran
      // 3 miles on a road once — that's not their trophy, it's just a stat.
      const isClubRecord = recordsHeld.some((r) => r.id === tpl.id);
      if (!isClubRecord) continue;

      personalRecords.push({
        id: tpl.id,
        label: tpl.label,
        value: prValue,
        unit: tpl.unit,
        metricKey: tpl.metricKey,
        lowerIsBetter: tpl.lowerIsBetter,
        iconId: tpl.iconId,
        iconUrl: tpl.iconId ? (iconUrlById.get(tpl.iconId) || null) : null,
        context: prContext,
        isClubRecord: true
      });
    } catch { /* skip this metric on error */ }
  }

  // 4. Season recognition awards from the grant ledger — grouped by award type
  let seasonAwards = [];
  try {
    const { getMemberRecognitionSummary } = await import('./seasonRecognitionStandings.controller.js');
    // Fetch all seasons this club has run
    const [seasonRows] = await pool.execute(
      `SELECT id FROM learning_program_classes WHERE organization_id = ? AND status != 'draft'`,
      [clubId]
    );
    const seasonIds = (seasonRows || []).map(r => Number(r.id));
    for (const sid of seasonIds) {
      const awards = await getMemberRecognitionSummary({ classId: sid, userId });
      seasonAwards.push(...awards);
    }
    // Collapse duplicate category_ids across seasons (same award won in multiple seasons)
    const awardMap = new Map();
    for (const a of seasonAwards) {
      const key = a.categoryId;
      if (!awardMap.has(key)) {
        awardMap.set(key, { ...a });
      } else {
        const existing = awardMap.get(key);
        existing.count += a.count;
        existing.weekNumbers.push(...a.weekNumbers);
        existing.grants.push(...a.grants);
      }
    }
    seasonAwards = [...awardMap.values()];
  } catch (e) {
    // Non-fatal — trophy case still works without recognition awards
    console.warn('[getMemberTrophyCaseData] failed to load season awards:', e?.message);
    seasonAwards = [];
  }

  // 5. Individual challenge completions (mode != 'full_team', tagged workouts)
  let completedChallenges = [];
  try {
    const [challengeRows] = await pool.execute(
      `SELECT w.id AS workout_id, w.completed_at, w.distance_value,
              t.id AS task_id, t.name AS task_name, t.icon AS task_icon,
              c.id AS class_id, c.class_name,
              c.organization_id AS club_id, a.name AS club_name
       FROM challenge_workouts w
       INNER JOIN challenge_weekly_tasks t
         ON t.id = w.weekly_task_id AND t.mode != 'full_team'
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN agencies a ON a.id = c.organization_id
       WHERE w.user_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND w.weekly_task_id IS NOT NULL`,
      [userId]
    );

    const buckets = new Map();
    for (const r of challengeRows || []) {
      const key = `${String(r.task_name || '').toLowerCase().trim()}__${String(r.task_icon || '')}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          taskId: r.task_id,
          label: r.task_name,
          icon: r.task_icon || null,
          count: 0,
          latestCompletedAt: null,
          completions: []
        });
      }
      const bucket = buckets.get(key);
      bucket.count += 1;
      if (r.completed_at && (!bucket.latestCompletedAt || new Date(r.completed_at) > new Date(bucket.latestCompletedAt))) {
        bucket.latestCompletedAt = r.completed_at;
      }
      bucket.completions.push({
        workoutId: Number(r.workout_id),
        classId: Number(r.class_id),
        seasonName: r.class_name || null,
        clubId: Number(r.club_id),
        clubName: r.club_name || '',
        distanceMiles: r.distance_value != null ? Number(r.distance_value) : null,
        completedAt: r.completed_at || null
      });
    }
    completedChallenges = Array.from(buckets.values())
      .sort((a, b) => (new Date(b.latestCompletedAt || 0)) - (new Date(a.latestCompletedAt || 0)));
  } catch { /* non-fatal */ }

  return { raceClubs, recordsHeld, personalRecords, seasonAwards, completedChallenges };
};

/**
 * GET /api/summit-stats/clubs/:id/members/:userId/trophy-case
 * Returns the trophy case for any club member (requires club membership to view).
 */
export const getClubMemberTrophyCase = async (req, res, next) => {
  try {
    const { resolveClubByPublicRef } = await import('./challengeMemberApplications.controller.js');

    const clubRef = String(req.params.id || '').trim();
    const targetUserId = parseInt(req.params.userId, 10);
    let club = null;
    try { club = await resolveClubByPublicRef(clubRef); } catch { /* DB blip — fall through to numeric fallback */ }
    // If lookup failed but ref is a plain numeric ID, use it directly
    const clubId = club ? Number(club.id) : (parseInt(clubRef, 10) || 0);
    if (!clubId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid club or user' } });

    // Viewer must be authenticated
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });

    // Check club membership — if the DB is flaky, fall back to checking if they're a manager via JWT role
    let membershipOk = false;
    try {
      const { getUserClubMembership } = await import('../utils/sscClubAccess.js');
      const membership = await getUserClubMembership(req.user.id, clubId);
      membershipOk = !!(membership && membership.is_active !== false);
    } catch {
      // DB unavailable: trust manager/super_admin JWT role as fallback
      const role = String(req.user?.role || '');
      membershipOk = role === 'super_admin' || role.startsWith('club_');
    }
    if (!membershipOk) return res.status(403).json({ error: { message: 'Club membership required' } });

    // getMemberTrophyCaseData is internally fault-tolerant; wrap as extra safety net
    let data = { raceClubs: [], recordsHeld: [], personalRecords: [], seasonAwards: [], completedChallenges: [] };
    try {
      data = await getMemberTrophyCaseData({ clubId, userId: targetUserId });
    } catch (e) {
      console.warn('[getClubMemberTrophyCase] getMemberTrophyCaseData failed, returning empty:', e?.message);
    }

    return res.json({ userId: targetUserId, agencyId: clubId, ...data });
  } catch (error) { next(error); }
};

/**
 * GET /api/summit-stats/clubs/:id/my-trophy-case
 * Returns the authenticated member's own trophy case.
 */
export const getMyTrophyCase = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    const { resolveClubByPublicRef } = await import('./challengeMemberApplications.controller.js');
    const clubRef = String(req.params.id || '').trim();
    let club = null;
    try { club = await resolveClubByPublicRef(clubRef); } catch { /* DB blip — fall through to numeric fallback */ }
    const clubId = club ? Number(club.id) : (parseInt(clubRef, 10) || 0);
    if (!clubId) return res.status(400).json({ error: { message: 'clubId required' } });

    let membershipOk = false;
    try {
      const { getUserClubMembership } = await import('../utils/sscClubAccess.js');
      const membership = await getUserClubMembership(req.user.id, clubId);
      membershipOk = !!(membership && membership.is_active !== false);
    } catch {
      const role = String(req.user?.role || '');
      membershipOk = role === 'super_admin' || role.startsWith('club_');
    }
    if (!membershipOk) return res.status(403).json({ error: { message: 'Club membership required' } });

    let data = { raceClubs: [], recordsHeld: [], personalRecords: [], seasonAwards: [], completedChallenges: [] };
    try {
      data = await getMemberTrophyCaseData({ clubId, userId: req.user.id });
    } catch (e) {
      console.warn('[getMyTrophyCase] getMemberTrophyCaseData failed, returning empty:', e?.message);
    }

    return res.json({ userId: req.user.id, agencyId: clubId, ...data });
  } catch (error) { next(error); }
};

export const listClubRecordVerifications = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const [rows] = await pool.execute(
      `SELECT
         v.id,
         v.record_id,
         v.record_label,
         v.metric_key,
         v.current_value,
         v.candidate_value,
         v.status,
         v.created_at,
         v.reviewed_at,
         v.review_note,
         v.workout_id,
         v.challenger_user_id,
         u.first_name,
         u.last_name
       FROM summit_stats_club_record_verifications v
       LEFT JOIN users u ON u.id = v.challenger_user_id
       WHERE v.agency_id = ?
       ORDER BY CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END, v.created_at DESC
       LIMIT 100`,
      [clubId]
    );
    return res.json({ verifications: rows || [] });
  } catch (error) {
    next(error);
  }
};

export const reviewClubRecordVerification = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    const verificationId = parseInt(req.params.verificationId, 10);
    const access = await ensureClubAdminAccess({ user: req.user, clubId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!Number.isFinite(verificationId) || verificationId < 1) {
      return res.status(400).json({ error: { message: 'Invalid verification ID' } });
    }
    const status = String(req.body?.status || '').toLowerCase();
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: { message: 'status must be approved or rejected' } });
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM summit_stats_club_record_verifications
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [verificationId, clubId]
    );
    const verification = rows?.[0];
    if (!verification) return res.status(404).json({ error: { message: 'Verification request not found' } });
    if (String(verification.status) !== 'pending') {
      return res.status(400).json({ error: { message: 'Verification request already reviewed' } });
    }
    await pool.execute(
      `UPDATE summit_stats_club_record_verifications
       SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW(), review_note = ?
       WHERE id = ?`,
      [status, req.user.id, req.body?.reviewNote ? String(req.body.reviewNote) : null, verificationId]
    );

    if (status === 'approved') {
      const [proofRows] = await pool.execute(
        `SELECT
           w.completed_at,
           w.user_id,
           w.team_id,
           t.team_name,
           u.first_name,
           u.last_name
         FROM challenge_workouts w
         LEFT JOIN challenge_teams t ON t.id = w.team_id
         LEFT JOIN users u ON u.id = w.user_id
         WHERE w.id = ?
         LIMIT 1`,
        [verification.workout_id]
      );
      const approvedWorkout = proofRows?.[0] || null;
      const holderName = [approvedWorkout?.first_name, approvedWorkout?.last_name]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      const completedAt = approvedWorkout?.completed_at ? new Date(approvedWorkout.completed_at) : null;
      const holderYear = completedAt && Number.isFinite(completedAt.getTime()) ? completedAt.getFullYear() : null;
      const holderTeam = String(approvedWorkout?.team_name || '').trim();
      const holderUserId = approvedWorkout?.user_id ? Number(approvedWorkout.user_id) : null;
      const [recRows] = await pool.execute(
        `SELECT records_json
         FROM summit_stats_club_records
         WHERE agency_id = ?
         LIMIT 1`,
        [clubId]
      );
      const records = normalizeClubRecords(parseClubRecords(recRows?.[0]?.records_json));
      const nextRecords = records.map((r) => {
        if (String(r.id) !== String(verification.record_id)) return r;
        return {
          ...r,
          value: Number(verification.candidate_value),
          holderName: holderName || r.holderName || '',
          holderYear: holderYear || r.holderYear || null,
          holderTeam: holderTeam || r.holderTeam || '',
          holderUserId: holderUserId || r.holderUserId || null,
          updatedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
          lastVerifiedWorkoutId: Number(verification.workout_id),
          lastVerifiedByUserId: Number(req.user.id)
        };
      });
      await pool.execute(
        `UPDATE summit_stats_club_records
         SET records_json = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?`,
        [JSON.stringify(nextRecords), req.user.id, clubId]
      );
    }
    return res.json({ ok: true, status });
  } catch (error) {
    next(error);
  }
};

/**
 * Full recompute of all auto-fill records for a club.
 * Runs the appropriate SQL for each autoFill record, finds the current best,
 * and updates ONLY if the computed value beats the existing stored value.
 * Records with no qualifying workouts are left untouched.
 */
export const recomputeAutoFillRecords = async ({ clubId }) => {
  const cId = Number(clubId);
  if (!Number.isFinite(cId) || cId < 1) return;
  const [recordRows] = await pool.execute(
    `SELECT records_json FROM summit_stats_club_records WHERE agency_id = ? LIMIT 1`,
    [cId]
  );
  const records = normalizeClubRecords(parseClubRecords(recordRows?.[0]?.records_json));
  const autoFillRecords = records.filter((r) => r.autoFill && r.metricKey);
  if (!autoFillRecords.length) return;

  const baseWhere = (r) => {
    const parts = [
      `(w.is_disqualified IS NULL OR w.is_disqualified = 0)`,
      `(w.proof_status IN ('approved','none') OR w.proof_status IS NULL)`
    ];
    if (r.activityType) parts.push(`LOWER(COALESCE(w.activity_type,'')) LIKE ?`);
    if (r.terrain) parts.push(`LOWER(COALESCE(w.terrain,'')) = ?`);
    return parts.join(' AND ');
  };
  const baseParams = (r) => {
    const p = [];
    if (r.activityType) p.push(`%${r.activityType.toLowerCase()}%`);
    if (r.terrain) p.push(r.terrain.toLowerCase());
    return p;
  };

  const now = new Date().toISOString();
  let changed = false;

  for (const record of autoFillRecords) {
    const mk = record.metricKey;
    let bestRow = null;
    try {
      const wp = baseWhere(record);
      const bp = baseParams(record);

      if (mk === 'distance_miles') {
        const [rows] = await pool.execute(
          `SELECT w.user_id, u.first_name, u.last_name, MAX(w.distance_value) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           INNER JOIN users u ON u.id = w.user_id
           WHERE c.organization_id = ? AND ${wp}
           GROUP BY w.user_id, u.first_name, u.last_name
           ORDER BY val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'elevation_gain_meters') {
        const [rows] = await pool.execute(
          `SELECT w.user_id, u.first_name, u.last_name, MAX(w.elevation_gain_meters) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           INNER JOIN users u ON u.id = w.user_id
           WHERE c.organization_id = ? AND w.elevation_gain_meters IS NOT NULL AND w.elevation_gain_meters > 0 AND ${wp}
           GROUP BY w.user_id, u.first_name, u.last_name
           ORDER BY val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'weekly_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, t.val FROM (
             SELECT w.user_id,
               YEARWEEK(w.completed_at, 1) AS yw,
               SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND ${wp}
             GROUP BY w.user_id, YEARWEEK(w.completed_at, 1)
           ) t INNER JOIN users u ON u.id = t.user_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'monthly_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, t.val FROM (
             SELECT w.user_id,
               DATE_FORMAT(w.completed_at, '%Y-%m') AS ym,
               SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND ${wp}
             GROUP BY w.user_id, DATE_FORMAT(w.completed_at, '%Y-%m')
           ) t INNER JOIN users u ON u.id = t.user_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'season_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, t.val FROM (
             SELECT w.user_id, w.learning_class_id, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND ${wp}
             GROUP BY w.user_id, w.learning_class_id
           ) t INNER JOIN users u ON u.id = t.user_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'season_month1_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, t.val FROM (
             SELECT w.user_id, w.learning_class_id, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ?
               AND c.starts_at IS NOT NULL
               AND w.completed_at >= c.starts_at
               AND w.completed_at < DATE_ADD(c.starts_at, INTERVAL 28 DAY)
               AND ${wp}
             GROUP BY w.user_id, w.learning_class_id
           ) t INNER JOIN users u ON u.id = t.user_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'season_month2_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, t.val FROM (
             SELECT w.user_id, w.learning_class_id, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ?
               AND c.starts_at IS NOT NULL
               AND w.completed_at >= DATE_ADD(c.starts_at, INTERVAL 28 DAY)
               AND w.completed_at < DATE_ADD(c.starts_at, INTERVAL 56 DAY)
               AND ${wp}
             GROUP BY w.user_id, w.learning_class_id
           ) t INNER JOIN users u ON u.id = t.user_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'rolling_4week_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.user_id, u.first_name, u.last_name, MAX(t.val) AS val FROM (
             SELECT w.user_id, w.completed_at,
               (SELECT COALESCE(SUM(w2.distance_value),0)
                FROM challenge_workouts w2
                INNER JOIN learning_program_classes c2 ON c2.id = w2.learning_class_id
                WHERE w2.user_id = w.user_id
                  AND c2.organization_id = ?
                  AND w2.completed_at >= DATE_SUB(w.completed_at, INTERVAL 27 DAY)
                  AND w2.completed_at <= w.completed_at
                  AND (w2.is_disqualified IS NULL OR w2.is_disqualified = 0)
                  AND (w2.proof_status IN ('approved','none') OR w2.proof_status IS NULL)
               ) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND ${wp}
           ) t INNER JOIN users u ON u.id = t.user_id
           GROUP BY t.user_id, u.first_name, u.last_name
           ORDER BY val DESC LIMIT 1`,
          [cId, cId, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'calendar_month_distance_miles' && record.calendarMonth) {
        const [yyyy, mm] = record.calendarMonth.split('-').map(Number);
        const [rows] = await pool.execute(
          `SELECT w.user_id, u.first_name, u.last_name, SUM(w.distance_value) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           INNER JOIN users u ON u.id = w.user_id
           WHERE c.organization_id = ?
             AND YEAR(w.completed_at) = ? AND MONTH(w.completed_at) = ?
             AND ${wp}
           GROUP BY w.user_id, u.first_name, u.last_name
           ORDER BY val DESC LIMIT 1`,
          [cId, yyyy, mm, ...bp]
        );
        bestRow = rows?.[0] || null;

      } else if (mk === 'team_weekly_distance_miles') {
        // Best single-week total by any team across all seasons
        const [rows] = await pool.execute(
          `SELECT t.team_id, ct.team_name AS first_name, NULL AS last_name, t.val FROM (
             SELECT w.team_id, YEARWEEK(w.completed_at, 1) AS yw, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND w.team_id IS NOT NULL AND ${wp}
             GROUP BY w.team_id, YEARWEEK(w.completed_at, 1)
           ) t INNER JOIN challenge_teams ct ON ct.id = t.team_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] ? { ...rows[0], user_id: null, is_team: true } : null;

      } else if (mk === 'team_monthly_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.team_id, ct.team_name AS first_name, NULL AS last_name, t.val FROM (
             SELECT w.team_id, DATE_FORMAT(w.completed_at, '%Y-%m') AS ym, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND w.team_id IS NOT NULL AND ${wp}
             GROUP BY w.team_id, DATE_FORMAT(w.completed_at, '%Y-%m')
           ) t INNER JOIN challenge_teams ct ON ct.id = t.team_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] ? { ...rows[0], user_id: null, is_team: true } : null;

      } else if (mk === 'team_season_distance_miles') {
        const [rows] = await pool.execute(
          `SELECT t.team_id, ct.team_name AS first_name, NULL AS last_name, t.val FROM (
             SELECT w.team_id, w.learning_class_id, SUM(w.distance_value) AS val
             FROM challenge_workouts w
             INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
             WHERE c.organization_id = ? AND w.team_id IS NOT NULL AND ${wp}
             GROUP BY w.team_id, w.learning_class_id
           ) t INNER JOIN challenge_teams ct ON ct.id = t.team_id
           ORDER BY t.val DESC LIMIT 1`,
          [cId, ...bp]
        );
        bestRow = rows?.[0] ? { ...rows[0], user_id: null, is_team: true } : null;

      } else if (mk === 'club_season_distance_miles' || mk === 'season_duration_minutes') {
        // Club-wide totals — no individual holder, just the aggregate value
        const col = mk === 'season_duration_minutes' ? 'duration_minutes' : 'distance_value';
        const [rows] = await pool.execute(
          `SELECT SUM(w.${col}) AS val
           FROM challenge_workouts w
           INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
           WHERE c.organization_id = ? AND ${wp}`,
          [cId, ...bp]
        );
        const total = rows?.[0]?.val != null ? Number(rows[0].val) : null;
        if (total != null && total > 0) {
          bestRow = { val: total, first_name: '', last_name: '', user_id: null, is_club: true };
        }
      }
    } catch { /* non-fatal */ }

    // Only update the record if the computed value BEATS the existing stored value.
    // If no workout data was found (bestRow == null), leave the record untouched.
    const idx = records.indexOf(record);
    if (idx === -1) continue;
    const newVal = bestRow?.val != null ? Number(bestRow.val) : null;
    if (newVal == null || newVal <= 0) continue; // no qualifying data — leave as-is

    const currentVal = record.value != null ? Number(record.value) : null;
    const isBetter = currentVal == null || (record.lowerIsBetter ? newVal < currentVal : newVal > currentVal);
    if (!isBetter) continue; // existing value is equal or better — don't overwrite

    const holderName = bestRow.is_team || bestRow.is_club
      ? String(bestRow.first_name || '').trim() // team name stored in first_name
      : [bestRow.first_name, bestRow.last_name].filter(Boolean).join(' ');
    const holderUserId = bestRow.user_id ? Number(bestRow.user_id) : null;

    records[idx] = {
      ...record,
      value: Math.round(newVal * 1000) / 1000,
      holderName,
      holderUserId,
      holderYear: bestRow.is_club ? null : new Date().getFullYear(),
      updatedAt: now
    };
    changed = true;
  }

  if (changed) {
    await pool.execute(
      `INSERT INTO summit_stats_club_records (agency_id, records_json, updated_by_user_id)
       VALUES (?, ?, NULL)
       ON DUPLICATE KEY UPDATE records_json = VALUES(records_json), updated_at = CURRENT_TIMESTAMP`,
      [cId, JSON.stringify(records)]
    );
  }
};

export const queueClubRecordBreakCandidates = async ({ learningClassId, workoutId, userId }) => {
  const classId = Number(learningClassId);
  const wId = Number(workoutId);
  const uId = Number(userId);
  if (!Number.isFinite(classId) || !Number.isFinite(wId) || !Number.isFinite(uId)) return;
  const [classRows] = await pool.execute(
    `SELECT id, organization_id FROM learning_program_classes WHERE id = ? LIMIT 1`,
    [classId]
  );
  const klass = classRows?.[0];
  if (!klass?.organization_id) return;
  const agencyId = Number(klass.organization_id);
  const [recordRows] = await pool.execute(
    `SELECT records_json FROM summit_stats_club_records WHERE agency_id = ? LIMIT 1`,
    [agencyId]
  );
  const records = normalizeClubRecords(parseClubRecords(recordRows?.[0]?.records_json));
  if (!records.length) return;

  // Fetch the triggering workout with all relevant columns
  let workout;
  try {
    const [rows] = await pool.execute(
      `SELECT id, learning_class_id, team_id, user_id, points, distance_value, duration_minutes,
              activity_type, terrain, is_race, race_distance_miles, race_chip_time_seconds,
              completed_at, elevation_gain_meters
       FROM challenge_workouts
       WHERE id = ? AND learning_class_id = ? AND user_id = ?
       LIMIT 1`,
      [wId, classId, uId]
    );
    workout = rows?.[0];
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await pool.execute(
        `SELECT id, learning_class_id, team_id, user_id, points, distance_value, duration_minutes, completed_at
         FROM challenge_workouts
         WHERE id = ? AND learning_class_id = ? AND user_id = ?
         LIMIT 1`,
        [wId, classId, uId]
      );
      workout = rows?.[0];
    } else { throw e; }
  }
  if (!workout) return;

  const workoutActivityType = String(workout.activity_type || '').trim().toLowerCase();
  const workoutTerrain = String(workout.terrain || '').trim().toLowerCase();
  const completedAt = workout.completed_at ? new Date(workout.completed_at) : new Date();

  // Fetch the submitting user's gender (from application or participant profile for this season)
  let userGender = null;
  try {
    const [gRows] = await pool.execute(
      `SELECT COALESCE(
         (SELECT gender FROM challenge_member_applications
          WHERE learning_class_id = ? AND user_id = ? AND gender IS NOT NULL AND gender != ''
          ORDER BY id DESC LIMIT 1),
         (SELECT gender FROM challenge_participant_profiles
          WHERE learning_class_id = ? AND provider_user_id = ? AND gender IS NOT NULL AND gender != ''
          ORDER BY updated_at DESC LIMIT 1)
       ) AS gender`,
      [classId, uId, classId, uId]
    );
    userGender = String(gRows?.[0]?.gender || '').trim().toLowerCase() || null;
  } catch { /* gender filter will be skipped if lookup fails */ }

  // Helper: get aggregated candidate value for period-based or club-wide metrics
  const getAggregatedValue = async (metricKey) => {
    if (metricKey === 'weekly_distance_miles') {
      // Sum of this user's miles in the same Mon–Sun week as this workout
      const dayOfWeek = completedAt.getDay(); // 0=Sun
      const diffToMon = (dayOfWeek + 6) % 7;
      const weekStart = new Date(completedAt);
      weekStart.setDate(weekStart.getDate() - diffToMon);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, weekStart, weekEnd]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'monthly_distance_miles') {
      // Sum of this user's miles in the same calendar month
      const monthStart = new Date(completedAt.getFullYear(), completedAt.getMonth(), 1);
      const monthEnd = new Date(completedAt.getFullYear(), completedAt.getMonth() + 1, 1);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, monthStart, monthEnd]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'season_distance_miles') {
      // Per-person total miles for the entire season
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'season_duration_minutes') {
      // Club-wide total: sum of all members' duration for the entire season
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(duration_minutes), 0) AS total
         FROM challenge_workouts
         WHERE learning_class_id = ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [classId]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'club_season_distance_miles') {
      // Club-wide total miles for the entire season (all teams combined)
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE learning_class_id = ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [classId]
      );
      return Number(rows?.[0]?.total || 0);
    }
    // Team-scoped metrics — requires the workout to belong to a team
    const teamId = Number(workout.team_id);
    if (!teamId) return null;
    if (metricKey === 'team_weekly_distance_miles') {
      const dayOfWeek = completedAt.getDay();
      const diffToMon = (dayOfWeek + 6) % 7;
      const weekStart = new Date(completedAt);
      weekStart.setDate(weekStart.getDate() - diffToMon);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE team_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [teamId, classId, weekStart, weekEnd]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'team_monthly_distance_miles') {
      const monthStart = new Date(completedAt.getFullYear(), completedAt.getMonth(), 1);
      const monthEnd = new Date(completedAt.getFullYear(), completedAt.getMonth() + 1, 1);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE team_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [teamId, classId, monthStart, monthEnd]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'team_season_distance_miles') {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE team_id = ? AND learning_class_id = ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [teamId, classId]
      );
      return Number(rows?.[0]?.total || 0);
    }
    // ── New metric keys ──────────────────────────────────────────────
    if (metricKey === 'season_month1_distance_miles') {
      // User's miles in the first 28 days of the current season
      const [classInfoRows] = await pool.execute(
        `SELECT starts_at FROM learning_program_classes WHERE id = ? LIMIT 1`, [classId]
      );
      const seasonStart = classInfoRows?.[0]?.starts_at;
      if (!seasonStart) return null;
      const month1End = new Date(seasonStart);
      month1End.setDate(month1End.getDate() + 28);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, seasonStart, month1End]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'season_month2_distance_miles') {
      const [classInfoRows] = await pool.execute(
        `SELECT starts_at FROM learning_program_classes WHERE id = ? LIMIT 1`, [classId]
      );
      const seasonStart = classInfoRows?.[0]?.starts_at;
      if (!seasonStart) return null;
      const month2Start = new Date(seasonStart);
      month2Start.setDate(month2Start.getDate() + 28);
      const month2End = new Date(seasonStart);
      month2End.setDate(month2End.getDate() + 56);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, month2Start, month2End]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'rolling_4week_distance_miles') {
      // User's total miles in the 28-day window ending on this workout's date
      const windowStart = new Date(completedAt);
      windowStart.setDate(windowStart.getDate() - 27);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at <= ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, windowStart, completedAt]
      );
      return Number(rows?.[0]?.total || 0);
    }
    if (metricKey === 'calendar_month_distance_miles') {
      // User's total for the specific calendar month set on the record (calendarMonth = "YYYY-MM")
      if (!record.calendarMonth) return null;
      const [yyyy, mm] = record.calendarMonth.split('-').map(Number);
      const monthStart = new Date(yyyy, mm - 1, 1);
      const monthEnd = new Date(yyyy, mm, 1);
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(distance_value), 0) AS total
         FROM challenge_workouts
         WHERE user_id = ? AND learning_class_id = ?
           AND completed_at >= ? AND completed_at < ?
           AND (proof_status IN ('approved','none') OR proof_status IS NULL)
           AND (is_disqualified IS NULL OR is_disqualified = 0)`,
        [uId, classId, monthStart, monthEnd]
      );
      return Number(rows?.[0]?.total || 0);
    }
    return null;
  };

  for (const record of records) {
    const metricKey = record.metricKey || null;
    if (!metricKey) continue;

    // Activity type filter
    if (record.activityType) {
      if (workoutActivityType !== String(record.activityType).trim().toLowerCase()) continue;
    }

    // Terrain filter
    if (record.terrain) {
      if (workoutTerrain !== String(record.terrain).trim().toLowerCase()) continue;
    }

    // Gender filter
    if (record.gender && userGender) {
      if (userGender !== String(record.gender).trim().toLowerCase()) continue;
    } else if (record.gender && !userGender) {
      // If record requires a gender but user's gender is unknown, skip to be safe
      continue;
    }

    let candidateValue;

    if (metricKey === 'race_chip_time_seconds') {
      // Must be tagged as a race
      if (!workout.is_race) continue;
      const chipTime = Number(workout.race_chip_time_seconds);
      if (!Number.isFinite(chipTime) || chipTime <= 0) continue;
      // If record specifies a race distance, the workout must match within ±10%
      if (record.raceDistance) {
        const wDist = Number(workout.race_distance_miles);
        if (!Number.isFinite(wDist) || wDist <= 0) continue;
        const tolerance = record.raceDistance * 0.10;
        if (Math.abs(wDist - record.raceDistance) > tolerance) continue;
      }
      candidateValue = chipTime;
    } else if (metricKey === 'elevation_gain_meters') {
      const elev = Number(workout.elevation_gain_meters);
      if (!Number.isFinite(elev) || elev <= 0) continue;
      candidateValue = elev;
    } else if ([
      'weekly_distance_miles', 'monthly_distance_miles', 'season_distance_miles', 'season_duration_minutes',
      'club_season_distance_miles',
      'team_weekly_distance_miles', 'team_monthly_distance_miles', 'team_season_distance_miles',
      'season_month1_distance_miles', 'season_month2_distance_miles',
      'rolling_4week_distance_miles', 'calendar_month_distance_miles'
    ].includes(metricKey)) {
      candidateValue = await getAggregatedValue(metricKey);
    } else {
      candidateValue = getMetricValueFromWorkout(metricKey, workout);
    }

    if (!Number.isFinite(candidateValue) || candidateValue <= 0) continue;

    // For auto-fill records: directly update the stored record without manager approval
    if (record.autoFill) {
      const currentValue = record.value != null ? Number(record.value) : null;
      const isBetter = currentValue == null || (record.lowerIsBetter
        ? candidateValue < currentValue
        : candidateValue > currentValue);
      if (!isBetter) continue;

      const isTeamMetric = ['team_weekly_distance_miles', 'team_monthly_distance_miles', 'team_season_distance_miles'].includes(metricKey);
      const isClubMetric = ['club_season_distance_miles', 'season_duration_minutes'].includes(metricKey);

      let holderName = '';
      let holderUserId = null;
      if (isTeamMetric) {
        // Holder is the team, not the individual member
        const teamId = Number(workout.team_id);
        if (teamId) {
          const [tRows] = await pool.execute(`SELECT team_name FROM challenge_teams WHERE id = ? LIMIT 1`, [teamId]);
          holderName = tRows?.[0]?.team_name || '';
        }
      } else if (!isClubMetric) {
        const [uRows] = await pool.execute(`SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`, [uId]);
        const uRow = uRows?.[0];
        holderName = uRow ? [uRow.first_name, uRow.last_name].filter(Boolean).join(' ') : '';
        holderUserId = uId;
      }

      const updatedRecords = records.map((r) =>
        r.id === record.id
          ? { ...r, value: Math.round(candidateValue * 1000) / 1000, holderName, holderUserId, holderYear: isClubMetric ? null : new Date().getFullYear(), updatedAt: new Date().toISOString() }
          : r
      );
      await pool.execute(
        `INSERT INTO summit_stats_club_records (agency_id, records_json, updated_by_user_id)
         VALUES (?, ?, NULL)
         ON DUPLICATE KEY UPDATE records_json = VALUES(records_json), updated_at = CURRENT_TIMESTAMP`,
        [agencyId, JSON.stringify(updatedRecords)]
      );
      continue;
    }

    const currentValue = Number(record.value);
    if (!Number.isFinite(currentValue)) continue;

    // For lower-is-better records (e.g. fastest race), candidate must be strictly lower
    const isBetter = record.lowerIsBetter
      ? candidateValue < currentValue
      : candidateValue > currentValue;
    if (!isBetter) continue;

    const [existingPending] = await pool.execute(
      `SELECT id FROM summit_stats_club_record_verifications
       WHERE agency_id = ? AND record_id = ? AND workout_id = ? AND status = 'pending'
       LIMIT 1`,
      [agencyId, String(record.id), wId]
    );
    if (existingPending?.length) continue;
    await pool.execute(
      `INSERT INTO summit_stats_club_record_verifications
       (agency_id, record_id, record_label, metric_key, current_value, candidate_value, workout_id, challenger_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [agencyId, String(record.id), String(record.label || ''), metricKey, currentValue, candidateValue, wId, uId]
    );
  }
};

export const getClubMemberStats = async (req, res, next) => {
  try {
    const { default: pool } = await import('../config/database.js');
    const { canUserManageClub } = await import('../utils/sscClubAccess.js');
    const clubId = Number(req.params.clubId || 0);
    if (!clubId) return res.status(400).json({ error: { message: 'clubId required' } });
    const ok = await canUserManageClub({ user: req.user, clubId });
    if (!ok) return res.status(403).json({ error: { message: 'Manager access required' } });

    // Total active club members
    const [totalRows] = await pool.execute(
      `SELECT COUNT(DISTINCT ua.user_id) AS total
       FROM user_agencies ua
       WHERE ua.agency_id = ? AND (ua.is_active IS NULL OR ua.is_active = 1)`,
      [clubId]
    );
    const total = Number(totalRows?.[0]?.total || 0);

    // Dormant: members who have NOT logged in within the last 30 days
    // Uses user_activity_logs action_type='login'; falls back to created_at if no log entry.
    const [dormantRows] = await pool.execute(
      `SELECT COUNT(DISTINCT ua.user_id) AS dormant
       FROM user_agencies ua
       WHERE ua.agency_id = ?
         AND (ua.is_active IS NULL OR ua.is_active = 1)
         AND ua.user_id NOT IN (
           SELECT DISTINCT user_id
           FROM user_activity_logs
           WHERE action_type = 'login'
             AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`,
      [clubId]
    );
    const dormant = Number(dormantRows?.[0]?.dormant || 0);
    const active = Math.max(0, total - dormant);

    return res.json({ total, active, dormant });
  } catch (e) {
    next(e);
  }
};

/**
 * Authorize: caller is super_admin OR a manager of `clubId`.
 * Returns the resolved club row, or sends a 4xx response and returns null.
 */
async function assertSuperAdminOrClubManager(req, res, clubId) {
  const user = req.user;
  if (!user?.id) {
    res.status(401).json({ error: { message: 'Sign in required' } });
    return null;
  }
  const id = parseInt(clubId, 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: { message: 'Invalid club id' } });
    return null;
  }
  const [rows] = await pool.execute(
    `SELECT id, name, slug, organization_type
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const club = rows?.[0];
  if (!club) {
    res.status(404).json({ error: { message: 'Club not found' } });
    return null;
  }
  if (String(club.organization_type || '').toLowerCase() !== 'affiliation') {
    res.status(400).json({ error: { message: 'That organization is not a club' } });
    return null;
  }
  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'super_admin') return club;
  const canManage = await canUserManageClub({ user, clubId: id });
  if (!canManage) {
    res.status(403).json({ error: { message: 'Club manager or super admin access required' } });
    return null;
  }
  return club;
}

/**
 * DELETE /summit-stats/clubs/:id/members/:userId
 * Remove a member from a club. Super admin OR club manager.
 */
export const removeClubMember = async (req, res, next) => {
  try {
    const club = await assertSuperAdminOrClubManager(req, res, req.params.id);
    if (!club) return;
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    const [existing] = await pool.execute(
      'SELECT club_role FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, club.id]
    );
    if (!existing?.length) {
      return res.status(404).json({ error: { message: 'Member not found in this club' } });
    }

    // Guard: do not let a non-super_admin manager remove the last remaining manager.
    const callerRole = String(req.user.role || '').trim().toLowerCase();
    if (callerRole !== 'super_admin' && existing[0].club_role === 'manager') {
      const [managerRows] = await pool.execute(
        `SELECT COUNT(*) AS c FROM user_agencies WHERE agency_id = ? AND club_role = 'manager'`,
        [club.id]
      );
      const managerCount = Number(managerRows?.[0]?.c || 0);
      if (managerCount <= 1) {
        return res.status(400).json({ error: { message: 'Cannot remove the last manager of the club' } });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE ctm
         FROM challenge_team_members ctm
         INNER JOIN challenge_teams t ON t.id = ctm.team_id
         INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
         WHERE c.organization_id = ? AND ctm.provider_user_id = ?`,
        [club.id, userId]
      );
      await conn.execute(
        `UPDATE challenge_teams t
         INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
         SET t.team_manager_user_id = NULL
         WHERE c.organization_id = ? AND t.team_manager_user_id = ?`,
        [club.id, userId]
      );
      await conn.execute(
        `DELETE pm
         FROM learning_class_provider_memberships pm
         INNER JOIN learning_program_classes c ON c.id = pm.learning_class_id
         WHERE c.organization_id = ? AND pm.provider_user_id = ?`,
        [club.id, userId]
      );
      await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [userId, club.id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    try {
      await AdminAuditLog.logAction({
        actionType: 'sstc_club_member_removed',
        actorUserId: req.user.id,
        targetUserId: userId,
        agencyId: club.id,
        metadata: null
      });
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }

    return res.json({ ok: true, clubId: club.id, userId });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /summit-stats/clubs/:id/members/:userId/role
 * Body: { clubRole: 'manager' | 'assistant_manager' | 'member' }
 * Super admin OR existing club manager.
 */
export const setClubMemberRole = async (req, res, next) => {
  try {
    const club = await assertSuperAdminOrClubManager(req, res, req.params.id);
    if (!club) return;
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }
    const requested = String(req.body?.clubRole || '').trim().toLowerCase();
    const allowed = ['manager', 'assistant_manager', 'member'];
    if (!allowed.includes(requested)) {
      return res.status(400).json({ error: { message: 'clubRole must be one of: manager, assistant_manager, member' } });
    }

    const [existing] = await pool.execute(
      'SELECT id, club_role FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, club.id]
    );
    if (!existing?.[0]?.id) {
      return res.status(404).json({ error: { message: 'Member not found in this club' } });
    }

    const callerRole = String(req.user.role || '').trim().toLowerCase();
    // Don't let a non-super_admin manager demote the last remaining manager.
    if (
      callerRole !== 'super_admin' &&
      existing[0].club_role === 'manager' &&
      requested !== 'manager'
    ) {
      const [managerRows] = await pool.execute(
        `SELECT COUNT(*) AS c FROM user_agencies WHERE agency_id = ? AND club_role = 'manager'`,
        [club.id]
      );
      const managerCount = Number(managerRows?.[0]?.c || 0);
      if (managerCount <= 1) {
        return res.status(400).json({ error: { message: 'Cannot demote the last manager of the club' } });
      }
    }

    await User.setAgencyClubRole(userId, club.id, requested);

    // If we're promoting to a manager-ish role and the user has a basic platform role,
    // bump them up so the dashboard shows manager affordances.
    if (requested === 'manager' || requested === 'assistant_manager') {
      try {
        const target = await User.findById(userId);
        const r = String(target?.role || '').trim().toLowerCase();
        if (!['super_admin', 'admin', 'support', 'club_manager'].includes(r)) {
          await User.update(userId, { role: 'club_manager' });
        }
      } catch (e) {
        console.warn('Promote-to-club_manager failed:', e?.message || e);
      }
    }

    try {
      await AdminAuditLog.logAction({
        actionType: 'sstc_club_member_role_changed',
        actorUserId: req.user.id,
        targetUserId: userId,
        agencyId: club.id,
        metadata: { from: existing[0].club_role || null, to: requested }
      });
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }

    return res.json({ ok: true, clubId: club.id, userId, clubRole: requested });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /summit-stats/admin/eligible-users
 * Super admin only.
 * Returns users who are already in the SSTC ecosystem — i.e. members of the
 * platform tenant, OR members of any club affiliated under the SSTC platform.
 * Each row includes the user's existing club affiliations + roles for context.
 *
 * Query params:
 *   q  – optional substring to filter by name/email (server-side)
 *   limit – cap (default 200)
 */
export const listSstcEligibleUsers = async (req, res, next) => {
  try {
    const callerRole = String(req.user?.role || '').trim().toLowerCase();
    if (callerRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const platformIds = await getPlatformAgencyIds(null);
    if (!platformIds.length) {
      return res.status(503).json({
        error: { message: `${SUMMIT_STATS_TEAM_CHALLENGE_NAME} is not configured.` }
      });
    }

    const q = String(req.query?.q || '').trim();
    const limit = Math.trunc(Math.min(500, Math.max(10, parseInt(req.query?.limit, 10) || 200)));

    const platformPh = platformIds.map(() => '?').join(', ');

    // SSTC-affiliated user ids:
    //   (a) Direct members of any platform tenant agency (sstc/ssc/summit-stats)
    //   (b) Members of any club affiliated under one of those platform tenants
    const idParams = [...platformIds, ...platformIds];
    const [idRows] = await pool.execute(
      `SELECT DISTINCT user_id FROM (
         SELECT ua.user_id
         FROM user_agencies ua
         WHERE ua.agency_id IN (${platformPh})
         UNION
         SELECT ua.user_id
         FROM user_agencies ua
         INNER JOIN agencies a ON a.id = ua.agency_id
         INNER JOIN organization_affiliations oa ON oa.organization_id = a.id
         WHERE a.organization_type = 'affiliation'
           AND oa.is_active = 1
           AND oa.agency_id IN (${platformPh})
       ) AS combined`,
      idParams
    );

    const eligibleIds = (idRows || [])
      .map((r) => Number(r.user_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!eligibleIds.length) {
      return res.json({ users: [], total: 0 });
    }

    // Pull the user rows. Apply optional search filter server-side.
    const idPh = eligibleIds.map(() => '?').join(', ');
    const params = [...eligibleIds];
    let where = `u.id IN (${idPh}) AND (u.is_archived IS NULL OR u.is_archived = 0)`;
    if (q) {
      const qLike = `%${q.replace(/%/g, '\\%')}%`;
      where += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?
                     OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?)`;
      params.push(qLike, qLike, qLike, qLike);
    }

    const [userRows] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status
       FROM users u
       WHERE ${where}
       ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC
       LIMIT ${limit}`,
      params
    );

    const userIds = (userRows || []).map((r) => Number(r.id));
    const affilByUser = new Map();
    if (userIds.length) {
      const uph = userIds.map(() => '?').join(', ');
      const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
      const platSql = plat ? plat.sql : '';
      const platParams = plat ? plat.params : [];
      const [affilRows] = await pool.execute(
        `SELECT ua.user_id, a.id AS club_id, a.name AS club_name, a.slug AS club_slug,
                ua.club_role, ua.is_active
         FROM user_agencies ua
         INNER JOIN agencies a ON a.id = ua.agency_id
         WHERE ua.user_id IN (${uph})
           AND a.organization_type = 'affiliation'
           AND a.is_active = 1
           ${platSql}`,
        [...userIds, ...platParams]
      );
      for (const row of affilRows || []) {
        const uid = Number(row.user_id);
        if (!affilByUser.has(uid)) affilByUser.set(uid, []);
        affilByUser.get(uid).push({
          clubId: Number(row.club_id),
          clubName: row.club_name || '',
          clubSlug: row.club_slug || '',
          clubRole: row.club_role || 'member',
          isActive: Number(row.is_active || 0) === 1
        });
      }
    }

    const users = (userRows || []).map((u) => {
      const memberships = affilByUser.get(Number(u.id)) || [];
      const isManagerSomewhere = memberships.some(
        (m) => m.clubRole === 'manager' || m.clubRole === 'assistant_manager'
      );
      return {
        id: Number(u.id),
        email: u.email || '',
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        role: u.role || '',
        status: u.status || '',
        sstcMemberships: memberships,
        isClubManagerSomewhere: isManagerSomewhere
      };
    });

    return res.json({ users, total: users.length });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /summit-stats/users/:userId/club-affiliations
 * Super admin only.
 * Returns SSTC clubs the user belongs to, with role + isActive + city/state when available.
 */
export const getUserSstcClubAffiliations = async (req, res, next) => {
  try {
    const callerRole = String(req.user?.role || '').trim().toLowerCase();
    if (callerRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
    if (!plat) return res.json({ user: null, clubs: [] });

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [agencyCols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('city','state')",
      [dbName]
    );
    const colNames = new Set((agencyCols || []).map((r) => r.COLUMN_NAME));
    const cityCol = colNames.has('city') ? 'a.city' : "NULL";
    const stateCol = colNames.has('state') ? 'a.state' : "NULL";

    const [userRows] = await pool.execute(
      `SELECT id, email, first_name, last_name, role, status FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const userRow = userRows?.[0] || null;
    if (!userRow) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.slug, ${cityCol} AS city, ${stateCol} AS state,
              ua.club_role, ua.is_active
       FROM user_agencies ua
       INNER JOIN agencies a ON a.id = ua.agency_id
       WHERE ua.user_id = ?
         AND a.organization_type = 'affiliation'
         AND a.is_active = 1
         ${plat.sql}
       ORDER BY a.name ASC`,
      [userId, ...plat.params]
    );

    const clubs = (rows || []).map((r) => ({
      id: Number(r.id),
      name: r.name || '',
      slug: r.slug || '',
      city: r.city || null,
      state: r.state || null,
      clubRole: r.club_role || 'member',
      isActive: Number(r.is_active || 0) === 1
    }));

    return res.json({
      user: {
        id: userRow.id,
        email: userRow.email || '',
        firstName: userRow.first_name || '',
        lastName: userRow.last_name || '',
        role: userRow.role || '',
        status: userRow.status || ''
      },
      clubs
    });
  } catch (e) {
    next(e);
  }
};

// ─── SSTC Login Splash & Notification Preferences ────────────────────────────

/**
 * Returns per-team stats since the user's last logout for every active SSTC season.
 * Used to power the "here's what happened while you were away" login splash.
 * GET /summit-stats/me/login-splash
 */
export const getLoginSplashData = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    // 1. Find user's last logout/timeout event
    const [logoutRows] = await pool.execute(
      `SELECT created_at FROM user_activity_log
       WHERE user_id = ? AND action_type IN ('logout', 'timeout')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const lastLogoutAt = logoutRows[0]?.created_at || null;

    // 2. Find active SSTC seasons this user participates in
    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
    const [seasonRows] = await pool.execute(
      `SELECT DISTINCT c.id AS class_id, c.class_name, c.banner_image_path, c.banner_focal_x, c.banner_focal_y, c.logo_image_path,
              a.id AS agency_id, a.name AS club_name, a.logo_path AS agency_logo
       FROM learning_program_classes c
       INNER JOIN agencies a ON a.id = c.organization_id
       INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = c.id AND m.provider_user_id = ?
       WHERE c.status = 'active'
         AND m.membership_status IN ('active','completed')
         AND LOWER(COALESCE(a.organization_type,'')) = 'affiliation'
         ${plat ? plat.sql : ''}
       LIMIT 5`,
      [userId, ...(plat ? plat.params : [])]
    );

    if (!seasonRows.length) return res.json({ seasons: [], lastLogoutAt });

    // 3. For each season, compute per-team stats since lastLogoutAt (and season totals)
    const seasons = [];
    for (const s of seasonRows) {
      const classId = Number(s.class_id);

      const sinceParams = lastLogoutAt ? [classId, lastLogoutAt] : [classId];
      const sinceClause = lastLogoutAt ? 'AND w.created_at >= ?' : '';

      const [teamRows] = await pool.execute(
        `SELECT
           t.id AS team_id,
           t.team_name,
           t.logo_path AS team_logo,
           COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0)
                             AND w.proof_status IN ('approved','not_required')
                             ${sinceClause}
                             THEN w.points END), 0) AS points_since,
           COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0)
                             AND w.proof_status IN ('approved','not_required')
                             ${sinceClause}
                             THEN w.distance_value END), 0) AS miles_since,
           COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0)
                             AND w.proof_status IN ('approved','not_required')
                             THEN w.points END), 0) AS total_points,
           COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0)
                             AND w.proof_status IN ('approved','not_required')
                             THEN w.distance_value END), 0) AS total_miles,
           COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0)
                             AND w.proof_status IN ('approved','not_required')
                             THEN 1 END), 0) AS total_workouts
         FROM challenge_teams t
         LEFT JOIN challenge_workouts w ON w.team_id = t.id AND w.learning_class_id = t.learning_class_id
         WHERE t.learning_class_id = ?
         GROUP BY t.id, t.team_name, t.logo_path
         ORDER BY total_points DESC`,
        sinceParams
      );

      // 4. Which team is this user on?
      const [myTeamRow] = await pool.execute(
        `SELECT t.id AS team_id, t.team_name
         FROM challenge_team_members m
         INNER JOIN challenge_teams t ON t.id = m.team_id
         WHERE m.provider_user_id = ? AND t.learning_class_id = ?
         LIMIT 1`,
        [userId, classId]
      );
      const myTeamId = myTeamRow[0]?.team_id || null;

      seasons.push({
        classId,
        name: s.class_name,
        bannerPath: s.banner_image_path || null,
        bannerFocalX: Number(s.banner_focal_x ?? 50),
        bannerFocalY: Number(s.banner_focal_y ?? 50),
        logoPath: s.logo_image_path || null,
        clubName: s.club_name,
        myTeamId,
        teams: (teamRows || []).map((t) => ({
          teamId: Number(t.team_id),
          teamName: t.team_name,
          teamLogo: t.team_logo || null,
          pointsSince: Number(t.points_since),
          milesSince: parseFloat(Number(t.miles_since).toFixed(2)),
          totalPoints: Number(t.total_points),
          totalMiles: parseFloat(Number(t.total_miles).toFixed(2)),
          totalWorkouts: Number(t.total_workouts)
        }))
      });
    }

    return res.json({ seasons, lastLogoutAt: lastLogoutAt ? lastLogoutAt.toISOString() : null });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /summit-stats/me/notification-preferences
 * Returns SSTC-specific notification preferences for the authenticated user.
 * If not set yet, returns defaults (with captain-aware defaults for daily summary).
 */
export const getSstcNotificationPrefs = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    // Check if user is a captain on any active SSTC season
    const [captainRows] = await pool.execute(
      `SELECT t.id FROM challenge_teams t
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
       WHERE t.team_manager_user_id = ? AND c.status = 'active'
       LIMIT 1`,
      [userId]
    );
    const isCaptain = captainRows.length > 0;

    const [rows] = await pool.execute(
      `SELECT sstc_notification_prefs_json FROM user_preferences WHERE user_id = ?`,
      [userId]
    );
    const raw = rows[0]?.sstc_notification_prefs_json || null;
    let prefs = typeof raw === 'string' ? JSON.parse(raw) : (raw || null);
    if (!prefs) {
      prefs = buildDefaultSstcPrefs(isCaptain);
    }
    return res.json({ prefs, isCaptain });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /summit-stats/me/notification-preferences
 * Saves SSTC-specific notification preferences.
 */
export const putSstcNotificationPrefs = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const prefs = req.body?.prefs || req.body || {};
    await pool.execute(
      `INSERT INTO user_preferences (user_id, sstc_notification_prefs_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE sstc_notification_prefs_json = VALUES(sstc_notification_prefs_json)`,
      [userId, JSON.stringify(prefs)]
    );
    return res.json({ ok: true, prefs });
  } catch (e) {
    next(e);
  }
};

function buildDefaultSstcPrefs(isCaptain = false) {
  return {
    loginSplash: true,
    dailySummary: {
      enabled: isCaptain,
      mode: 'splash',           // 'splash' | 'email' | 'both'
      days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      time: '08:00'
    },
    weeklySummary: {
      splash: true,
      email: false
    },
    captainExtras: {
      teamActivityAlerts: isCaptain
    }
  };
}

/**
 * POST /summit-stats/me/weekly-summary-email
 * Triggers a one-off weekly summary email for the authenticated user (for testing
 * and for the first-login-of-week splash "also send email" option).
 * Body: { classId, weekStart }
 */
export const triggerWeeklySummaryEmail = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const classId = Number(req.body?.classId || 0);
    const weekStart = String(req.body?.weekStart || '').slice(0, 10);
    if (!classId || !weekStart) return res.status(400).json({ error: { message: 'classId and weekStart are required' } });

    const { sendWeeklySummaryEmail } = await import('../services/sstcWeeklySummary.service.js');
    const result = await sendWeeklySummaryEmail({ userId, classId, weekStart });
    return res.json(result);
  } catch (e) {
    next(e);
  }
};
