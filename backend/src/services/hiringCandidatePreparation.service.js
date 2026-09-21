import pool from '../config/database.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import HiringResearchReport from '../models/HiringResearchReport.model.js';
import { generateResumeSummaryJson } from './resumeStructuring.service.js';
import { prepareCandidatePreScreen } from './hiringCandidatePreScreen.service.js';

// Parsed resumes are the durable work list: a restart never loses preparation.
// A database lock prevents multiple server instances from running the same batch.
export async function processCandidatePreparation({ db = pool, summarize = generateResumeSummaryJson, prescreen = prepareCandidatePreScreen } = {}) {
  const conn = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await conn.execute("SELECT GET_LOCK('hiring_candidate_preparation', 0) AS acquired");
    locked = Number(lock?.acquired) === 1;
    if (!locked) return;
    const [rows] = await conn.execute(`SELECT p.*, u.first_name, u.last_name, jd.agency_id
      FROM hiring_resume_parses p JOIN users u ON u.id = p.candidate_user_id
      JOIN hiring_profiles hp ON hp.candidate_user_id = u.id
      JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
      JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = jd.agency_id
      WHERE p.status = 'completed' AND LENGTH(p.extracted_text) > 0 AND u.is_active = 1
        AND u.status NOT IN ('ARCHIVED','TERMINATED','INACTIVE')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.extracted_json, '$.preparation.state')), '') <> 'complete'
        AND COALESCE(JSON_EXTRACT(p.extracted_json, '$.preparation.attempts'), 0) < 3
        AND COALESCE(JSON_EXTRACT(p.extracted_json, '$.preparation.retryAfter'), 0) <= UNIX_TIMESTAMP()
        AND NOT EXISTS (SELECT 1 FROM hiring_resume_parses newer WHERE newer.candidate_user_id = p.candidate_user_id AND newer.id > p.id)
      ORDER BY p.created_at DESC LIMIT 2`);
    for (const row of rows) {
      const parsed = typeof row.extracted_json === 'string' ? JSON.parse(row.extracted_json) : row.extracted_json || {};
      const attempts = Number(parsed.preparation?.attempts || 0) + 1;
      let record = { ...parsed, preparation: { state: 'working', attempts, retryAfter: Math.floor(Date.now() / 1000) + 900 } };
      await HiringResumeParse.updateExtractedJsonByResumeDocId(row.resume_doc_id, record);
      try {
        if (!record.summary) {
          const ai = await summarize({ candidateName: `${row.first_name || ''} ${row.last_name || ''}`.trim(), resumeText: row.extracted_text.slice(0, 20000) });
          record = { ...record, kind: 'resume_structured_v1', model: ai.modelId, latencyMs: ai.latencyMs, generatedAt: new Date().toISOString(), summary: ai.summary };
          await HiringResumeParse.updateExtractedJsonByResumeDocId(row.resume_doc_id, record);
        }
        const existing = await HiringResearchReport.findLatestAiByCandidateUserId(row.candidate_user_id);
        if (existing?.status !== 'completed' || new Date(existing.created_at) < new Date(row.created_at)) {
          await prescreen({ candidateUserId: row.candidate_user_id, agencyId: row.agency_id });
        }
        record.preparation = { state: 'complete', attempts, completedAt: new Date().toISOString() };
      } catch {
        record.preparation = { state: 'retry', attempts, retryAfter: Math.floor(Date.now() / 1000) + 900 };
      }
      await HiringResumeParse.updateExtractedJsonByResumeDocId(row.resume_doc_id, record);
    }
  } finally {
    if (locked) await conn.execute("SELECT RELEASE_LOCK('hiring_candidate_preparation')").catch(() => {});
    conn.release();
  }
}
