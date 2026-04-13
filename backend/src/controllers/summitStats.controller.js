import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
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
import { estimateCalories } from '../utils/calorieUtils.js';

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
  if (k === 'duration_minutes' || k === 'duration') return 'minutes';
  if (k === 'points') return 'points';
  return '';
};

const normalizeClubRecords = (input) => {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  const normalizeMetricKey = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'distance_miles' || s === 'distance') return 'distance_miles';
    if (s === 'duration_minutes' || s === 'duration') return 'duration_minutes';
    if (s === 'points') return 'points';
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
      holderName: String(row?.holderName || '').trim(),
      holderYear: normalizeHolderYear(row?.holderYear),
      holderTeam: String(row?.holderTeam || '').trim(),
      iconId: normalizeIconId(row?.iconId),
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
  const merged = [];
  for (const incoming of incomingRecords || []) {
    const id = String(incoming.id);
    const prev = existingById.get(id);
    if (!prev) {
      merged.push({
        ...incoming,
        seededAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      continue;
    }
    // Seed values can be defined at creation, but existing records are not manually broken/overwritten.
    merged.push({
      ...prev,
      label: incoming.label,
      unit: incoming.unit || unitForMetricKey(incoming.metricKey || prev.metricKey),
      notes: incoming.notes,
      metricKey: incoming.metricKey || prev.metricKey || null,
      holderName: incoming.holderName,
      holderYear: incoming.holderYear,
      holderTeam: incoming.holderTeam,
      iconId: incoming.iconId,
      verificationRequired: true
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
  const slug = process.env.SUMMIT_STATS_PLATFORM_SLUG || 'ssc';
  const agency = await Agency.findBySlug(slug);
  return agency?.id || null;
}

export async function getPlatformAgencyIds(platformSlug = null) {
  const envSlug = String(process.env.SUMMIT_STATS_PLATFORM_SLUG || 'ssc').trim().toLowerCase();
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

    const { name, slug: inputSlug, city, state } = req.body;
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

    const emailVerified = await hasUserEmailVerified(user.id);
    if (!emailVerified) {
      return res.status(403).json({
        error: {
          message: 'Email verification required before creating a club.',
          code: 'EMAIL_VERIFICATION_REQUIRED'
        }
      });
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

    const currentRole = String(user.role || '').trim().toLowerCase();
    if (!['super_admin', 'admin', 'support'].includes(currentRole)) {
      await User.update(user.id, { role: 'club_manager' });
    }

    await User.assignToAgency(user.id, platformAgencyId, { isActive: true });
    await User.assignToAgency(user.id, agency.id, { clubRole: 'manager', isActive: true });

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

    res.json({ clubs, total });
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

    await User.assignToAgency(user.id, clubId, { clubRole: 'member', isActive: true });

    const club = await Agency.findById(clubId);
    res.status(201).json({
      message: 'You have joined the club.',
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
      result.estimatedCalories = Math.round(totalCal);
      // Round to 2 decimals and drop zero buckets (frontend decides what to show)
      for (const key of Object.keys(am)) {
        am[key] = Math.round(am[key] * 100) / 100;
      }
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
    return res.json({
      agencyId: clubId,
      records: normalizeClubRecords(parseClubRecords(rec?.records_json)),
      updatedAt: rec?.updated_at || null
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
    return res.json({ agencyId: clubId, records });
  } catch (error) {
    next(error);
  }
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

export const queueClubRecordBreakCandidates = async ({ learningClassId, workoutId, userId }) => {
  const classId = Number(learningClassId);
  const wId = Number(workoutId);
  const uId = Number(userId);
  if (!Number.isFinite(classId) || !Number.isFinite(wId) || !Number.isFinite(uId)) return;
  const [classRows] = await pool.execute(
    `SELECT id, organization_id
     FROM learning_program_classes
     WHERE id = ?
     LIMIT 1`,
    [classId]
  );
  const klass = classRows?.[0];
  if (!klass?.organization_id) return;
  const agencyId = Number(klass.organization_id);
  const [recordRows] = await pool.execute(
    `SELECT records_json
     FROM summit_stats_club_records
     WHERE agency_id = ?
     LIMIT 1`,
    [agencyId]
  );
  const records = normalizeClubRecords(parseClubRecords(recordRows?.[0]?.records_json));
  if (!records.length) return;
  const [workoutRows] = await pool.execute(
    `SELECT id, learning_class_id, user_id, points, distance_value, duration_minutes
     FROM challenge_workouts
     WHERE id = ? AND learning_class_id = ? AND user_id = ?
     LIMIT 1`,
    [wId, classId, uId]
  );
  const workout = workoutRows?.[0];
  if (!workout) return;
  for (const record of records) {
    const metricKey = record.metricKey || null;
    if (!metricKey) continue;
    const candidateValue = getMetricValueFromWorkout(metricKey, workout);
    const currentValue = Number(record.value);
    if (!Number.isFinite(candidateValue) || !Number.isFinite(currentValue)) continue;
    if (candidateValue <= currentValue) continue;
    const [existingPending] = await pool.execute(
      `SELECT id
       FROM summit_stats_club_record_verifications
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
