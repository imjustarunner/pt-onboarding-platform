/**
 * Challenge Recognition Library
 * CRUD for reusable recognition awards and eligibility groups per club.
 */
import pool from '../config/database.js';
import Icon from '../models/Icon.model.js';
import { parseFeatureFlags } from '../utils/bookClub.js';
import { canUserManageClub, getClubPlatformTenantAgencyId } from '../utils/sscClubAccess.js';

const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

const parseJson = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

// ── Authorization helpers ────────────────────────────────────────
async function assertClubAccess(req, clubId) {
  return canUserManageClub({ user: req.user, clubId });
}

// ════════════════════════════════════════════════════════════════
// ELIGIBILITY GROUPS
// ════════════════════════════════════════════════════════════════

const groupToApi = (row) => ({
  id: Number(row.id),
  agencyId: Number(row.agency_id),
  label: row.label,
  criteria: parseJson(row.criteria),
  isActive: !!row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// ════════════════════════════════════════════════════════════════
// CLUB TIME PREFERENCES (timezone + clock format)
// ════════════════════════════════════════════════════════════════

const VALID_TIME_FORMATS = new Set(['12h', '24h']);

/**
 * GET /summit-stats/clubs/:id/time-preferences
 */
export const getClubTimePreferences = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(`SELECT timezone, time_format FROM agencies WHERE id = ? LIMIT 1`, [clubId]);
    const row = rows?.[0] || {};
    return res.json({ timezone: row.timezone || null, timeFormat: row.time_format || '12h' });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/time-preferences
 */
export const updateClubTimePreferences = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const timezone   = req.body?.timezone ? String(req.body.timezone).trim().slice(0, 64) : null;
    const timeFormat = VALID_TIME_FORMATS.has(req.body?.timeFormat) ? req.body.timeFormat : '12h';
    await pool.execute(`UPDATE agencies SET timezone = ?, time_format = ? WHERE id = ?`, [timezone || null, timeFormat, clubId]);
    return res.json({ ok: true, timezone, timeFormat });
  } catch (e) { next(e); }
};

// ── User timezone preference ─────────────────────────────────────

/**
 * PUT /summit-stats/users/me/timezone
 * Any authenticated user can update their own timezone preference.
 */
export const updateMyTimezone = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const timezone = req.body?.timezone ? String(req.body.timezone).trim().slice(0, 64) : null;
    await pool.execute(`UPDATE users SET timezone = ? WHERE id = ?`, [timezone || null, userId]);
    return res.json({ ok: true, timezone });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/users/me/timezone
 */
export const getMyTimezone = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const [rows] = await pool.execute(`SELECT timezone FROM users WHERE id = ? LIMIT 1`, [userId]);
    return res.json({ timezone: rows?.[0]?.timezone || null });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// CLUB ICON BROWSER (for recognition icon picker)
// ════════════════════════════════════════════════════════════════

/**
 * GET /summit-stats/clubs/:id/icons
 * Returns icons for the recognition icon picker: this club, shared tenant (SSC/SSTC platform agency), and global (agency_id NULL).
 * Supports server-side search across name, description, activity_type, sub_category, and club-private details.
 */
