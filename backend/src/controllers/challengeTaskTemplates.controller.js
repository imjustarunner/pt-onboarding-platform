/**
 * Challenge Task Templates — reusable library of challenge definitions per club.
 *
 * GET    /summit-stats/clubs/:id/challenge-templates       list club templates
 * POST   /summit-stats/clubs/:id/challenge-templates       create a template
 * PUT    /summit-stats/clubs/:id/challenge-templates/:tId  update a template
 * DELETE /summit-stats/clubs/:id/challenge-templates/:tId  delete a template
 * GET    /summit-stats/challenge-templates/global          list global SSTC templates (is_global=1)
 * POST   /summit-stats/challenge-templates/global          create a global template (admin/staff only)
 */
import pool from '../config/database.js';
import { parseFeatureFlags } from '../utils/bookClub.js';
import { canUserManageClub, getClubPlatformTenantAgencyId } from '../utils/sscClubAccess.js';

const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

async function assertClubAccess(req, clubId) {
  return canUserManageClub({ user: req.user, clubId });
}

const parseJsonField = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const VALID_MODES = new Set(['full_team', 'volunteer_or_elect', 'captain_assigns']);
const VALID_PROOF = new Set([
  'none',
  'screenshot',
  'manager_approval',
  'photo_required',
  'gps_or_photo',
  'gps_required_no_treadmill'
]);

const templateToApi = (row) => ({
  id:           Number(row.id),
  agencyId:     row.agency_id ? Number(row.agency_id) : null,
  name:         row.name,
  description:  row.description || null,
  icon:         row.icon || null,
  activityType: row.activity_type || null,
  criteriaJson: parseJsonField(row.criteria_json),
  proofPolicy:  row.proof_policy,
  mode:         row.mode,
  isSeasonLong: !!Number(row.is_season_long),
  isGlobal:     !!Number(row.is_global),
  isTenantTemplate: !!Number(row.is_tenant_template),
  aiGenerated:  !!Number(row.ai_generated),
  createdBy:    row.created_by ? Number(row.created_by) : null,
  createdAt:    row.created_at,
  updatedAt:    row.updated_at
});

const normalizeText = (value, maxLen = 64) => {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, maxLen) : null;
};

const normalizeTemplatePayload = (body = {}, existing = null) => {
  const name = 'name' in body ? String(body.name || '').trim() : existing?.name;
  const description = 'description' in body
    ? normalizeText(body.description, 4000)
    : existing?.description ?? null;
  const icon = 'icon' in body
    ? normalizeText(body.icon, 64)
    : existing?.icon ?? null;
  const activityType = 'activityType' in body
    ? normalizeText(body.activityType, 64)
    : existing?.activity_type ?? null;
  const criteriaJson = 'criteriaJson' in body
    ? (body.criteriaJson ? JSON.stringify(body.criteriaJson) : null)
    : existing?.criteria_json ?? null;
  const proofPolicy = VALID_PROOF.has(body?.proofPolicy) ? body.proofPolicy : (existing?.proof_policy || 'none');
  const mode = VALID_MODES.has(body?.mode) ? body.mode : (existing?.mode || 'volunteer_or_elect');
  const isSeasonLong = 'isSeasonLong' in body ? (body.isSeasonLong ? 1 : 0) : (existing?.is_season_long || 0);
  const aiGenerated = 'aiGenerated' in body ? (body.aiGenerated ? 1 : 0) : (existing?.ai_generated || 0);
  return {
    name,
    description,
    icon,
    activityType,
    criteriaJson,
    proofPolicy,
    mode,
    isSeasonLong,
    aiGenerated
  };
};

async function assertTenantTemplateWriteAccess(req, tenantAgencyId) {
  if (!tenantAgencyId) return false;
  if (req.user?.role === 'super_admin') return true;

  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [tenantAgencyId]
  );
  const flags = parseFeatureFlags(rows?.[0]?.feature_flags);
  if (
    (Object.prototype.hasOwnProperty.call(flags, 'ssc_tenant_challenge_library_write') && flags.ssc_tenant_challenge_library_write === false) ||
    (Object.prototype.hasOwnProperty.call(flags, 'ssc_tenant_award_manager_write') && flags.ssc_tenant_award_manager_write === false)
  ) {
    return false;
  }
  return true;
}

