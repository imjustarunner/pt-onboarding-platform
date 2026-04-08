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
import { canUserManageClub } from '../utils/sscClubAccess.js';

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
const VALID_PROOF = new Set(['none', 'screenshot', 'manager_approval']);

const templateToApi = (row) => ({
  id:           Number(row.id),
  agencyId:     row.agency_id ? Number(row.agency_id) : null,
  name:         row.name,
  description:  row.description || null,
  criteriaJson: parseJsonField(row.criteria_json),
  proofPolicy:  row.proof_policy,
  mode:         row.mode,
  isSeasonLong: !!Number(row.is_season_long),
  isGlobal:     !!Number(row.is_global),
  aiGenerated:  !!Number(row.ai_generated),
  createdBy:    row.created_by ? Number(row.created_by) : null,
  createdAt:    row.created_at,
  updatedAt:    row.updated_at
});

// ── LIST ──────────────────────────────────────────────────────────────────────

export const listTaskTemplates = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club id' } });
    if (!(await assertClubAccess(req, clubId))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE agency_id = ? ORDER BY created_at DESC`,
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

    const name        = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const description  = req.body?.description ? String(req.body.description).trim() : null;
    const criteriaJson = req.body?.criteriaJson ? JSON.stringify(req.body.criteriaJson) : null;
    const proofPolicy  = VALID_PROOF.has(req.body?.proofPolicy) ? req.body.proofPolicy : 'none';
    const mode         = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'volunteer_or_elect';
    const isSeasonLong = req.body?.isSeasonLong ? 1 : 0;
    const aiGenerated  = req.body?.aiGenerated ? 1 : 0;

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, name, description, criteria_json, proof_policy, mode, is_season_long, ai_generated, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clubId, name, description, criteriaJson, proofPolicy, mode, isSeasonLong, aiGenerated, req.user.id]
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
      `SELECT * FROM challenge_task_templates WHERE id = ? AND agency_id = ? LIMIT 1`,
      [tId, clubId]
    );
    if (!existing?.length) return res.status(404).json({ error: { message: 'Template not found' } });

    const name        = req.body?.name ? String(req.body.name).trim() : existing[0].name;
    const description = 'description' in req.body
      ? (req.body.description ? String(req.body.description).trim() : null)
      : existing[0].description;
    const criteriaJson = 'criteriaJson' in req.body
      ? (req.body.criteriaJson ? JSON.stringify(req.body.criteriaJson) : null)
      : existing[0].criteria_json;
    const proofPolicy = VALID_PROOF.has(req.body?.proofPolicy) ? req.body.proofPolicy : existing[0].proof_policy;
    const mode        = VALID_MODES.has(req.body?.mode) ? req.body.mode : existing[0].mode;
    const isSeasonLong = 'isSeasonLong' in req.body ? (req.body.isSeasonLong ? 1 : 0) : existing[0].is_season_long;

    await pool.execute(
      `UPDATE challenge_task_templates
       SET name=?, description=?, criteria_json=?, proof_policy=?, mode=?, is_season_long=?
       WHERE id=?`,
      [name, description, criteriaJson, proofPolicy, mode, isSeasonLong, tId]
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
      `DELETE FROM challenge_task_templates WHERE id = ? AND agency_id = ?`,
      [tId, clubId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Template not found' } });
    return res.json({ ok: true });
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

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const description  = req.body?.description ? String(req.body.description).trim() : null;
    const criteriaJson = req.body?.criteriaJson ? JSON.stringify(req.body.criteriaJson) : null;
    const proofPolicy  = VALID_PROOF.has(req.body?.proofPolicy) ? req.body.proofPolicy : 'none';
    const mode         = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'volunteer_or_elect';
    const isSeasonLong = req.body?.isSeasonLong ? 1 : 0;

    const [result] = await pool.execute(
      `INSERT INTO challenge_task_templates
       (agency_id, is_global, name, description, criteria_json, proof_policy, mode, is_season_long, created_by)
       VALUES (NULL, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, criteriaJson, proofPolicy, mode, isSeasonLong, req.user.id]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_task_templates WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ template: templateToApi(rows[0]) });
  } catch (e) { next(e); }
};