export const listClubIcons = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);

    const search      = req.query.search ? String(req.query.search).trim() : null;
    const activityType = req.query.activityType ? String(req.query.activityType).trim() : null;
    const subCategory  = req.query.subCategory  ? String(req.query.subCategory).trim()  : null;

    // Build the scope filter
    const scopeConditions = ['i.agency_id = ?'];
    const params = [clubId];
    scopeConditions.push('i.agency_id IS NULL');
    if (tenantAgencyId) {
      scopeConditions.push('i.agency_id = ?');
      params.push(tenantAgencyId);
    }

    // Start building SQL with LEFT JOIN on icon_club_details for this club
    let sql = `SELECT i.id, i.name, i.file_path, i.category, i.agency_id,
                      i.activity_type, i.sub_category, i.description,
                      icd.details AS club_details
               FROM icons i
               LEFT JOIN icon_club_details icd ON icd.icon_id = i.id AND icd.agency_id = ?
               WHERE i.is_active = 1
                 AND (${scopeConditions.join(' OR ')})`;
    // icd.agency_id param for the JOIN is the first param
    params.unshift(clubId);

    if (activityType) {
      sql += ' AND i.activity_type = ?';
      params.push(activityType);
    }
    if (subCategory) {
      sql += ' AND i.sub_category = ?';
      params.push(subCategory);
    }
    if (search) {
      const like = `%${search}%`;
      sql += ' AND (i.name LIKE ? OR i.description LIKE ? OR i.activity_type LIKE ? OR i.sub_category LIKE ? OR icd.details LIKE ?)';
      params.push(like, like, like, like, like);
    }

    sql += ' ORDER BY i.name ASC LIMIT 400';

    const [rows] = await pool.execute(sql, params);

    const baseUrl = process.env.BACKEND_URL || '';
    const scopeOrder = { club: 0, tenant: 1, platform: 2 };

    const icons = (rows || []).map((icon) => {
      let url = icon.file_path || '';
      if (url && !url.startsWith('http')) {
        url = url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
      }
      const aid = icon.agency_id != null ? Number(icon.agency_id) : null;
      let scope = 'platform';
      if (aid === clubId) scope = 'club';
      else if (tenantAgencyId && aid === Number(tenantAgencyId)) scope = 'tenant';
      return {
        id: icon.id,
        name: icon.name,
        url,
        category: icon.category || null,
        activityType: icon.activity_type || null,
        subCategory: icon.sub_category || null,
        description: icon.description || null,
        clubDetails: icon.club_details || null,
        scope
      };
    });

    icons.sort((a, b) => {
      const d = scopeOrder[a.scope] - scopeOrder[b.scope];
      if (d !== 0) return d;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });

    return res.json({ icons, tenantAgencyId: tenantAgencyId || null });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// ELIGIBILITY GROUPS
// ════════════════════════════════════════════════════════════════

/**
 * GET /summit-stats/clubs/:id/eligibility-groups
 */
