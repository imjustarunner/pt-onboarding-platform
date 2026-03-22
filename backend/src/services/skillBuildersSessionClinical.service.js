import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';
import { callGeminiText } from './geminiText.service.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { getKnowledgeBaseContext } from './clinicalKnowledgeBase.service.js';
import { encryptSbClinicalPayload, decryptSbClinicalPayload } from '../utils/skillBuildersClinicalCrypto.js';
import Agency from '../models/Agency.model.js';

const TOOL_ID = 'clinical_h2014_group';
const MAX_EXTRACT_CHARS = 48000;
const STORAGE_PREFIX = 'skill-builders-curriculum';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export async function requireNoteAidEnabledForAgency(agencyId) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return { ok: false, error: 'Invalid agency' };
  const agency = await Agency.findById(aid);
  const flags = parseFlags(agency?.feature_flags);
  const enabled = isTruthyFlag(flags?.noteAidEnabled) || isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
  if (!enabled) return { ok: false, error: 'Clinical Note Generator is disabled for this organization' };
  return { ok: true };
}

function buildPromptForTool({ tool, inputText }) {
  return [
    tool?.systemPrompt || '',
    '',
    tool?.outputInstructions ? `Output instructions:\n${tool.outputInstructions}` : '',
    '',
    'User input:',
    String(inputText || '')
  ]
    .filter(Boolean)
    .join('\n');
}

