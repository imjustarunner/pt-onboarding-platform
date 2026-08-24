/**
 * Sync ITSCO employee evaluation rubrics and attach them to job descriptions.
 * Run: node backend/src/seeds/syncItscoEmployeeEvaluations.js
 */
import pool from '../config/database.js';
import { ITSCO_EVALUATION_RUBRICS } from './itscoEmployeeEvaluationRubrics.js';
import {
  generateRubricFromJobDescription,
  templateSlugForJobDescription
} from '../services/jobDescriptionEvaluationTemplate.service.js';

async function resolveItscoAgencyId() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE organization_type = 'agency'
       AND (slug = 'itsco' OR LOWER(name) LIKE '%itsco%')
     ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id || null;
}

async function upsertTemplate({
  agencyId,
  slug,
  name,
  rubric,
  isSupervisorRubric = false,
  createdByUserId = 501
}) {
  const [existing] = await pool.execute(
    `SELECT id, version, rubric_json
     FROM employee_evaluation_templates
     WHERE agency_id = ? AND slug = ?
     ORDER BY version DESC
     LIMIT 1`,
    [agencyId, slug]
  );
  const latest = existing?.[0] || null;
  const rubricJson = JSON.stringify(rubric);

  if (latest) {
    const same =
      JSON.stringify(typeof latest.rubric_json === 'string'
        ? JSON.parse(latest.rubric_json)
        : latest.rubric_json) === rubricJson;
    if (same) {
      await pool.execute(
        `UPDATE employee_evaluation_templates
         SET name = ?, is_supervisor_rubric = ?, is_active = 1
         WHERE id = ?`,
        [name, isSupervisorRubric ? 1 : 0, latest.id]
      );
      return { id: latest.id, version: latest.version, created: false };
    }
    const nextVersion = Number(latest.version || 1) + 1;
    const [ins] = await pool.execute(
      `INSERT INTO employee_evaluation_templates
        (agency_id, slug, name, version, rubric_json, is_supervisor_rubric, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [agencyId, slug, name, nextVersion, rubricJson, isSupervisorRubric ? 1 : 0, createdByUserId]
    );
    return { id: ins.insertId, version: nextVersion, created: true };
  }

  const [ins] = await pool.execute(
    `INSERT INTO employee_evaluation_templates
      (agency_id, slug, name, version, rubric_json, is_supervisor_rubric, is_active, created_by_user_id)
     VALUES (?, ?, ?, 1, ?, ?, 1, ?)`,
    [agencyId, slug, name, rubricJson, isSupervisorRubric ? 1 : 0, createdByUserId]
  );
  return { id: ins.insertId, version: 1, created: true };
}

function matchRubricKey(jobTitle = '') {
  const title = String(jobTitle || '');
  for (const [key, def] of Object.entries(ITSCO_EVALUATION_RUBRICS)) {
    if (def.isSupervisorRubric) continue;
    const excluded = (def.excludeJobPatterns || []).some((p) => p.test(title));
    if (excluded) continue;
    if ((def.matchJobPatterns || []).some((p) => p.test(title))) return key;
  }
  return null;
}

async function attachPrimaryTemplate({ agencyId, jobDescriptionId, templateId }) {
  await pool.execute(
    `DELETE FROM hiring_job_evaluation_templates
     WHERE agency_id = ? AND job_description_id = ? AND is_primary = 1`,
    [agencyId, jobDescriptionId]
  );
  await pool.execute(
    `INSERT INTO hiring_job_evaluation_templates
      (agency_id, job_description_id, template_id, is_primary, sort_order)
     VALUES (?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE is_primary = 1, sort_order = 0`,
    [agencyId, jobDescriptionId, templateId]
  );
}

export async function syncItscoEmployeeEvaluations({
  agencyId: forcedAgencyId = null,
  createdByUserId = 501
} = {}) {
  const agencyId = forcedAgencyId || (await resolveItscoAgencyId());
  if (!agencyId) throw new Error('ITSCO agency not found');

  const templateIdsBySlug = {};
  for (const def of Object.values(ITSCO_EVALUATION_RUBRICS)) {
    const row = await upsertTemplate({
      agencyId,
      slug: def.slug,
      name: def.name,
      rubric: def.rubric,
      isSupervisorRubric: !!def.isSupervisorRubric,
      createdByUserId
    });
    templateIdsBySlug[def.slug] = row.id;
  }

  const [jobs] = await pool.execute(
    `SELECT id, title, description_text, description_sections_json
     FROM hiring_job_descriptions
     WHERE agency_id = ?
     ORDER BY id ASC`,
    [agencyId]
  );

  const results = [];
  for (const job of jobs || []) {
    const matchedKey = matchRubricKey(job.title);
    let templateId;
    let source;
    if (matchedKey) {
      templateId = templateIdsBySlug[ITSCO_EVALUATION_RUBRICS[matchedKey].slug];
      source = matchedKey;
    } else {
      const slug = templateSlugForJobDescription(job);
      const rubric = generateRubricFromJobDescription(job);
      const row = await upsertTemplate({
        agencyId,
        slug,
        name: rubric.title,
        rubric,
        isSupervisorRubric: false,
        createdByUserId
      });
      templateId = row.id;
      source = 'generated_from_jd';
    }
    await attachPrimaryTemplate({
      agencyId,
      jobDescriptionId: job.id,
      templateId
    });
    results.push({
      jobDescriptionId: job.id,
      title: job.title,
      templateId,
      source
    });
  }

  return {
    agencyId,
    templatesSeeded: Object.keys(templateIdsBySlug).length,
    jobsAttached: results.length,
    results
  };
}

const isMain = process.argv[1]?.includes('syncItscoEmployeeEvaluations');
if (isMain) {
  syncItscoEmployeeEvaluations()
    .then((out) => {
      console.log('Synced ITSCO employee evaluations:', JSON.stringify(out, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default syncItscoEmployeeEvaluations;