export const listEligibilityGroups = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_eligibility_groups WHERE agency_id = ? AND is_active = 1 ORDER BY label ASC`,
      [clubId]
    );
    return res.json({ groups: (rows || []).map(groupToApi) });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/eligibility-groups
 */
export const createEligibilityGroup = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });
    const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
    const [result] = await pool.execute(
      `INSERT INTO challenge_eligibility_groups (agency_id, label, criteria) VALUES (?, ?, ?)`,
      [clubId, label, JSON.stringify(criteria)]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_eligibility_groups WHERE id = ?`, [result.insertId]);
    return res.status(201).json({ group: groupToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/eligibility-groups/:groupId
 */
export const updateEligibilityGroup = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const groupId = toInt(req.params.groupId);
    if (!clubId || !groupId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const label = String(req.body?.label || '').trim();
    const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
    await pool.execute(
      `UPDATE challenge_eligibility_groups SET label = ?, criteria = ? WHERE id = ? AND agency_id = ?`,
      [label || 'Unnamed group', JSON.stringify(criteria), groupId, clubId]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_eligibility_groups WHERE id = ?`, [groupId]);
    if (!rows?.length) return res.status(404).json({ error: { message: 'Group not found' } });
    return res.json({ group: groupToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/clubs/:id/eligibility-groups/:groupId
 */
export const deleteEligibilityGroup = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const groupId = toInt(req.params.groupId);
    if (!clubId || !groupId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    await pool.execute(
      `UPDATE challenge_eligibility_groups SET is_active = 0 WHERE id = ? AND agency_id = ?`,
      [groupId, clubId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// RECOGNITION AWARDS LIBRARY
// ════════════════════════════════════════════════════════════════

const awardToApi = (row) => ({
  id: Number(row.id),
  agencyId: Number(row.agency_id),
  label: row.label,
  icon: row.icon || '🏆',
  period: row.period,
  activityType: row.activity_type || '',
  metric: row.metric,
  aggregation: row.aggregation,
  milestoneThreshold: row.milestone_threshold != null ? Number(row.milestone_threshold) : null,
  referenceTarget: row.reference_target != null ? Number(row.reference_target) : null,
  groupFilter: row.group_filter || '',
  genderVariants: parseJson(row.gender_variants),
  isTenantTemplate: !!row.is_tenant_template,
  isActive: !!row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

/** @returns {{ aggregation: string, milestoneThreshold: number|null, error?: string }} */
function resolveAwardAggregation(body) {
  const allowed = ['most', 'average', 'milestone'];
  const aggregation = allowed.includes(String(body?.aggregation || '')) ? body.aggregation : 'most';
  if (aggregation === 'milestone') {
    const n = Number(body?.milestoneThreshold);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: 'For milestone awards, milestoneThreshold must be a positive number (same units as the metric).' };
    }
    return { aggregation, milestoneThreshold: n };
  }
  return { aggregation, milestoneThreshold: null };
}

/** Optional display/reference amount (metric units); ignored for milestone (use milestoneThreshold). */
function parseOptionalReferenceTarget(body, aggregation) {
  if (aggregation === 'milestone') return null;
  const raw = body?.referenceTarget ?? body?.reference_target;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * GET /summit-stats/clubs/:id/recognition-awards
 */
export const listRecognitionAwards = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_recognition_awards WHERE agency_id = ? AND is_active = 1 AND (is_tenant_template = 0 OR is_tenant_template IS NULL) ORDER BY label ASC`,
      [clubId]
    );
    return res.json({ awards: (rows || []).map(awardToApi) });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/recognition-awards
 */
export const createRecognitionAward = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });
    const icon          = String(req.body?.icon || '🏆').slice(0, 64);
    const period        = ['weekly', 'monthly', 'season'].includes(req.body?.period) ? req.body.period : 'weekly';
    const activityType  = String(req.body?.activityType || '').trim().slice(0, 64);
    const metric        = ['points', 'distance_miles', 'duration_minutes', 'activities_count'].includes(req.body?.metric) ? req.body.metric : 'points';
    const resolvedAgg   = resolveAwardAggregation(req.body);
    if (resolvedAgg.error) return res.status(400).json({ error: { message: resolvedAgg.error } });
    const { aggregation, milestoneThreshold } = resolvedAgg;
    const referenceTarget = parseOptionalReferenceTarget(req.body, aggregation);
    const groupFilter   = String(req.body?.groupFilter || '').trim().slice(0, 128);
    const genderVariants = Array.isArray(req.body?.genderVariants) ? req.body.genderVariants : [];
    const [result] = await pool.execute(
      `INSERT INTO challenge_recognition_awards (agency_id, label, icon, period, activity_type, metric, aggregation, milestone_threshold, reference_target, group_filter, gender_variants, is_tenant_template)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [clubId, label, icon, period, activityType || null, metric, aggregation, milestoneThreshold, referenceTarget, groupFilter || null, JSON.stringify(genderVariants)]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_recognition_awards WHERE id = ?`, [result.insertId]);
    return res.status(201).json({ award: awardToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/recognition-awards/:awardId
 */
export const updateRecognitionAward = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const awardId = toInt(req.params.awardId);
    if (!clubId || !awardId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const label         = String(req.body?.label || '').trim() || 'Unnamed Award';
    const icon          = String(req.body?.icon || '🏆').slice(0, 64);
    const period        = ['weekly', 'monthly', 'season'].includes(req.body?.period) ? req.body.period : 'weekly';
    const activityType  = String(req.body?.activityType || '').trim().slice(0, 64);
    const metric        = ['points', 'distance_miles', 'duration_minutes', 'activities_count'].includes(req.body?.metric) ? req.body.metric : 'points';
    const resolvedAgg   = resolveAwardAggregation(req.body);
    if (resolvedAgg.error) return res.status(400).json({ error: { message: resolvedAgg.error } });
    const { aggregation, milestoneThreshold } = resolvedAgg;
    const referenceTarget = parseOptionalReferenceTarget(req.body, aggregation);
    const groupFilter   = String(req.body?.groupFilter || '').trim().slice(0, 128);
    const genderVariants = Array.isArray(req.body?.genderVariants) ? req.body.genderVariants : [];
    await pool.execute(
      `UPDATE challenge_recognition_awards
       SET label = ?, icon = ?, period = ?, activity_type = ?, metric = ?, aggregation = ?, milestone_threshold = ?, reference_target = ?, group_filter = ?, gender_variants = ?
       WHERE id = ? AND agency_id = ?`,
      [label, icon, period, activityType || null, metric, aggregation, milestoneThreshold, referenceTarget, groupFilter || null, JSON.stringify(genderVariants), awardId, clubId]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_recognition_awards WHERE id = ?`, [awardId]);
    if (!rows?.length) return res.status(404).json({ error: { message: 'Award not found' } });
    return res.json({ award: awardToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/clubs/:id/recognition-awards/:awardId
 */
export const deleteRecognitionAward = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const awardId = toInt(req.params.awardId);
    if (!clubId || !awardId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    await pool.execute(
      `UPDATE challenge_recognition_awards SET is_active = 0 WHERE id = ? AND agency_id = ?`,
      [awardId, clubId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// CLUB ICON DETAILS (per-club private notes on icons)
// ════════════════════════════════════════════════════════════════

/**
 * GET /summit-stats/clubs/:id/icon-details/:iconId
 * Returns the club's private details/notes for a specific icon.
 */
export const getClubIconDetails = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const iconId  = toInt(req.params.iconId);
    if (!clubId || !iconId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT details, updated_at FROM icon_club_details WHERE icon_id = ? AND agency_id = ? LIMIT 1`,
      [iconId, clubId]
    );
    return res.json({ details: rows?.[0]?.details || null, updatedAt: rows?.[0]?.updated_at || null });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/icon-details/:iconId
 * Upserts the club's private details/notes for a specific icon.
 */
export const upsertClubIconDetails = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const iconId  = toInt(req.params.iconId);
    if (!clubId || !iconId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const details = req.body?.details != null ? String(req.body.details).slice(0, 4000) : null;
    await pool.execute(
      `INSERT INTO icon_club_details (icon_id, agency_id, details)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE details = VALUES(details)`,
      [iconId, clubId, details]
    );
    return res.json({ ok: true, details });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// TENANT RECOGNITION AWARD LIBRARY
// ════════════════════════════════════════════════════════════════

/**
 * Resolve the tenant agency for the current request.
 * Accepts an optional clubId (for manager context) to look up the tenant via affiliations.
 */
async function resolveTenantAgencyId(req) {
  const clubIdParam = toInt(req.params.clubId || req.query.clubId);
  if (clubIdParam) {
    return getClubPlatformTenantAgencyId(clubIdParam);
  }
  // For superadmin requests without a club context, look up via query param tenantAgencyId
  const direct = toInt(req.query.tenantAgencyId);
  return direct || null;
}

/**
 * Check whether the current user has write access to the tenant award library.
 * Superadmins always do. Other users already passed assertClubAccess for the club.
 * Opt-out only: set agencies.feature_flags.ssc_tenant_award_manager_write to false to block managers.
 */
async function assertTenantAwardWriteAccess(req, tenantAgencyId) {
  if (!tenantAgencyId) return false;
  if (req.user?.role === 'super_admin') return true;

  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [tenantAgencyId]
  );
  const flags = parseFeatureFlags(rows?.[0]?.feature_flags);
  if (Object.prototype.hasOwnProperty.call(flags, 'ssc_tenant_award_manager_write') && flags.ssc_tenant_award_manager_write === false) {
    return false;
  }
  return true;
}

/**
 * GET /summit-stats/clubs/:id/tenant-awards
 * Returns all tenant-level award templates visible to the club.
 */
export const listTenantAwards = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.json({ awards: [], tenantAgencyId: null });

    const [rows] = await pool.execute(
      `SELECT * FROM challenge_recognition_awards WHERE agency_id = ? AND is_tenant_template = 1 AND is_active = 1 ORDER BY label ASC`,
      [tenantAgencyId]
    );
    return res.json({ awards: (rows || []).map(awardToApi), tenantAgencyId });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/tenant-awards
 * Creates a new tenant-level award template.
 */
export const createTenantAward = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantAwardWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to add to tenant library' } });
    }

    const label         = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });
    const icon          = String(req.body?.icon || '🏆').slice(0, 64);
    const period        = ['weekly', 'monthly', 'season'].includes(req.body?.period) ? req.body.period : 'weekly';
    const activityType  = String(req.body?.activityType || '').trim().slice(0, 64);
    const metric        = ['points', 'distance_miles', 'duration_minutes', 'activities_count'].includes(req.body?.metric) ? req.body.metric : 'points';
    const resolvedAgg   = resolveAwardAggregation(req.body);
    if (resolvedAgg.error) return res.status(400).json({ error: { message: resolvedAgg.error } });
    const { aggregation, milestoneThreshold } = resolvedAgg;
    const referenceTarget = parseOptionalReferenceTarget(req.body, aggregation);
    const groupFilter   = String(req.body?.groupFilter || '').trim().slice(0, 128);
    const genderVariants = Array.isArray(req.body?.genderVariants) ? req.body.genderVariants : [];

    const [result] = await pool.execute(
      `INSERT INTO challenge_recognition_awards (agency_id, is_tenant_template, label, icon, period, activity_type, metric, aggregation, milestone_threshold, reference_target, group_filter, gender_variants)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantAgencyId, label, icon, period, activityType || null, metric, aggregation, milestoneThreshold, referenceTarget, groupFilter || null, JSON.stringify(genderVariants)]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_recognition_awards WHERE id = ?`, [result.insertId]);
    return res.status(201).json({ award: awardToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/tenant-awards/:awardId
 * Updates a tenant-level award template.
 */
export const updateTenantAward = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const awardId = toInt(req.params.awardId);
    if (!clubId || !awardId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantAwardWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to edit tenant library' } });
    }

    const label         = String(req.body?.label || '').trim() || 'Unnamed Award';
    const icon          = String(req.body?.icon || '🏆').slice(0, 64);
    const period        = ['weekly', 'monthly', 'season'].includes(req.body?.period) ? req.body.period : 'weekly';
    const activityType  = String(req.body?.activityType || '').trim().slice(0, 64);
    const metric        = ['points', 'distance_miles', 'duration_minutes', 'activities_count'].includes(req.body?.metric) ? req.body.metric : 'points';
    const resolvedAgg   = resolveAwardAggregation(req.body);
    if (resolvedAgg.error) return res.status(400).json({ error: { message: resolvedAgg.error } });
    const { aggregation, milestoneThreshold } = resolvedAgg;
    const referenceTarget = parseOptionalReferenceTarget(req.body, aggregation);
    const groupFilter   = String(req.body?.groupFilter || '').trim().slice(0, 128);
    const genderVariants = Array.isArray(req.body?.genderVariants) ? req.body.genderVariants : [];

    await pool.execute(
      `UPDATE challenge_recognition_awards
       SET label = ?, icon = ?, period = ?, activity_type = ?, metric = ?, aggregation = ?, milestone_threshold = ?, reference_target = ?, group_filter = ?, gender_variants = ?
       WHERE id = ? AND agency_id = ? AND is_tenant_template = 1`,
      [label, icon, period, activityType || null, metric, aggregation, milestoneThreshold, referenceTarget, groupFilter || null, JSON.stringify(genderVariants), awardId, tenantAgencyId]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_recognition_awards WHERE id = ?`, [awardId]);
    if (!rows?.length) return res.status(404).json({ error: { message: 'Award not found' } });
    return res.json({ award: awardToApi(rows[0]) });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/clubs/:id/tenant-awards/:awardId
 */
export const deleteTenantAward = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const awardId = toInt(req.params.awardId);
    if (!clubId || !awardId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantAwardWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to delete from tenant library' } });
    }

    await pool.execute(
      `UPDATE challenge_recognition_awards SET is_active = 0 WHERE id = ? AND agency_id = ? AND is_tenant_template = 1`,
      [awardId, tenantAgencyId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/recognition-awards/clone-from-tenant/:awardId
 * Clones a tenant-level award template into the club's own library.
 */
export const cloneTenantAward = async (req, res, next) => {
  try {
    const clubId  = toInt(req.params.id);
    const awardId = toInt(req.params.awardId);
    if (!clubId || !awardId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    const [sourceRows] = await pool.execute(
      `SELECT * FROM challenge_recognition_awards WHERE id = ? AND is_tenant_template = 1 AND is_active = 1 LIMIT 1`,
      [awardId]
    );
    if (!sourceRows?.length) return res.status(404).json({ error: { message: 'Tenant award not found' } });
    const src = sourceRows[0];

    const [result] = await pool.execute(
      `INSERT INTO challenge_recognition_awards (agency_id, is_tenant_template, label, icon, period, activity_type, metric, aggregation, milestone_threshold, reference_target, group_filter, gender_variants)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clubId, src.label, src.icon, src.period, src.activity_type, src.metric, src.aggregation, src.milestone_threshold ?? null, src.reference_target ?? null, src.group_filter, src.gender_variants]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_recognition_awards WHERE id = ?`, [result.insertId]);
    return res.status(201).json({ award: awardToApi(rows[0]) });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// CLUB STATS CONFIGURATION
// ════════════════════════════════════════════════════════════════

const STAT_DEFINITIONS = [
  { key: 'total_miles',       label: 'Total Miles',          unit: 'mi',  icon: '🏃', sql: 'COALESCE(SUM(w.distance_value), 0)',   type: 'decimal' },
  { key: 'total_points',      label: 'Total Points',         unit: 'pts', icon: '⭐', sql: 'COALESCE(SUM(w.points), 0)',            type: 'integer' },
  { key: 'total_minutes',     label: 'Total Minutes Active', unit: 'min', icon: '⏱️', sql: 'COALESCE(SUM(w.duration_minutes), 0)', type: 'integer' },
  { key: 'total_workouts',    label: 'Total Workouts',       unit: '',    icon: '💪', sql: 'COUNT(w.id)',                           type: 'integer' },
  { key: 'total_calories',    label: 'Calories Burned',      unit: 'cal', icon: '🔥', sql: 'COALESCE(SUM(w.calories_burned), 0)',  type: 'integer' },
  { key: 'total_runs',        label: 'Total Runs',           unit: '',    icon: '👟', sql: `SUM(CASE WHEN LOWER(w.activity_type) LIKE '%run%' THEN 1 ELSE 0 END)`,  type: 'integer' },
  { key: 'total_rucks',       label: 'Total Rucks',          unit: '',    icon: '🎒', sql: `SUM(CASE WHEN LOWER(w.activity_type) LIKE '%ruck%' THEN 1 ELSE 0 END)`, type: 'integer' },
  { key: 'total_walks',       label: 'Total Walks',          unit: '',    icon: '🚶', sql: `SUM(CASE WHEN LOWER(w.activity_type) LIKE '%walk%' THEN 1 ELSE 0 END)`, type: 'integer' },
  { key: 'run_miles',         label: 'Run Miles',            unit: 'mi',  icon: '🏃', sql: `COALESCE(SUM(CASE WHEN LOWER(w.activity_type) LIKE '%run%'  THEN w.distance_value ELSE 0 END), 0)`, type: 'decimal' },
  { key: 'ruck_miles',        label: 'Ruck Miles',           unit: 'mi',  icon: '🎒', sql: `COALESCE(SUM(CASE WHEN LOWER(w.activity_type) LIKE '%ruck%' THEN w.distance_value ELSE 0 END), 0)`, type: 'decimal' },
  { key: 'member_count',      label: 'Active Members',       unit: '',    icon: '👥', sql: null, type: 'integer' },
  { key: 'season_count',      label: 'Seasons Completed',    unit: '',    icon: '🏆', sql: null, type: 'integer' },
  { key: 'half_marathon_count', label: 'Half Marathon Club', unit: '',    icon: '🏅', sql: null, type: 'integer' },
  { key: 'marathon_count',    label: 'Marathon Club',        unit: '',    icon: '🥇', sql: null, type: 'integer' }
];

const DEFAULT_STAT_KEYS = ['member_count', 'total_miles', 'total_workouts', 'total_points', 'season_count'];

const parseStatsConfig = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

const normalizeStatIconId = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.trunc(n);
};

const loadIconUrlMapByIds = async (iconIds) => {
  const ids = Array.from(new Set((iconIds || []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)));
  if (!ids.length) return new Map();
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT id, file_path
       FROM icons
       WHERE id IN (${placeholders})`,
      ids
    );
    const out = new Map();
    for (const row of rows || []) {
      const id = Number(row.id);
      if (!id) continue;
      out.set(id, Icon.getIconUrl(row));
    }
    return out;
  } catch {
    return new Map();
  }
};