// ── LIST ──────────────────────────────────────────────────────────────────────

export const listTaskTemplates = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates
       WHERE agency_id = ?
         AND COALESCE(is_tenant_template, 0) = 0
         AND COALESCE(is_global, 0) = 0
       ORDER BY updated_at DESC, created_at DESC`,
      [clubId]
    );
    return res.json({ templates: (rows || []).map(templateToApi) });
  } catch (e) { next(e); }
};

// ── CREATE ────────────────────────────────────────────────────────────────────

export const createTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const payload = normalizeTemplatePayload(req.body);
    const name = payload.name;
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, is_global, is_tenant_template, name, description, icon, activity_type, criteria_json, proof_policy, mode, is_season_long, ai_generated, created_by)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clubId,
        name,
        payload.description,
        payload.icon,
        payload.activityType,
        payload.criteriaJson,
        payload.proofPolicy,
        payload.mode,
        payload.isSeasonLong,
        payload.aiGenerated,
        req.user.id
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────

export const updateTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const tId    = toInt(req.params.tId);
    if (!clubId || !tId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [existing] = await pool.execute(
      `SELECT * FROM challenge_task_templates
       WHERE id = ? AND agency_id = ?
         AND COALESCE(is_tenant_template, 0) = 0
         AND COALESCE(is_global, 0) = 0
       LIMIT 1`,
      [tId, clubId]
    );
    if (!existing?.length) return res.status(404).json({ error: { message: 'Template not found' } });
    const payload = normalizeTemplatePayload(req.body, existing[0]);
    if (!payload.name) return res.status(400).json({ error: { message: 'name is required' } });

    await pool.execute(
      `UPDATE challenge_task_templates
       SET name=?, description=?, icon=?, activity_type=?, criteria_json=?, proof_policy=?, mode=?, is_season_long=?, ai_generated=?
       WHERE id=?`,
      [
        payload.name,
        payload.description,
        payload.icon,
        payload.activityType,
        payload.criteriaJson,
        payload.proofPolicy,
        payload.mode,
        payload.isSeasonLong,
        payload.aiGenerated,
        tId
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`,
      [tId]
    );
    return res.json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

