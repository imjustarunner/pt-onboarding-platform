/**
 * Contract CRUD + generate/assign for pre-hire candidates.
 */
import pool from '../config/database.js';
import {
  autofillTokensForCandidate,
  renderContractHtml,
  getAgencyBuilderDefaults,
  inferCompensationFromCredential
} from './contractMerge.service.js';
import PayrollCompensationLevel, { COMPENSATION_CATEGORIES } from '../models/PayrollCompensationLevel.model.js';

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function listTemplates(agencyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM contract_templates WHERE agency_id = ? ORDER BY name ASC`,
    [agencyId]
  );
  return rows;
}

export async function createTemplate(agencyId, data, userId) {
  const [result] = await pool.execute(
    `INSERT INTO contract_templates (agency_id, name, font_family, letterhead_template_id, css_extras, is_active, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [
      agencyId,
      String(data.name || 'Contract template').slice(0, 255),
      data.fontFamily || data.font_family || null,
      data.letterheadTemplateId || data.letterhead_template_id || null,
      data.cssExtras || data.css_extras || null,
      userId || null
    ]
  );
  const [rows] = await pool.execute(`SELECT * FROM contract_templates WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function updateTemplate(agencyId, id, data) {
  await pool.execute(
    `UPDATE contract_templates
     SET name = COALESCE(?, name),
         font_family = COALESCE(?, font_family),
         letterhead_template_id = COALESCE(?, letterhead_template_id),
         css_extras = COALESCE(?, css_extras),
         is_active = COALESCE(?, is_active)
     WHERE id = ? AND agency_id = ?`,
    [
      data.name ?? null,
      data.fontFamily ?? data.font_family ?? null,
      data.letterheadTemplateId ?? data.letterhead_template_id ?? null,
      data.cssExtras ?? data.css_extras ?? null,
      data.isActive == null && data.is_active == null ? null : (data.isActive ?? data.is_active ? 1 : 0),
      id,
      agencyId
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM contract_templates WHERE id = ? AND agency_id = ?`,
    [id, agencyId]
  );
  return rows[0] || null;
}

export async function listClauses(agencyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM contract_clauses WHERE agency_id = ? ORDER BY sort_hint ASC, title ASC`,
    [agencyId]
  );
  return rows;
}

export async function createClause(agencyId, data, userId) {
  const [result] = await pool.execute(
    `INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [
      agencyId,
      String(data.clauseKey || data.clause_key || '').trim().toUpperCase().slice(0, 64),
      String(data.title || 'Clause').slice(0, 255),
      data.bodyHtml || data.body_html || '',
      Number(data.sortHint ?? data.sort_hint ?? 0) || 0,
      userId || null
    ]
  );
  const [rows] = await pool.execute(`SELECT * FROM contract_clauses WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function updateClause(agencyId, id, data) {
  await pool.execute(
    `UPDATE contract_clauses
     SET title = COALESCE(?, title),
         body_html = COALESCE(?, body_html),
         sort_hint = COALESCE(?, sort_hint),
         is_active = COALESCE(?, is_active)
     WHERE id = ? AND agency_id = ?`,
    [
      data.title ?? null,
      data.bodyHtml ?? data.body_html ?? null,
      data.sortHint ?? data.sort_hint ?? null,
      data.isActive == null && data.is_active == null ? null : (data.isActive ?? data.is_active ? 1 : 0),
      id,
      agencyId
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM contract_clauses WHERE id = ? AND agency_id = ?`,
    [id, agencyId]
  );
  return rows[0] || null;
}

