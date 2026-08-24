/**
 * Sync ITSCO hiring job descriptions + per-JD contract clauses.
 *
 * - Loads structured text sections (not PDF) into hiring_job_descriptions
 * - Clears storage_path / mime_type so postings use description_text + sections
 * - Only JD ids 15, 16, 17 remain active (originally active before batch sync)
 * - All other batch jobs are stored inactive with full content + contract clauses
 *
 * Run: node backend/src/seeds/syncItscoHiringJobsAndClauses.js
 */
import pool from '../config/database.js';
import { ITSCO_HIRING_JOBS_BATCH } from './itscoHiringJobsBatch.js';
import {
  ITSCO_HIRING_JOB_SECTIONS,
  buildPostingTextFromSections
} from './itscoHiringJobSections.js';
import { mdToHtml } from './itscoContractClauseLibrary.js';
import {
  buildJobDescClauseMarkdown,
  clauseKeyForJobDescriptionId
} from '../services/jobDescriptionContractClause.service.js';
import { sanitizeJobDescriptionSections } from '../utils/jobDescriptionSectionsSanitize.js';

/** ITSCO jobs that were already active in the app before this batch — only these stay live. */
const KEEP_ACTIVE_JD_IDS = new Set([15, 16, 17]);

async function resolveItscoAgencyId() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE organization_type = 'agency'
       AND (slug = 'itsco' OR LOWER(name) LIKE '%itsco%')
     ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id || null;
}

async function loadConfigSlugMap(agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, slug FROM contract_configs WHERE agency_id = ?`,
    [agencyId]
  );
  return new Map((rows || []).map((r) => [r.slug, r.id]));
}

async function loadExistingJds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT jd.*, COUNT(hp.id) AS profile_count
     FROM hiring_job_descriptions jd
     LEFT JOIN hiring_profiles hp ON hp.job_description_id = jd.id
     WHERE jd.agency_id = ?
     GROUP BY jd.id`,
    [agencyId]
  );
  return rows || [];
}

function findBestJdMatch(batch, existingRows) {
  if (batch.preferJdIds?.length) {
    for (const id of batch.preferJdIds) {
      const hit = existingRows.find((r) => Number(r.id) === Number(id));
      if (hit) return hit;
    }
  }
  const patterns = batch.matchTitlePatterns || [];
  const city = String(batch.city || '').trim().toLowerCase();
  const candidates = existingRows.filter((row) => {
    const blob = `${row.title || ''} ${row.city || ''}`.toLowerCase();
    const cityOk = !city || blob.includes(city);
    return cityOk && patterns.some((p) => p.test(blob) || p.test(String(row.title || '')));
  });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const pc = Number(b.profile_count || 0) - Number(a.profile_count || 0);
    if (pc !== 0) return pc;
    return Number(b.is_active || 0) - Number(a.is_active || 0);
  })[0];
}

async function upsertJdClause({ agencyId, jobDescriptionId, batch }) {
  const clauseKey = clauseKeyForJobDescriptionId(jobDescriptionId);
  const bodyMd = buildJobDescClauseMarkdown({
    responsibilityBullets: batch.responsibilityBullets,
    includeServiceExpectations: !!batch.includeServiceExpectations
  });
  const bodyHtml = mdToHtml(bodyMd);
  await pool.execute(
    `INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
     VALUES (?, ?, 'Duties and Responsibilities', ?, 40, 1)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body_html = VALUES(body_html),
       sort_hint = VALUES(sort_hint),
       is_active = 1`,
    [agencyId, clauseKey, bodyHtml]
  );
  return clauseKey;
}

function resolveJobContent(batch) {
  const sections = sanitizeJobDescriptionSections(ITSCO_HIRING_JOB_SECTIONS[batch.syncKey]);
  const postingText = buildPostingTextFromSections(batch, sections);
  return { sections, postingText };
}

