/**
 * Provider Update amendments tied to each employee's job description clause.
 */
import pool from '../config/database.js';
import { clauseKeyForJobDescriptionId } from './jobDescriptionContractClause.service.js';
import { generateAndAssignCandidateContract } from './contractGenerator.service.js';

export const DEFAULT_JD_ACK_CONFIG_SLUG = 'itsco_job_description_acknowledgment_addendum';

function formatEffectiveDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const d = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Resolve the job description + clause key for an active employee.
 * Order: hiring profile JD → exact title match → fuzzy title match → fallback clause.
 */
export async function resolveJobDescriptionForUser({ agencyId, userId }) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) {
    return {
      jobDescriptionId: null,
      jobDescClauseKey: 'JOB_DESC_LPC',
      jobTitle: '',
      source: 'missing'
    };
  }

  const [userRows] = await pool.execute(
    `SELECT id, title, service_focus FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const user = userRows?.[0] || null;
  const userTitle = String(user?.title || '').trim();

  const [hpRows] = await pool.execute(
    `SELECT hp.job_description_id, hp.applied_role, hp.job_acknowledged,
            jd.id AS jd_id, jd.title AS jd_title, jd.job_desc_clause_key, jd.is_active
     FROM hiring_profiles hp
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
     WHERE hp.candidate_user_id = ?
     ORDER BY hp.updated_at DESC, hp.id DESC
     LIMIT 1`,
    [uid]
  );
  const hp = hpRows?.[0] || null;
  if (hp?.job_description_id) {
    return {
      jobDescriptionId: Number(hp.job_description_id),
      jobDescClauseKey: hp.job_desc_clause_key || clauseKeyForJobDescriptionId(hp.job_description_id),
      jobTitle: hp.jd_title || hp.applied_role || userTitle,
      jobAcknowledged: !!(hp.job_acknowledged === 1 || hp.job_acknowledged === true),
      source: 'hiring_profile'
    };
  }

  if (userTitle) {
    const [exact] = await pool.execute(
      `SELECT id, title, job_desc_clause_key
       FROM hiring_job_descriptions
       WHERE agency_id = ? AND title = ?
       ORDER BY is_active DESC, updated_at DESC, id DESC
       LIMIT 1`,
      [aid, userTitle]
    );
    if (exact?.[0]?.id) {
      const jd = exact[0];
      return {
        jobDescriptionId: Number(jd.id),
        jobDescClauseKey: jd.job_desc_clause_key || clauseKeyForJobDescriptionId(jd.id),
        jobTitle: jd.title || userTitle,
        jobAcknowledged: false,
        source: 'title_exact'
      };
    }

    const [allJds] = await pool.execute(
      `SELECT id, title, job_desc_clause_key
       FROM hiring_job_descriptions
       WHERE agency_id = ?
       ORDER BY is_active DESC, updated_at DESC, id ASC`,
      [aid]
    );
    const ut = userTitle.toLowerCase();
    for (const jd of allJds || []) {
      const jdTitle = String(jd.title || '').trim();
      if (!jdTitle) continue;
      const base = jdTitle.split(' - ')[0].toLowerCase();
      if (ut === jdTitle.toLowerCase() || ut.includes(base) || base.includes(ut)) {
        return {
          jobDescriptionId: Number(jd.id),
          jobDescClauseKey: jd.job_desc_clause_key || clauseKeyForJobDescriptionId(jd.id),
          jobTitle: jdTitle,
          jobAcknowledged: false,
          source: 'title_fuzzy'
        };
      }
    }
  }

  return {
    jobDescriptionId: null,
    jobDescClauseKey: 'JOB_DESC_LPC',
    jobTitle: userTitle,
    jobAcknowledged: false,
    source: 'fallback'
  };
}

async function resolveContractConfig({ agencyId, slug }) {
  const configSlug = String(slug || DEFAULT_JD_ACK_CONFIG_SLUG).trim();
  const [rows] = await pool.execute(
    `SELECT id, slug, contract_template_id
     FROM contract_configs
     WHERE agency_id = ? AND slug = ? AND is_active = 1
     LIMIT 1`,
    [Number(agencyId), configSlug]
  );
  return rows?.[0] || null;
}

export function isJobDescriptionAcknowledgmentPlan(amendmentPlan) {
  if (!amendmentPlan || typeof amendmentPlan !== 'object') return false;
  const mode = String(amendmentPlan.mode || '').trim().toLowerCase();
  if (mode === 'job_description_acknowledgment' || mode === 'jd_acknowledgment') return true;
  if (amendmentPlan.contractConfigSlug || amendmentPlan.contractConfigId) return true;
  return false;
}

/**
 * Render and assign a per-employee JD acknowledgment amendment for Provider Update.
 */
export async function assignJobDescriptionAcknowledgmentAmendment({
  agencyId,
  userId,
  amendmentPlan = {},
  pushId = null,
  createdByUserId = null
}) {
  const jd = await resolveJobDescriptionForUser({ agencyId, userId });
  const configSlug = amendmentPlan.contractConfigSlug || DEFAULT_JD_ACK_CONFIG_SLUG;
  const config = await resolveContractConfig({ agencyId, slug: configSlug });
  if (!config?.id) {
    throw new Error(`Contract config not found: ${configSlug}. Run syncItscoContractLibrary.js`);
  }

  const effectiveDate = formatEffectiveDate(amendmentPlan.effectiveDate);
  const employeeName = await pool.execute(
    `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [Number(userId)]
  ).then(([rows]) => rows?.[0] || {});

  const title =
    amendmentPlan.title
    || `Job Description Acknowledgment — ${jd.jobTitle || `${employeeName.first_name || ''} ${employeeName.last_name || ''}`.trim()}`;

  const result = await generateAndAssignCandidateContract({
    agencyId,
    candidateUserId: Number(userId),
    configId: config.id,
    templateId: config.contract_template_id || null,
    jobDescClauseKey: jd.jobDescClauseKey,
    createdByUserId,
    title,
    tokens: {
      EFFECTIVE_DATE: effectiveDate,
      EXECUTION_DATE: effectiveDate
    },
    taskDescription:
      'Please review and sign this addendum acknowledging your current Job Description duties.',
    documentDescription: 'Provider Update — Job Description acknowledgment addendum',
    taskMetadata: {
      source: 'provider_update',
      pushId: pushId ? Number(pushId) : null,
      effectiveDate: amendmentPlan.effectiveDate || null,
      amendmentMode: 'job_description_acknowledgment',
      jobDescriptionId: jd.jobDescriptionId,
      jobDescClauseKey: jd.jobDescClauseKey,
      jobDescriptionResolution: jd.source
    }
  });

  return { ...result, jobDescription: jd };
}

export async function listAmendmentTasksForRecipient({ userId, pushId }) {
  const uid = Number(userId || 0);
  const pid = Number(pushId || 0);
  if (!uid || !pid) return [];
  const [rows] = await pool.execute(
    `SELECT id, title, status, due_date, completed_at, metadata
     FROM tasks
     WHERE assigned_to_user_id = ?
       AND task_type = 'document'
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) = 'provider_update'
       AND CAST(JSON_EXTRACT(metadata, '$.pushId') AS UNSIGNED) = ?
     ORDER BY id DESC`,
    [uid, pid]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    amendmentMode: (() => {
      try {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        return meta?.amendmentMode || null;
      } catch {
        return null;
      }
    })()
  }));
}

export default {
  resolveJobDescriptionForUser,
  assignJobDescriptionAcknowledgmentAmendment,
  listAmendmentTasksForRecipient,
  isJobDescriptionAcknowledgmentPlan,
  DEFAULT_JD_ACK_CONFIG_SLUG
};