export const computeLiveStats = async (clubId) => {
  const sqlStats = STAT_DEFINITIONS.filter((d) => d.sql);
  const selectExpr = sqlStats.map((d) => `${d.sql} AS ${d.key}`).join(', ');
  const [rows] = await pool.execute(
    `SELECT ${selectExpr}
     FROM challenge_workouts w
     INNER JOIN learning_program_classes lpc ON lpc.id = w.learning_class_id
     WHERE lpc.organization_id = ? AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)`,
    [clubId]
  );
  const raw = rows?.[0] || {};
  const live = {};
  for (const d of sqlStats) {
    live[d.key] = d.type === 'decimal'
      ? Math.round(Number(raw[d.key] || 0) * 10) / 10
      : Number(raw[d.key] || 0);
  }
  const [memberRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM user_agencies WHERE agency_id = ? AND is_active = 1`, [clubId]
  );
  live.member_count = Number(memberRows?.[0]?.cnt || 0);

  const [seasonRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM learning_program_classes WHERE organization_id = ?`, [clubId]
  );
  live.season_count = Number(seasonRows?.[0]?.cnt || 0);

  const [hmRows] = await pool.execute(
    `SELECT COUNT(DISTINCT w.user_id) AS cnt
     FROM challenge_workouts w
     INNER JOIN learning_program_classes lpc ON lpc.id = w.learning_class_id
     WHERE lpc.organization_id = ? AND LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 13.1`,
    [clubId]
  );
  live.half_marathon_count = Number(hmRows?.[0]?.cnt || 0);

  const [mRows] = await pool.execute(
    `SELECT COUNT(DISTINCT w.user_id) AS cnt
     FROM challenge_workouts w
     INNER JOIN learning_program_classes lpc ON lpc.id = w.learning_class_id
     WHERE lpc.organization_id = ? AND LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 26.2`,
    [clubId]
  );
  live.marathon_count = Number(mRows?.[0]?.cnt || 0);
  return live;
};