export async function listConfigs(agencyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM contract_configs WHERE agency_id = ? ORDER BY name ASC`,
    [agencyId]
  );
  return (rows || []).map((r) => ({
    ...r,
    clause_keys: parseJsonArray(r.clause_keys_json)
  }));
}

export async function createConfig(agencyId, data, userId) {
  const clauseKeys = data.clauseKeys || data.clause_keys || [];
  const [result] = await pool.execute(
    `INSERT INTO contract_configs
      (agency_id, name, slug, contract_template_id, pay_mode, rate_config_key, clause_keys_json, is_active, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      agencyId,
      String(data.name || 'Config').slice(0, 255),
      String(data.slug || data.name || 'config')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 80),
      data.contractTemplateId || data.contract_template_id || null,
      ['hourly', 'ffs', 'none'].includes(data.payMode || data.pay_mode)
        ? (data.payMode || data.pay_mode)
        : 'hourly',
      data.rateConfigKey || data.rate_config_key || null,
      JSON.stringify(clauseKeys),
      userId || null
    ]
  );
  const [rows] = await pool.execute(`SELECT * FROM contract_configs WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function updateConfig(agencyId, id, data) {
  const clauseKeys = data.clauseKeys ?? data.clause_keys;
  await pool.execute(
    `UPDATE contract_configs
     SET name = COALESCE(?, name),
         contract_template_id = COALESCE(?, contract_template_id),
         pay_mode = COALESCE(?, pay_mode),
         rate_config_key = COALESCE(?, rate_config_key),
         clause_keys_json = COALESCE(?, clause_keys_json),
         is_active = COALESCE(?, is_active)
     WHERE id = ? AND agency_id = ?`,
    [
      data.name ?? null,
      data.contractTemplateId ?? data.contract_template_id ?? null,
      data.payMode ?? data.pay_mode ?? null,
      data.rateConfigKey ?? data.rate_config_key ?? null,
      clauseKeys == null ? null : JSON.stringify(clauseKeys),
      data.isActive == null && data.is_active == null ? null : (data.isActive ?? data.is_active ? 1 : 0),
      id,
      agencyId
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM contract_configs WHERE id = ? AND agency_id = ?`,
    [id, agencyId]
  );
  return rows[0] || null;
}