async function linkJd({ jdId, clauseKey, configId, batch }) {
  const { sections, postingText } = resolveJobContent(batch);
  const isActive = KEEP_ACTIVE_JD_IDS.has(Number(jdId)) ? 1 : 0;

  await pool.execute(
    `UPDATE hiring_job_descriptions
     SET description_text = ?,
         description_sections_json = ?,
         storage_path = NULL,
         original_name = NULL,
         mime_type = NULL,
         city = ?,
         state = ?,
         role_type = ?,
         tags_json = ?,
         job_desc_clause_key = ?,
         default_contract_config_id = ?,
         is_active = ?
     WHERE id = ?
     LIMIT 1`,
    [
      postingText || null,
      sections ? JSON.stringify(sections) : null,
      batch.city || null,
      batch.state || null,
      batch.roleType || null,
      batch.tags?.length ? JSON.stringify(batch.tags) : null,
      clauseKey,
      configId || null,
      isActive,
      jdId
    ]
  );
}

async function createJd({ agencyId, batch, createdByUserId }) {
  const { sections, postingText } = resolveJobContent(batch);
  const [result] = await pool.execute(
    `INSERT INTO hiring_job_descriptions (
       agency_id, title, description_text, description_sections_json,
       city, state, role_type, tags_json,
       storage_path, original_name, mime_type,
       is_active, created_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?)`,
    [
      agencyId,
      batch.title,
      postingText || null,
      sections ? JSON.stringify(sections) : null,
      batch.city || null,
      batch.state || null,
      batch.roleType || null,
      batch.tags?.length ? JSON.stringify(batch.tags) : null,
      createdByUserId || 501
    ]
  );
  return result.insertId;
}

export async function syncItscoHiringJobsAndClauses({ agencyId: forcedAgencyId, createdByUserId = 501 } = {}) {
  const agencyId = forcedAgencyId || (await resolveItscoAgencyId());
  if (!agencyId) throw new Error('ITSCO agency not found');

  const configBySlug = await loadConfigSlugMap(agencyId);
  const existingRows = await loadExistingJds(agencyId);
  const canonicalIds = [];
  const results = [];

  for (const batch of ITSCO_HIRING_JOBS_BATCH) {
    const configId = configBySlug.get(batch.defaultConfigSlug) || null;
    let jd = findBestJdMatch(batch, existingRows);
    let jdId;
    let created = false;

    if (jd) {
      jdId = jd.id;
    } else {
      jdId = await createJd({ agencyId, batch, createdByUserId });
      created = true;
      jd = { id: jdId };
      existingRows.push({ ...jd, profile_count: 0 });
    }

    const clauseKey = await upsertJdClause({ agencyId, jobDescriptionId: jdId, batch });
    await linkJd({ jdId, clauseKey, configId, batch });

    canonicalIds.push(jdId);
    results.push({
      syncKey: batch.syncKey,
      jobDescriptionId: jdId,
      clauseKey,
      configId,
      created,
      isActive: KEEP_ACTIVE_JD_IDS.has(Number(jdId)),
      title: batch.title
    });
  }

  // Deactivate legacy duplicate rows outside this canonical batch
  if (canonicalIds.length) {
    const placeholders = canonicalIds.map(() => '?').join(',');
    const [deactivated] = await pool.execute(
      `UPDATE hiring_job_descriptions
       SET is_active = 0
       WHERE agency_id = ?
         AND id NOT IN (${placeholders})
         AND is_active = 1`,
      [agencyId, ...canonicalIds]
    );
    results.deactivatedCount = deactivated.affectedRows || 0;
  }

  return {
    agencyId,
    canonicalIds,
    activeIds: [...KEEP_ACTIVE_JD_IDS],
    results
  };
}

const isMain = process.argv[1]?.includes('syncItscoHiringJobsAndClauses');
if (isMain) {
  syncItscoHiringJobsAndClauses()
    .then((out) => {
      console.log('Synced ITSCO hiring jobs + clauses:', JSON.stringify(out, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default syncItscoHiringJobsAndClauses;