function uniqueFolders(list) {
  const out = [];
  const seen = new Set();
  for (const entry of list || []) {
    const cleaned = String(entry || '')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    if (!cleaned || cleaned.includes('..')) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export async function loadSessionCurriculumRow(sessionId) {
  const sid = Number(sessionId);
  if (!Number.isFinite(sid) || sid <= 0) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM skill_builders_event_session_curriculum WHERE session_id = ? LIMIT 1`,
    [sid]
  );
  return rows?.[0] || null;
}

export function curriculumStorageKey(agencyId, eventId, sessionId, filename) {
  const safe = String(filename || 'curriculum.pdf').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
  return `${STORAGE_PREFIX}/${agencyId}/${eventId}/${sessionId}/${Date.now()}-${safe}`;
}

export async function upsertCurriculumRecord({
  sessionId,
  companyEventId,
  agencyId,
  skillsGroupId,
  storagePath,
  originalFilename,
  mimeType,
  fileSizeBytes,
  uploadedByUserId,
  extractedTextEnc,
  extractStatus
}) {
  const [existing] = await pool.execute(
    `SELECT id FROM skill_builders_event_session_curriculum WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );
  if (existing?.[0]?.id) {
    const old = await loadSessionCurriculumRow(sessionId);
    if (old?.storage_path && old.storage_path !== storagePath) {
      try {
        await StorageService.deleteObject(old.storage_path);
      } catch {
        /* ignore */
      }
    }
    await pool.execute(
      `UPDATE skill_builders_event_session_curriculum
       SET company_event_id = ?, agency_id = ?, skills_group_id = ?, storage_path = ?, original_filename = ?, mime_type = ?,
           file_size_bytes = ?, extract_status = ?, extracted_text_enc = ?, uploaded_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [
        companyEventId,
        agencyId,
        skillsGroupId,
        storagePath,
        originalFilename,
        mimeType,
        fileSizeBytes,
        extractStatus,
        extractedTextEnc,
        uploadedByUserId,
        sessionId
      ]
    );
    return Number(existing[0].id);
  }
  const [ins] = await pool.execute(
    `INSERT INTO skill_builders_event_session_curriculum
     (session_id, company_event_id, agency_id, skills_group_id, storage_path, original_filename, mime_type, file_size_bytes,
      extract_status, extracted_text_enc, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      companyEventId,
      agencyId,
      skillsGroupId,
      storagePath,
      originalFilename,
      mimeType,
      fileSizeBytes,
      extractStatus,
      extractedTextEnc,
      uploadedByUserId
    ]
  );
  return Number(ins.insertId);
}

export async function processPdfUploadBuffer({ buffer, mimeType }) {
  const ext = await extractResumeTextFromUpload({ buffer, mimeType: mimeType || 'application/pdf' });
  const text = String(ext?.text || '').trim();
  const truncated = text.length > MAX_EXTRACT_CHARS ? text.slice(0, MAX_EXTRACT_CHARS) : text;
  let extractStatus = 'failed';
  if (ext?.status === 'completed' && truncated) extractStatus = 'ok';
  else if (ext?.status === 'no_text' || !truncated) extractStatus = 'empty';
  const enc = truncated ? encryptSbClinicalPayload(truncated) : null;
  return { extractStatus, extractedTextEnc: enc };
}

export async function getDecryptedCurriculumTextForSession(sessionId) {
  const row = await loadSessionCurriculumRow(sessionId);
  if (!row?.extracted_text_enc) return '';
  return decryptSbClinicalPayload(row.extracted_text_enc);
}

export async function generateH2014SessionClinicalNote({
  agencyId,
  curriculumText,
  clinicianSummaryText,
  programLabel,
  revisionInstruction
}) {
  const na = await requireNoteAidEnabledForAgency(agencyId);
  if (!na.ok) {
    const err = new Error(na.error);
    err.status = 403;
    throw err;
  }

  const tool = getNoteAidToolById(TOOL_ID);
  if (!tool) {
    const err = new Error('Note tool not configured');
    err.status = 500;
    throw err;
  }

  const summary = String(clinicianSummaryText || '').trim().slice(0, 12000);
  const cur = String(curriculumText || '').trim().slice(0, MAX_EXTRACT_CHARS);
  const inputText = [
    programLabel ? `Program / group: ${programLabel}` : '',
    '',
    'Curriculum of the day (reference; do not copy verbatim unless appropriate for the note):',
    cur || '(No curriculum text extracted — rely on clinician summary and knowledge base.)',
    '',
    'Clinician observations and session summary (behaviors, demeanor, success, challenges):',
    summary
  ]
    .filter(Boolean)
    .join('\n');

  let prompt = buildPromptForTool({ tool, inputText });
  if (revisionInstruction) {
    prompt = [
      prompt,
      '',
      'Revision request from clinician:',
      String(revisionInstruction).trim().slice(0, 1500)
    ].join('\n');
  }

  if (tool?.includeKnowledgeBase) {
    try {
      const folders = uniqueFolders([...(Array.isArray(tool.kbFolders) ? tool.kbFolders : [])]);
      const kbContext = await getKnowledgeBaseContext({
        query: inputText,
        maxChars: 4000,
        folders
      });
      if (kbContext) {
        prompt = [
          prompt,
          '',
          'Knowledge Base Context (read-only):',
          kbContext,
          '',
          'Use the context only if relevant and do not invent facts.'
        ].join('\n');
      }
    } catch {
      /* ignore */
    }
  }

  const { text, modelName, latencyMs } = await callGeminiText({
    prompt,
    temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
    maxOutputTokens: Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 1600
  });

  const rawOut = String(text || '').trim();
  const sections = rawOut ? { Output: rawOut } : {};

  const outputObj = {
    sections,
    meta: { toolId: TOOL_ID, model: modelName, latencyMs }
  };

  return { outputObj, plainText: String(text || '').trim() };
}

export async function listClinicalNotesForSession({ sessionId, companyEventId }) {
  const [rows] = await pool.execute(
    `SELECT id, client_id, author_user_id, created_at, updated_at
     FROM skill_builders_session_clinical_notes
     WHERE session_id = ? AND company_event_id = ?`,
    [sessionId, companyEventId]
  );
  return rows || [];
}

export async function getClinicalNoteBySessionClient({ sessionId, clientId, companyEventId }) {
  const [rows] = await pool.execute(
    `SELECT * FROM skill_builders_session_clinical_notes
     WHERE session_id = ? AND client_id = ? AND company_event_id = ?
     LIMIT 1`,
    [sessionId, clientId, companyEventId]
  );
  return rows?.[0] || null;
}

export async function upsertClinicalNote({
  agencyId,
  companyEventId,
  sessionId,
  clientId,
  authorUserId,
  outputObj,
  plainText
}) {
  const bodyEnc = encryptSbClinicalPayload(plainText || JSON.stringify(outputObj?.sections || outputObj));
  const outEnc = encryptSbClinicalPayload(JSON.stringify(outputObj ?? {}));
  const [existing] = await pool.execute(
    `SELECT id FROM skill_builders_session_clinical_notes WHERE session_id = ? AND client_id = ? LIMIT 1`,
    [sessionId, clientId]
  );
  if (existing?.[0]?.id) {
    await pool.execute(
      `UPDATE skill_builders_session_clinical_notes
       SET note_body_enc = ?, output_json_enc = ?, author_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [bodyEnc, outEnc, authorUserId, existing[0].id]
    );
    return Number(existing[0].id);
  }
  const [ins] = await pool.execute(
    `INSERT INTO skill_builders_session_clinical_notes
     (agency_id, company_event_id, session_id, client_id, author_user_id, note_body_enc, output_json_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, companyEventId, sessionId, clientId, authorUserId, bodyEnc, outEnc]
  );
  return Number(ins.insertId);
}

export function decryptClinicalNoteRow(row) {
  if (!row) return null;
  const plain = decryptSbClinicalPayload(row.note_body_enc);
  let outputJson = null;
  try {
    const o = decryptSbClinicalPayload(row.output_json_enc);
    outputJson = o ? JSON.parse(o) : null;
  } catch {
    outputJson = null;
  }
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    authorUserId: Number(row.author_user_id),
    plainText: plain,
    outputJson,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function deleteClinicalNotesForSession({ sessionId, companyEventId }) {
  const [r] = await pool.execute(
    `DELETE FROM skill_builders_session_clinical_notes WHERE session_id = ? AND company_event_id = ?`,
    [sessionId, companyEventId]
  );
  return Number(r?.affectedRows || 0);
}

export async function deleteClinicalNotesForCompanyEvent({ companyEventId, agencyId }) {
  const [r] = await pool.execute(
    `DELETE FROM skill_builders_session_clinical_notes WHERE company_event_id = ? AND agency_id = ?`,
    [companyEventId, agencyId]
  );
  return Number(r?.affectedRows || 0);
}

export async function deleteCurriculumForSession(sessionId) {
  const row = await loadSessionCurriculumRow(sessionId);
  if (!row) return null;
  if (row.storage_path) {
    try {
      await StorageService.deleteObject(row.storage_path);
    } catch {
      /* ignore */
    }
  }
  await pool.execute(`DELETE FROM skill_builders_event_session_curriculum WHERE session_id = ?`, [sessionId]);
  return true;
}

/** MySQL/mysqld_stmt_execute rejects bound parameters in LIMIT; use a clamped integer in SQL. */
function clampRetentionBatchLimit(limitRows, fallback = 500, maxCap = 10000) {
  const n = Math.floor(Number(limitRows));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(maxCap, n);
}

/**
 * Purge curriculum files + clinical notes for ended groups (14 days after skills_groups.end_date)
 * or inactive company events.
 */
export async function runSkillBuildersClinicalRetention({ limitRows = 500 } = {}) {
  let deletedNotes = 0;
  let deletedCurr = 0;
  const batch = clampRetentionBatchLimit(limitRows);

  try {
    const [noteRows] = await pool.execute(
      `SELECT n.id, n.session_id
       FROM skill_builders_session_clinical_notes n
       INNER JOIN skill_builders_event_sessions s ON s.id = n.session_id
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id
       INNER JOIN company_events ce ON ce.id = n.company_event_id
       WHERE (
         (ce.is_active = 0 OR ce.is_active IS FALSE)
         OR DATE_ADD(sg.end_date, INTERVAL 14 DAY) < CURDATE()
       )
       LIMIT ${batch}`,
      []
    );
    const noteIds = (noteRows || []).map((r) => Number(r.id)).filter((x) => x > 0);
    if (noteIds.length) {
      const ph = noteIds.map(() => '?').join(',');
      const [dr] = await pool.execute(`DELETE FROM skill_builders_session_clinical_notes WHERE id IN (${ph})`, noteIds);
      deletedNotes = Number(dr?.affectedRows || 0);
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  try {
    const [currRows] = await pool.execute(
      `SELECT c.id, c.session_id, c.storage_path
       FROM skill_builders_event_session_curriculum c
       INNER JOIN skill_builders_event_sessions s ON s.id = c.session_id
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id
       INNER JOIN company_events ce ON ce.id = c.company_event_id
       WHERE (
         (ce.is_active = 0 OR ce.is_active IS FALSE)
         OR DATE_ADD(sg.end_date, INTERVAL 14 DAY) < CURDATE()
       )
       LIMIT ${batch}`,
      []
    );
    for (const row of currRows || []) {
      if (row.storage_path) {
        try {
          await StorageService.deleteObject(row.storage_path);
        } catch {
          /* ignore */
        }
      }
      await pool.execute(`DELETE FROM skill_builders_event_session_curriculum WHERE id = ?`, [row.id]);
      deletedCurr += 1;
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  return { deletedNotes, deletedCurriculumRows: deletedCurr };
}