export const buildStatsList = (config, live, enabledOnly = false, iconUrlMap = new Map()) => {
  const items = enabledOnly ? config.filter((c) => c.enabled !== false) : config;
  return items.map((c) => {
    const def = STAT_DEFINITIONS.find((d) => d.key === c.key) || {};
    const liveVal = live[c.key] ?? 0;
    const seed = Number(c.seedValue || 0);
    const total = def.type === 'decimal'
      ? Math.round((seed + liveVal) * 10) / 10
      : Math.round(seed + liveVal);
    return {
      key:      c.key,
      label:    c.label || def.label || c.key,
      unit:     c.unit != null ? c.unit : (def.unit || ''),
      icon:     c.icon || def.icon || '',
      iconId:   normalizeStatIconId(c.iconId),
      iconUrl:  normalizeStatIconId(c.iconId) ? (iconUrlMap.get(normalizeStatIconId(c.iconId)) || null) : null,
      enabled:  c.enabled !== false,
      seedValue: Number(c.seedValue || 0),
      liveValue: liveVal,
      value:    total,
      totalValue: total
    };
  });
};

export const getStatsConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(`SELECT stats_config_json FROM agencies WHERE id = ? LIMIT 1`, [clubId]);
    const savedConfig = parseStatsConfig(rows?.[0]?.stats_config_json);
    const config = savedConfig ?? DEFAULT_STAT_KEYS.map((key) => {
      const def = STAT_DEFINITIONS.find((d) => d.key === key) || {};
      return { key, label: def.label || key, unit: def.unit || '', icon: def.icon || '', enabled: true, seedValue: 0 };
    });
    const live = await computeLiveStats(clubId);
    const iconUrlMap = await loadIconUrlMapByIds(config.map((c) => c?.iconId));

    return res.json({
      config: buildStatsList(config, live, false, iconUrlMap),
      availableStats: STAT_DEFINITIONS.map((d) => ({ key: d.key, label: d.label, unit: d.unit, icon: d.icon }))
    });
  } catch (e) { next(e); }
};