export async function listContractBuilderCandidates(agencyId, { q = '', limit = 250 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 250, 1), 500);
  const params = [agencyId];
  let searchSql = '';
  if (String(q || '').trim()) {
    searchSql = ` AND (
      u.first_name LIKE ?
      OR u.last_name LIKE ?
      OR u.email LIKE ?
      OR u.personal_email LIKE ?
      OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
    )`;
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like, like, like);
  }

  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.first_name,
       u.last_name,
       u.email,
       u.personal_email,
       u.status,
       u.credential,
       hp.stage,
       hp.applied_role,
       hp.job_description_id,
       jd.title AS job_title,
       jd.role_type AS job_role_type
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     LEFT JOIN hiring_profiles hp ON hp.id = (
       SELECT hp_latest.id
       FROM hiring_profiles hp_latest
       WHERE hp_latest.candidate_user_id = u.id
       ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
       LIMIT 1
     )
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
     WHERE u.is_active = TRUE
       AND u.role NOT IN ('client_guardian', 'client', 'guardian')
       AND (
         hp.candidate_user_id IS NOT NULL
         OR u.status IN ('PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW')
       )
       AND (
         hp.id IS NULL
         OR LOWER(COALESCE(hp.stage, 'applied')) NOT IN ('not_hired')
       )
       ${searchSql}
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT ${max}`,
    params
  );

  return (rows || []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.personal_email || r.email,
    status: r.status,
    stage: r.stage,
    credential: r.credential,
    jobTitle: r.job_title || r.applied_role || null,
    jobDescriptionId: r.job_description_id || null,
    roleType: r.job_role_type || null,
    label: `${r.first_name || ''} ${r.last_name || ''}`.trim()
      + (r.job_title ? ` — ${r.job_title}` : '')
  }));
}

export async function getCandidateWizardContext({
  agencyId,
  candidateUserId,
  credentialOverride = null,
  officeLocationId = null
}) {
  const [templates, configs, compensationLevels, agencyDefaults, tokens] = await Promise.all([
    listTemplates(agencyId),
    listConfigs(agencyId),
    PayrollCompensationLevel.listForAgency(agencyId),
    getAgencyBuilderDefaults(agencyId),
    autofillTokensForCandidate({
      agencyId,
      candidateUserId,
      credentialOverride,
      officeLocationId
    })
  ]);

  const jobDescClauses = (await listClauses(agencyId))
    .filter((c) => String(c.clause_key || '').startsWith('JOB_DESC_'))
    .map((c) => ({ key: c.clause_key, title: c.title }));

  const defaultConfigId = tokens.DEFAULT_CONFIG_ID
    ? Number(tokens.DEFAULT_CONFIG_ID)
    : (configs[0]?.id || null);

  const payInference = inferCompensationFromCredential({
    credential: credentialOverride || tokens.CREDENTIAL,
    jobTitle: tokens.JOB_TITLE,
    role: tokens.ROLE_TYPE
  });

  return {
    templates,
    configs,
    compensationLevels: compensationLevels.filter((r) => r.label || r.direct_rate != null || r.indirect_rate != null || r.ffs_rate != null),
    compensationCategories: COMPENSATION_CATEGORIES,
    jobDescClauses,
    agency: agencyDefaults.agency,
    offices: agencyDefaults.offices,
    credentialOptions: agencyDefaults.credentialOptions,
    tokens,
    payInference,
    suggested: {
      templateId: templates[0]?.id || null,
      configId: defaultConfigId,
      compensationCategory: Number(tokens.COMPENSATION_CATEGORY) || payInference.compensationCategory || 3,
      compensationLevel: Number(tokens.COMPENSATION_LEVEL) || payInference.compensationLevel || 1,
      jobDescClauseKey: tokens.JOB_DESC_CLAUSE_KEY || 'JOB_DESC_LPC',
      credential: tokens.CREDENTIAL || '',
      credentialKey: tokens.CREDENTIAL_KEY || payInference.credentialKey || '',
      officeLocationId: tokens.ASSIGNED_OFFICE_ID ? Number(tokens.ASSIGNED_OFFICE_ID) : null
    }
  };
}

export async function previewCandidateContract({
  agencyId,
  candidateUserId,
  configId,
  templateId,
  tokens = {},
  compensationCategory,
  compensationLevel,
  jobDescClauseKey,
  credentialOverride = null,
  officeLocationId = null
}) {
  const autofill = await autofillTokensForCandidate({
    agencyId,
    candidateUserId,
    credentialOverride,
    officeLocationId
  });
  const merged = { ...autofill, ...tokens };
  const rendered = await renderContractHtml({
    agencyId,
    configId,
    templateId,
    tokens: merged,
    compensationCategory: compensationCategory || Number(merged.COMPENSATION_CATEGORY),
    compensationLevel: compensationLevel || Number(merged.COMPENSATION_LEVEL),
    jobDescClauseKey: jobDescClauseKey || merged.JOB_DESC_CLAUSE_KEY
  });
  return { ...rendered, tokens: merged };
}

export async function generateAndAssignCandidateContract({
  agencyId,
  candidateUserId,
  configId,
  templateId,
  tokens = {},
  compensationCategory,
  compensationLevel,
  jobDescClauseKey,
  credentialOverride = null,
  officeLocationId = null,
  createdByUserId,
  title,
  taskDescription = 'Please review and sign your employment agreement.',
  documentDescription = 'Generated employment contract',
  taskMetadata = {}
}) {
  const preview = await previewCandidateContract({ agencyId, candidateUserId, configId, templateId,
    tokens, compensationCategory, compensationLevel, jobDescClauseKey, credentialOverride, officeLocationId });
  if (preview.unresolvedTokens?.length) {
    throw Object.assign(new Error(`Complete these contract fields before assigning: ${preview.unresolvedTokens.join(', ')}`), { status: 400 });
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [candidateUserId]);
    const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ?', [candidateUserId, agencyId]);
    if (!membership) throw Object.assign(new Error('Candidate does not belong to this organization.'), { status: 403 });
    const [existingRows] = await db.execute(
      `SELECT g.*, t.status AS task_status, t.metadata AS task_metadata FROM contract_generations g JOIN tasks t ON t.id = g.task_id
       WHERE g.candidate_user_id = ? AND g.agency_id = ? AND t.status NOT IN ('archived', 'overridden', 'deleted')
       ORDER BY g.id DESC`, [candidateUserId, agencyId]);
    const isAmendment = taskMetadata.source === 'provider_update';
    const existing = existingRows.filter((g) => {
      let meta = g.task_metadata || {};
      try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch { meta = {}; }
      return isAmendment ? meta.source === 'provider_update' && meta.pushId === (taskMetadata.pushId || null)
        : meta.source !== 'provider_update';
    });
    const identical = existing.find((g) => g.rendered_html === preview.html);
    if (identical) {
      const [[task]] = await db.execute('SELECT * FROM tasks WHERE id = ?', [identical.task_id]);
      await db.commit();
      return { reused: true, generationId: identical.id, task, html: identical.rendered_html,
        userSpecificDocumentId: identical.user_specific_document_id, unresolvedTokens: [] };
    }
    if (existing.some((g) => g.task_status === 'completed')) {
      throw Object.assign(new Error('An agreement is already signed. Preserve that agreement and issue a separate amendment through Documents.'), { status: 409 });
    }
    if (!isAmendment && !['PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN'].includes(user?.status)) {
      throw Object.assign(new Error('Reopen pre-hire before changing the employment agreement.'), { status: 409 });
    }
    const name = title || `Employment Agreement — ${preview.tokens.EMPLOYEE_FULL_NAME || 'Candidate'}`;
    const [document] = await db.execute(
      `INSERT INTO user_specific_documents (user_id, name, description, template_type, html_content,
       document_action_type, field_definitions, created_by_user_id) VALUES (?, ?, ?, 'html', ?, 'signature', ?, ?)`,
      [candidateUserId, name, documentDescription, preview.html,
        JSON.stringify([{ type: 'signature', label: 'Employee signature', required: true }]), createdByUserId || null]);
    const metadata = { ...taskMetadata, contractGeneration: true, portalPhase: isAmendment ? 'ongoing' : 'pre_hire',
      contractConfigId: configId, jobDescClauseKey: jobDescClauseKey || preview.tokens.JOB_DESC_CLAUSE_KEY || null,
      jobDescriptionId: preview.tokens.JOB_DESCRIPTION_ID || null };
    const [assignment] = await db.execute(
      `INSERT INTO tasks (task_type, document_action_type, title, description, assigned_to_user_id,
       assigned_to_agency_id, assigned_by_user_id, reference_id, metadata, status, is_required)
       VALUES ('document', 'signature', ?, ?, ?, ?, ?, ?, ?, 'pending', 1)`,
      [name, taskDescription, candidateUserId, agencyId, createdByUserId || null, document.insertId, JSON.stringify(metadata)]);
    await db.execute('UPDATE user_specific_documents SET task_id = ? WHERE id = ?', [assignment.insertId, document.insertId]);
    const [generation] = await db.execute(
      `INSERT INTO contract_generations (agency_id, candidate_user_id, config_id, template_id, token_values_json,
       rendered_html, user_specific_document_id, task_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, candidateUserId, configId, templateId || preview.template?.id || null, JSON.stringify(preview.tokens),
        preview.html, document.insertId, assignment.insertId, createdByUserId || null]);
    // Supersede only unsigned agreements, retaining all generations for staff audit.
    for (const old of existing) await db.execute("UPDATE tasks SET status = 'overridden' WHERE id = ? AND status != 'completed'", [old.task_id]);
    const [[task]] = await db.execute('SELECT * FROM tasks WHERE id = ?', [assignment.insertId]);
    await db.commit();
    return { generationId: generation.insertId, task, userSpecificDocumentId: document.insertId,
      html: preview.html, unresolvedTokens: [], replacedCount: existing.length };
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}

export default {
  listTemplates,
  createTemplate,
  updateTemplate,
  listClauses,
  createClause,
  updateClause,
  listConfigs,
  createConfig,
  updateConfig,
  previewCandidateContract,
  generateAndAssignCandidateContract,
  getCandidateWizardContext,
  listContractBuilderCandidates
};