export const deleteTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const tId    = toInt(req.params.tId);
    if (!clubId || !tId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [result] = await pool.execute(
      `DELETE FROM challenge_task_templates
       WHERE id = ? AND agency_id = ?
         AND COALESCE(is_tenant_template, 0) = 0
         AND COALESCE(is_global, 0) = 0`,
      [tId, clubId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Template not found' } });
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── TENANT LIBRARY ───────────────────────────────────────────────────────────

export const listTenantTaskTemplates = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.json({ templates: [], tenantAgencyId: null });

    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates
       WHERE agency_id = ?
         AND COALESCE(is_tenant_template, 0) = 1
       ORDER BY name ASC, updated_at DESC`,
      [tenantAgencyId]
    );
    return res.json({ templates: (rows || []).map(templateToApi), tenantAgencyId });
  } catch (e) { next(e); }
};

export const createTenantTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantTemplateWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to add to tenant challenge library' } });
    }

    const payload = normalizeTemplatePayload(req.body);
    if (!payload.name) return res.status(400).json({ error: { message: 'name is required' } });

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, is_global, is_tenant_template, name, description, icon, activity_type, criteria_json, proof_policy, mode, is_season_long, ai_generated, created_by)
       VALUES (?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantAgencyId,
        payload.name,
        payload.description,
        payload.icon,
        payload.activityType,
        payload.criteriaJson,
        payload.proofPolicy,
        payload.mode,
        payload.isSeasonLong,
        payload.aiGenerated,
        req.user.id
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`, [result.insertId]);
    return res.status(201).json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};

export const updateTenantTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const tId = toInt(req.params.tId);
    if (!clubId || !tId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantTemplateWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to edit tenant challenge library' } });
    }

    const [existing] = await pool.execute(
      `SELECT * FROM challenge_task_templates
       WHERE id = ? AND agency_id = ? AND COALESCE(is_tenant_template, 0) = 1
       LIMIT 1`,
      [tId, tenantAgencyId]
    );
    if (!existing?.length) return res.status(404).json({ error: { message: 'Template not found' } });

    const payload = normalizeTemplatePayload(req.body, existing[0]);
    if (!payload.name) return res.status(400).json({ error: { message: 'name is required' } });

    await pool.execute(
      `UPDATE challenge_task_templates
       SET name=?, description=?, icon=?, activity_type=?, criteria_json=?, proof_policy=?, mode=?, is_season_long=?, ai_generated=?
       WHERE id=? AND agency_id=? AND COALESCE(is_tenant_template, 0) = 1`,
      [
        payload.name,
        payload.description,
        payload.icon,
        payload.activityType,
        payload.criteriaJson,
        payload.proofPolicy,
        payload.mode,
        payload.isSeasonLong,
        payload.aiGenerated,
        tId,
        tenantAgencyId
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`, [tId]);
    return res.json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};

export const deleteTenantTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const tId = toInt(req.params.tId);
    if (!clubId || !tId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });
    if (!(await assertTenantTemplateWriteAccess(req, tenantAgencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to delete from tenant challenge library' } });
    }

    const [result] = await pool.execute(
      `DELETE FROM challenge_task_templates
       WHERE id = ? AND agency_id = ? AND COALESCE(is_tenant_template, 0) = 1`,
      [tId, tenantAgencyId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Template not found' } });
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

export const cloneTenantTaskTemplate = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const tId = toInt(req.params.tId);
    if (!clubId || !tId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const tenantAgencyId = await getClubPlatformTenantAgencyId(clubId);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'No tenant found for this club' } });

    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates
       WHERE id = ? AND agency_id = ? AND COALESCE(is_tenant_template, 0) = 1
       LIMIT 1`,
      [tId, tenantAgencyId]
    );
    const source = rows?.[0];
    if (!source) return res.status(404).json({ error: { message: 'Template not found' } });

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, is_global, is_tenant_template, name, description, icon, activity_type, criteria_json, proof_policy, mode, is_season_long, ai_generated, created_by)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clubId,
        source.name,
        source.description || null,
        source.icon || null,
        source.activity_type || null,
        source.criteria_json || null,
        source.proof_policy || 'none',
        source.mode || 'volunteer_or_elect',
        Number(source.is_season_long || 0) ? 1 : 0,
        Number(source.ai_generated || 0) ? 1 : 0,
        req.user.id
      ]
    );
    const [createdRows] = await pool.execute(`SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`, [result.insertId]);
    return res.status(201).json({ template: templateToApi(createdRows[0]) });
  } catch (e) { next(e); }
};

// ── GLOBAL SSTC TEMPLATES ─────────────────────────────────────────────────────

export const listGlobalTemplates = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE is_global = 1 ORDER BY name ASC`
    );
    return res.json({ templates: (rows || []).map(templateToApi) });
  } catch (e) { next(e); }
};

export const createGlobalTemplate = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const allowed = ['super_admin', 'admin', 'staff'].includes(role);
    if (!allowed) return res.status(403).json({ error: { message: 'Admin access required' } });

    const payload = normalizeTemplatePayload(req.body);
    if (!payload.name) return res.status(400).json({ error: { message: 'name is required' } });

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, is_global, is_tenant_template, name, description, icon, activity_type, criteria_json, proof_policy, mode, is_season_long, ai_generated, created_by)
       VALUES (NULL, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.name,
        payload.description,
        payload.icon,
        payload.activityType,
        payload.criteriaJson,
        payload.proofPolicy,
        payload.mode,
        payload.isSeasonLong,
        payload.aiGenerated,
        req.user.id
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};