export const updateStatsConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const incoming = req.body?.config;
    if (!Array.isArray(incoming)) return res.status(400).json({ error: { message: 'config must be an array' } });

    const validKeys = new Set(STAT_DEFINITIONS.map((d) => d.key));
    const cleaned = incoming
      .filter((item) => item?.key && validKeys.has(item.key))
      .map((item) => {
        const def = STAT_DEFINITIONS.find((d) => d.key === item.key) || {};
        return {
          key:       item.key,
          label:     item.label ? String(item.label).trim().slice(0, 80) : (def.label || item.key),
          unit:      item.unit != null ? String(item.unit).slice(0, 20) : (def.unit || ''),
          icon:      item.icon ? String(item.icon).slice(0, 16) : (def.icon || ''),
          iconId:    normalizeStatIconId(item.iconId),
          enabled:   item.enabled !== false,
          seedValue: Number(item.seedValue || 0)
        };
      });

    await pool.execute(`UPDATE agencies SET stats_config_json = ? WHERE id = ?`, [JSON.stringify(cleaned), clubId]);
    return res.json({ ok: true, config: cleaned });
  } catch (e) { next(e); }
};

export const getClubStats = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });

    const [rows] = await pool.execute(`SELECT stats_config_json FROM agencies WHERE id = ? LIMIT 1`, [clubId]);
    const savedConfig = parseStatsConfig(rows?.[0]?.stats_config_json);
    const config = savedConfig ?? DEFAULT_STAT_KEYS.map((key) => {
      const def = STAT_DEFINITIONS.find((d) => d.key === key) || {};
      return { key, label: def.label || key, unit: def.unit || '', icon: def.icon || '', enabled: true, seedValue: 0 };
    });
    const live = await computeLiveStats(clubId);
    const iconUrlMap = await loadIconUrlMapByIds(config.map((c) => c?.iconId));

    return res.json({ stats: buildStatsList(config, live, true, iconUrlMap) });
  } catch (e) { next(e); }
};

