import pool from '../config/database.js';
import { portalPacket } from './hirePortalWorkflow.service.js';
import { mergePrehireDocuments } from '../utils/prehireConfigSanitize.js';
import { sanitizeJobDescriptionSections } from '../utils/jobDescriptionSectionsSanitize.js';

export async function resolveJobDescriptionIdForCandidate({ userId, agencyId, hiringProfile }) {
  let jobDescriptionId = Number(hiringProfile?.job_description_id || 0) || null;
  if (jobDescriptionId) return jobDescriptionId;

  // Fall back to the job application intake link that created this candidate.
  try {
    const [rows] = await pool.execute(
      `SELECT il.job_description_id
         FROM intake_submissions s
         INNER JOIN intake_links il ON il.id = s.intake_link_id
        WHERE s.guardian_user_id = ?
          AND il.form_type = 'job_application'
          AND il.job_description_id IS NOT NULL
        ORDER BY s.id DESC
        LIMIT 1`,
      [userId]
    );
    jobDescriptionId = Number(rows?.[0]?.job_description_id || 0) || null;
  } catch {
    jobDescriptionId = null;
  }

  if (!jobDescriptionId) return null;

  // Backfill so later portal loads and hire docs stay attached.
  try {
    let appliedRole = null;
    try {
      const [titleRows] = await pool.execute(
        `SELECT title FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
        [jobDescriptionId]
      );
      appliedRole = titleRows?.[0]?.title || null;
    } catch { /* ignore */ }
    await pool.execute(
      `UPDATE hiring_profiles
          SET job_description_id = ?,
              applied_role = COALESCE(NULLIF(applied_role, ''), ?)
        WHERE candidate_user_id = ?
          AND (job_description_id IS NULL OR job_description_id = 0)`,
      [jobDescriptionId, appliedRole, userId]
    );
  } catch {
    try {
      await pool.execute(
        `UPDATE hiring_profiles SET job_description_id = ? WHERE candidate_user_id = ? AND job_description_id IS NULL`,
        [jobDescriptionId, userId]
      );
    } catch { /* ignore */ }
  }
  return jobDescriptionId;
}

export async function loadPortalPrehireExtras({ userId, agencyId, hiringProfile }) {
  const extras = {
    jobDescription: null,
    prehireDocs: [],
    checklistItems: [],
    jdAcknowledged: false
  };
  try {
    let jobConfig = null;
    const jobDescriptionId = await resolveJobDescriptionIdForCandidate({ userId, agencyId, hiringProfile });
    if (jobDescriptionId) {
      const [jdRows] = await pool.execute(
        `SELECT id, title, description_text, description_sections_json, schedule_text, prehire_config_json, agency_id
         FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
        [jobDescriptionId]
      );
      const jd = jdRows[0];
      if (jd && (!agencyId || Number(jd.agency_id) === Number(agencyId))) {
        extras.jobDescription = {
          id: jd.id,
          title: jd.title,
          descriptionText: jd.description_text || '',
          descriptionSections: sanitizeJobDescriptionSections(jd.description_sections_json),
          scheduleText: jd.schedule_text || null
        };
        jobConfig = jd.prehire_config_json;
      }
    }
    let agencyDefaults = [];
    if (agencyId) {
      const [sRows] = await pool.execute(`SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
      const raw = sRows[0]?.prehire_settings;
      const settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      agencyDefaults = Array.isArray(settings.default_prehire_docs) ? settings.default_prehire_docs : [];
    }
    const packet = await portalPacket(userId, agencyId);
    if (packet.jobDescription) extras.jobDescription = packet.jobDescription;
    extras.prehireDocs = Array.isArray(packet.documents) ? packet.documents : mergePrehireDocuments(jobConfig, { documents: agencyDefaults }).documents;
  } catch { /* ignore */ }
  try {
    const [rows] = await pool.execute(
      `SELECT item_key, title, instructions, scheduled_on, completed_on
       FROM hiring_prehire_checklist_items
       WHERE user_id = ?
       ORDER BY id ASC`,
      [userId]
    );
    extras.checklistItems = (rows || []).map((r) => ({
      itemKey: r.item_key,
      title: r.title,
      instructions: r.instructions || '',
      scheduledOn: r.scheduled_on || null,
      completedOn: r.completed_on || null
    }));
    extras.jdAcknowledged = extras.checklistItems.some(
      (i) => i.itemKey === 'job_description_ack' && i.completedOn
    );
    const signedDocKeys = new Set(
      extras.checklistItems
        .filter((i) => i.completedOn && String(i.itemKey || '').startsWith('prehire_doc_'))
        .map((i) => String(i.itemKey).replace(/^prehire_doc_/, ''))
    );
    const docCompletedKeys = new Set(
      extras.checklistItems
        .filter((i) => i.completedOn && String(i.itemKey || '').startsWith('doc:'))
        .map((i) => String(i.itemKey))
    );
    extras.prehireDocs = (extras.prehireDocs || []).map((d) => ({
      ...d,
      signed: signedDocKeys.has(String(d.id)) || docCompletedKeys.has(`doc:${d.id}`)
    }));
  } catch { /* table may not exist */ }

  try {
    const [staffFiles] = await pool.execute(
      `SELECT id, title, storage_path, original_name, mime_type, created_by_user_id, created_at
       FROM user_admin_docs
       WHERE user_id = ?
         AND doc_type = 'prehire_upload'
         AND storage_path IS NOT NULL
         AND (created_by_user_id IS NULL OR created_by_user_id != ?)
       ORDER BY created_at ASC`,
      [userId, userId]
    );
    const existingTitles = new Set(
      (extras.prehireDocs || []).map((d) => String(d.title || '').trim().toLowerCase()).filter(Boolean)
    );
    const completedKeys = new Set(
      (extras.checklistItems || [])
        .filter((i) => i.completedOn)
        .map((i) => String(i.itemKey || ''))
    );
    for (const d of staffFiles || []) {
      const title = String(d.title || d.original_name || 'Pre-hire form').trim();
      if (existingTitles.has(title.toLowerCase())) continue;
      const extraId = `admin_doc_${d.id}`;
      extras.prehireDocs.push({
        id: extraId,
        adminDocId: d.id,
        title,
        kind: 'upload',
        instructions: 'Download this form, complete it, and upload your signed copy.',
        filePath: d.storage_path,
        fileName: d.original_name || null,
        mimeType: d.mime_type || null,
        signed: completedKeys.has(`doc:${extraId}`)
      });
      existingTitles.add(title.toLowerCase());
    }
  } catch { /* ignore */ }

  return extras;
}