// ════════════════════════════════════════════════════════════════
// TEAM STORE CONFIGURATION
// ════════════════════════════════════════════════════════════════

const parseStoreConfig = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

/**
 * GET /summit-stats/clubs/:id/store-config
 * Returns the club's team store config. Accessible by authenticated members
 * (so the member dashboard can render the rail) and managers.
 */
export const getStoreConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });

    const [rows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`, [clubId]
    );
    const raw = parseStoreConfig(rows?.[0]?.store_config_json) || {};
    const config = {
      enabled: !!raw.enabled,
      title: String(raw.title || 'Team Store').trim().slice(0, 120),
      description: String(raw.description || '').trim().slice(0, 300),
      buttonText: String(raw.buttonText || 'Shop Now').trim().slice(0, 60),
      url: String(raw.url || '').trim().slice(0, 500)
    };
    return res.json({ store: config });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/store-config
 * Manager-only — save team store settings.
 */
export const updateStoreConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const body = req.body || {};
    const config = {
      enabled:     body.enabled === true || body.enabled === 'true',
      title:       body.title       ? String(body.title).trim().slice(0, 120)       : 'Team Store',
      description: body.description ? String(body.description).trim().slice(0, 300) : '',
      buttonText:  body.buttonText  ? String(body.buttonText).trim().slice(0, 60)   : 'Shop Now',
      url:         body.url         ? String(body.url).trim().slice(0, 500)         : ''
    };

    const [rows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const existing = parseStoreConfig(rows?.[0]?.store_config_json) || {};
    const next = {
      ...existing,
      ...config
    };

    await pool.execute(
      `UPDATE agencies SET store_config_json = ? WHERE id = ?`,
      [JSON.stringify(next), clubId]
    );
    return res.json({ ok: true, store: config });
  } catch (e) { next(e); }
};
