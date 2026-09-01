import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import ClientIntakeNoteDraft from '../models/ClientIntakeNoteDraft.model.js';
import ClientDiagnosisConfirmation from '../models/ClientDiagnosisConfirmation.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import {
  upsertPrimaryClinicalDiagnosis,
  upsertClinicalDiagnosis,
  attachDiagnosisToTreatmentPlan
} from '../services/clinicalDiagnosisAttach.service.js';
import StorageService from '../services/storage.service.js';
import { deriveCredentialTierFromText } from '../utils/credentialNormalization.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { decryptIntakeSubmissionRows } from '../services/intakeResponsesEncryption.service.js';
import { scrubIntakeTextForNoteWriter } from '../services/phiScrubber.service.js';
import { collectClientPhiNames } from '../services/clientPhiNames.service.js';
import { buildClinicalSummaryText, buildIntakeAnswersText } from './publicIntake.controller.js';
import { parseIntakeDiagnoses } from '../services/intakeImport.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Return tier string (intern_plus | bachelors | unknown) → service code / tool id. */
function resolveIntakeTier(tier) {
  if (tier === 'intern_plus') {
    return { serviceCode: '90791', toolId: 'clinical_90791_intake_plan' };
  }
  // Bachelor / QBHA-style → H0031
  if (tier === 'bachelors' || tier === 'qbha') {
    return { serviceCode: 'H0031', toolId: 'clinical_h0031_intake' };
  }
  return null;
}

/** Fetch the provider's credential text from users table or user_info_values. */
async function getProviderCredentialText(userId) {
  const uid = safeInt(userId);
  if (!uid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT credential FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.credential ?? null;
    if (v !== null && String(v).trim()) return String(v);
  } catch {
    // column may not exist on older deployments
  }
  try {
    const [rows] = await pool.execute(
      `SELECT uiv.value
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
       WHERE uiv.user_id = ?
         AND uifd.field_key = 'provider_credential'
       ORDER BY uiv.updated_at DESC, uiv.id DESC
       LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.value ?? null;
    if (v !== null && String(v).trim()) return String(v);
  } catch (e) {
    const msg = String(e?.message || '');
    if (
      !msg.includes("doesn't exist") &&
      !msg.includes('ER_NO_SUCH_TABLE') &&
      !msg.includes('Unknown column') &&
      !msg.includes('ER_BAD_FIELD_ERROR')
    ) {
      throw e;
    }
  }
  return null;
}

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatDateOnly(value) {
  if (!value) return '';
  try {
    if (value instanceof Date) {
      const t = value.getTime();
      if (!Number.isFinite(t)) return '';
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {
    // fall through
  }
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return raw;
}

async function providerHasAssignedClientAccess({ requestingUserId, client }) {
  const uid = Number(requestingUserId || 0);
  const cid = Number(client?.id || 0);
  if (!uid || !cid) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments
       WHERE client_id = ?
         AND provider_user_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (!missing) throw e;
  }

  return Number(client?.provider_id || 0) === uid;
}

async function userHasAgencyAccessToClient({ userId, client }) {
  const orgs = await User.getAgencies(userId);
  const userAgencyIds = (orgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean);

  let hasAccess = false;
  try {
    if (userAgencyIds.length) {
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT 1
         FROM client_agency_assignments
         WHERE client_id = ? AND is_active = TRUE AND agency_id IN (${placeholders})
         LIMIT 1`,
        [parseInt(client.id, 10), ...userAgencyIds]
      );
      hasAccess = rows.length > 0;
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    hasAccess = userAgencyIds.some((id) => id === parseInt(client.agency_id, 10));
  }

  if (!hasAccess) {
    const legacyId = parseInt(client?.agency_id, 10);
    if (Number.isFinite(legacyId) && legacyId > 0) {
      hasAccess = userAgencyIds.some((id) => id === legacyId);
    }
  }

  return hasAccess;
}

/**
 * Verify the acting user has access to the given client.
 * Providers must be assigned via client_provider_assignments or legacy provider_id.
 */
async function ensureClientAccess({ userId, role, clientId }) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) return { ok: false, status: 404, message: 'Client not found', client: null };

  const roleNorm = String(role || '').toLowerCase();
  if (roleNorm === 'super_admin') return { ok: true, client };

  if (roleNorm === 'provider' || roleNorm === 'provider_plus') {
    const allowed = await providerHasAssignedClientAccess({ requestingUserId: userId, client });
    if (!allowed) {
      return { ok: false, status: 403, message: 'Access denied to this client', client };
    }
    return { ok: true, client };
  }

  const hasAccess = await userHasAgencyAccessToClient({ userId, client });
  if (!hasAccess) return { ok: false, status: 403, message: 'Access denied to this client', client };
  return { ok: true, client };
}

async function resolveAssignedPrimaryProviderUserId(clientId, client = null) {
  const cid = safeInt(clientId);
  if (!cid) return null;

  try {
    const [rows] = await pool.execute(
      `SELECT provider_user_id
       FROM client_provider_assignments
       WHERE client_id = ?
         AND is_active = TRUE
       ORDER BY is_primary DESC, id ASC
       LIMIT 1`,
      [cid]
    );
    const uid = safeInt(rows?.[0]?.provider_user_id);
    if (uid) return uid;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column');
    if (!missing) throw e;
  }

  const resolvedClient = client || await Client.findById(cid, { includeSensitive: false });
  return safeInt(resolvedClient?.provider_id);
}

async function collectScrubExtraNames(client) {
  return collectClientPhiNames(client);
}

function isClinicalSummaryPhiDoc(doc) {
  const title = String(doc?.document_title || '').toLowerCase();
  const type = String(doc?.document_type || '').toLowerCase();
  return title.includes('clinical') || type.includes('clinical');
}

function isIntakeResponsesPhiDoc(doc) {
  const title = String(doc?.document_title || '').toLowerCase();
  const type = String(doc?.document_type || '').toLowerCase();
  return title.includes('intake response') || type.includes('intake response');
}

function clinicalSummaryLooksEmpty(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  return /no clinical responses captured/i.test(raw);
}

async function readPhiDocText(doc) {
  if (!doc?.storage_path || doc?.removed_at) return null;
  try {
    const buffer = await StorageService.readObject(doc.storage_path);
    return buffer?.toString('utf8') || null;
  } catch {
    return null;
  }
}

async function rebuildClinicalSummaryFromSubmission({ doc, intakeData = null, link = null }) {
  const submissionId = Number(doc?.intake_submission_id || 0);
  const clientId = Number(doc?.client_id || 0);
  if (!submissionId) return null;

  let submissionRow = null;
  if (!intakeData || !link) {
    const [rows] = await pool.execute(
      `SELECT id, intake_link_id, intake_data, payload_encrypted, payload_iv_b64,
              payload_auth_tag_b64, payload_key_id, client_id
       FROM intake_submissions
       WHERE id = ?
       LIMIT 1`,
      [submissionId]
    );
    decryptIntakeSubmissionRows(rows);
    submissionRow = rows?.[0] || null;
  }

  const resolvedIntakeData = intakeData || parseJsonMaybe(submissionRow?.intake_data);
  if (!resolvedIntakeData) return null;

  let resolvedLink = link;
  const linkId = Number(submissionRow?.intake_link_id || link?.id || 0);
  if (!resolvedLink && linkId) {
    resolvedLink = await IntakeLink.findById(linkId);
  }
  if (!resolvedLink) return null;

  let clientIndex = 0;
  if (clientId) {
    try {
      const [iscRows] = await pool.execute(
        `SELECT client_id FROM intake_submission_clients WHERE intake_submission_id = ? ORDER BY id ASC`,
        [submissionId]
      );
      const ids = (iscRows || []).map((row) => Number(row?.client_id || 0));
      const idx = ids.indexOf(clientId);
      if (idx >= 0) clientIndex = idx;
    } catch {
      // older DBs may not have the join table
    }
  }

  const rebuilt = buildClinicalSummaryText({
    link: resolvedLink,
    intakeData: resolvedIntakeData,
    clientIndex
  });
  return String(rebuilt || '').trim() || null;
}

async function resolveClinicalSummaryText({ doc, storedText, intakeData = null, link = null }) {
  if (!isClinicalSummaryPhiDoc(doc)) return storedText;
  try {
    const rebuilt = await rebuildClinicalSummaryFromSubmission({ doc, intakeData, link });
    if (!rebuilt) return storedText;
    if (clinicalSummaryLooksEmpty(storedText) || rebuilt.length > String(storedText || '').length) {
      return rebuilt;
    }
  } catch (err) {
    console.warn('[clientIntakeNote] clinical summary rebuild failed:', err?.message);
  }
  return storedText;
}

async function loadLatestIntakeSubmissionRow(clientId, preferredSubmissionId = null) {
  const cid = safeInt(clientId);
  if (!cid) return null;

  const sid = safeInt(preferredSubmissionId);
  if (sid) {
    const loadById = async (includeSummaryText) => {
      const summaryCol = includeSummaryText ? 'summary_text,' : '';
      const [rows] = await pool.execute(
        `SELECT id, intake_link_id, intake_data, ${summaryCol}
                payload_encrypted, payload_iv_b64, payload_auth_tag_b64, payload_key_id,
                submitted_at, status
         FROM intake_submissions
         WHERE id = ?
         LIMIT 1`,
        [sid]
      );
      decryptIntakeSubmissionRows(rows);
      return rows?.[0] || null;
    };
    try {
      return await loadById(true);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR')) {
        try {
          return await loadById(false);
        } catch (inner) {
          const innerMsg = String(inner?.message || '');
          if (innerMsg.includes("doesn't exist") || innerMsg.includes('ER_NO_SUCH_TABLE')) return null;
          throw inner;
        }
      }
      if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) return null;
      throw e;
    }
  }

  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT s.id, s.intake_link_id, s.intake_data, s.summary_text,
              s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
              s.submitted_at, s.status
       FROM intake_submissions s
       LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
       WHERE (s.client_id = ? OR isc.client_id = ?)
       ORDER BY s.submitted_at DESC, s.id DESC
       LIMIT 1`,
      [cid, cid]
    );
    decryptIntakeSubmissionRows(rows);
    return rows?.[0] || null;
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) return null;
    if (msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR')) {
      try {
        const [rows] = await pool.execute(
          `SELECT DISTINCT s.id, s.intake_link_id, s.intake_data,
                  s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
                  s.submitted_at, s.status
           FROM intake_submissions s
           LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
           WHERE (s.client_id = ? OR isc.client_id = ?)
           ORDER BY s.submitted_at DESC, s.id DESC
           LIMIT 1`,
          [cid, cid]
        );
        decryptIntakeSubmissionRows(rows);
        return rows?.[0] || null;
      } catch (inner) {
        const innerMsg = String(inner?.message || '');
        if (innerMsg.includes("doesn't exist") || innerMsg.includes('ER_NO_SUCH_TABLE')) return null;
        throw inner;
      }
    }
    throw e;
  }
}

async function loadLatestPhiTextDocs(clientId, submissionId = null) {
  const cid = safeInt(clientId);
  if (!cid) return { clinicalSummaryDoc: null, intakeResponsesDoc: null };

  const params = [cid];
  let submissionFilter = '';
  if (safeInt(submissionId)) {
    submissionFilter = ' AND intake_submission_id = ?';
    params.push(safeInt(submissionId));
  }

  try {
    const [docRows] = await pool.execute(
      `SELECT id, intake_submission_id, document_title, document_type, storage_path, mime_type, removed_at
       FROM client_phi_documents
       WHERE client_id = ?
         AND removed_at IS NULL
         AND LOWER(COALESCE(mime_type, '')) LIKE 'text/plain%'
         ${submissionFilter}
       ORDER BY id DESC`,
      params
    );

    const clinicalSummaryDoc = (docRows || []).find((doc) => isClinicalSummaryPhiDoc(doc)) || null;
    const intakeResponsesDoc = (docRows || []).find((doc) => isIntakeResponsesPhiDoc(doc)) || null;
    return { clinicalSummaryDoc, intakeResponsesDoc };
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { clinicalSummaryDoc: null, intakeResponsesDoc: null };
    throw e;
  }
}

export async function resolveIntakeSummaryText({ clientId, intakeSubmissionId = null }) {
  const cid = safeInt(clientId);
  if (!cid) return { summaryText: '', resolvedSubmissionId: null, intakeData: null, link: null };

  const submissionRow = await loadLatestIntakeSubmissionRow(cid, intakeSubmissionId);
  const resolvedSubmissionId = safeInt(submissionRow?.id) || safeInt(intakeSubmissionId) || null;
  const intakeData = parseJsonMaybe(submissionRow?.intake_data);
  const link = submissionRow?.intake_link_id
    ? await IntakeLink.findById(submissionRow.intake_link_id)
    : null;

  const { clinicalSummaryDoc, intakeResponsesDoc: _ignored } = await loadLatestPhiTextDocs(
    cid,
    resolvedSubmissionId
  );

  if (clinicalSummaryDoc) {
    const storedClinicalSummaryText = await readPhiDocText(clinicalSummaryDoc);
    const clinicalSummaryText = await resolveClinicalSummaryText({
      doc: { ...clinicalSummaryDoc, client_id: cid },
      storedText: storedClinicalSummaryText,
      intakeData,
      link
    });
    if (String(clinicalSummaryText || '').trim()) {
      return {
        summaryText: String(clinicalSummaryText).trim(),
        resolvedSubmissionId,
        intakeData,
        link
      };
    }
  }

  if (submissionRow?.summary_text) {
    const fromColumn = String(submissionRow.summary_text).trim();
    if (fromColumn) {
      return { summaryText: fromColumn, resolvedSubmissionId, intakeData, link };
    }
  }

  if (intakeData && link) {
    let clientIndex = 0;
    if (resolvedSubmissionId) {
      try {
        const [iscRows] = await pool.execute(
          `SELECT client_id FROM intake_submission_clients WHERE intake_submission_id = ? ORDER BY id ASC`,
          [resolvedSubmissionId]
        );
        const ids = (iscRows || []).map((row) => Number(row?.client_id || 0));
        const idx = ids.indexOf(cid);
        if (idx >= 0) clientIndex = idx;
      } catch {
        // ignore
      }
    }
    const rebuilt = buildClinicalSummaryText({ link, intakeData, clientIndex });
    if (String(rebuilt || '').trim()) {
      return {
        summaryText: String(rebuilt).trim(),
        resolvedSubmissionId,
        intakeData,
        link
      };
    }
  }

  if (resolvedSubmissionId) {
    const rebuilt = await rebuildClinicalSummaryFromSubmission({
      doc: { intake_submission_id: resolvedSubmissionId, client_id: cid, document_title: 'Clinical Intake Summary' },
      intakeData,
      link
    });
    if (String(rebuilt || '').trim()) {
      return { summaryText: String(rebuilt).trim(), resolvedSubmissionId, intakeData, link };
    }
  }

  return { summaryText: '', resolvedSubmissionId, intakeData, link };
}

async function resolveIntakeAnswersText({ clientId, intakeSubmissionId = null, intakeData = null, link = null }) {
  const cid = safeInt(clientId);
  if (!cid) return '';

  const submissionRow = intakeData && link
    ? null
    : await loadLatestIntakeSubmissionRow(cid, intakeSubmissionId);
  const resolvedIntakeData = intakeData || parseJsonMaybe(submissionRow?.intake_data);
  const resolvedLink = link || (submissionRow?.intake_link_id
    ? await IntakeLink.findById(submissionRow.intake_link_id)
    : null);
  const resolvedSubmissionId = safeInt(submissionRow?.id) || safeInt(intakeSubmissionId) || null;

  const { intakeResponsesDoc } = await loadLatestPhiTextDocs(cid, resolvedSubmissionId);
  if (intakeResponsesDoc) {
    const stored = await readPhiDocText(intakeResponsesDoc);
    if (String(stored || '').trim()) return String(stored).trim();
  }

  if (resolvedIntakeData && resolvedLink) {
    let clientIndex = 0;
    if (resolvedSubmissionId) {
      try {
        const [iscRows] = await pool.execute(
          `SELECT client_id FROM intake_submission_clients WHERE intake_submission_id = ? ORDER BY id ASC`,
          [resolvedSubmissionId]
        );
        const ids = (iscRows || []).map((row) => Number(row?.client_id || 0));
        const idx = ids.indexOf(cid);
        if (idx >= 0) clientIndex = idx;
      } catch {
        // ignore
      }
    }
    const rebuilt = buildIntakeAnswersText({
      link: resolvedLink,
      intakeData: resolvedIntakeData,
      clientIndex
    });
    if (String(rebuilt || '').trim()) return String(rebuilt).trim();
  }

  return '';
}

async function buildDemographicsCopyBlock(client) {
  const lines = [];
  const name =
    String(client?.full_name || '').trim()
    || `${String(client?.first_name || '').trim()} ${String(client?.last_name || '').trim()}`.trim();
  if (name) lines.push(`Name: ${name}`);

  const dob = formatDateOnly(client?.date_of_birth);
  if (dob) lines.push(`DOB: ${dob}`);

  const street = [client?.address_street, client?.address_apt].filter(Boolean).join(' ').trim();
  const cityState = [client?.address_city, client?.address_state].filter(Boolean).join(', ');
  const addressParts = [street, cityState, client?.address_zip].filter(Boolean);
  if (addressParts.length) lines.push(`Address: ${addressParts.join(', ')}`);

  try {
    const guardians = await ClientGuardian.listForClient(client?.id);
    const guardianNames = (guardians || [])
      .map((g) => `${String(g.first_name || '').trim()} ${String(g.last_name || '').trim()}`.trim())
      .filter(Boolean);
    if (guardianNames.length) lines.push(`Guardian: ${guardianNames.join('; ')}`);
  } catch {
    // ignore
  }

  const insurance =
    String(client?.insurance_type_label || client?.insurance_type_key || client?.insurance_carrier || '').trim();
  if (insurance) lines.push(`Insurance: ${insurance}`);

  return lines.join('\n');
}

function normalizeDraftSections(sectionsRaw, noteBody) {
  let sections = sectionsRaw;
  if (typeof sectionsRaw === 'string') {
    try {
      sections = JSON.parse(sectionsRaw);
    } catch {
      sections = null;
    }
  }

  if (Array.isArray(sections)) {
    return sections
      .map((sec, index) => {
        const key = String(sec?.key || sec?.label || `section_${index + 1}`);
        const label = String(sec?.label || sec?.key || `Section ${index + 1}`);
        const body = String(sec?.body ?? sec?.content ?? '');
        return { key, label, body };
      })
      .filter((sec) => sec.body || sec.label);
  }

  if (sections && typeof sections === 'object') {
    return Object.entries(sections).map(([key, body]) => ({
      key,
      label: key,
      body: String(body ?? '')
    }));
  }

  if (noteBody) {
    return [{ key: 'body', label: 'Note', body: noteBody }];
  }

  return [];
}

async function loadTreatmentPlanResponse(treatmentPlanId) {
  const planId = safeInt(treatmentPlanId);
  if (!planId) return null;
  try {
    const plan = await ClinicalTreatmentPlan.findById(planId);
    if (!plan) return null;
    return { id: plan.id, goals: plan.goals || [] };
  } catch {
    return null;
  }
}

/**
 * Extract a suggested diagnosis block from raw AI note text.
 * Looks for patterns like:
 *   Diagnosis: F32.1 — Major Depressive Disorder, Moderate
 *   Justification: ...
 * Returns { code, description, justification } or null.
 */
function extractSuggestedDiagnosis(text) {
  const raw = String(text || '');

  const parsed = parseIntakeDiagnoses(raw);
  if (parsed[0]?.code) {
    return {
      code: parsed[0].code,
      description: parsed[0].description || '',
      justification: parsed[0].justification || ''
    };
  }

  // Pattern: "Diagnosis: F32.1" or "Diagnosis Code: F41.0" on one line
  const codeMatch = raw.match(
    /\bDiagnos(?:is|tic)(?:\s+Code)?\s*:\s*([A-Z]\d+(?:\.\d+)?)/im
  );
  if (!codeMatch) return null;

  const code = codeMatch[1].trim();

  // Description — same line after the code, or a following "Description:" line
  let description = '';
  const codeLine = raw.slice(raw.indexOf(codeMatch[0]));
  const afterCode = codeLine.replace(codeMatch[0], '').trim();
  const descLineMatch = afterCode.match(/^[—\-–]?\s*(.+)/);
  if (descLineMatch) {
    description = descLineMatch[1].split('\n')[0].trim().replace(/^[—\-–]\s*/, '');
  }
  if (!description) {
    const descBlock = raw.match(/\bDiagnos(?:is|tic)(?:\s+Description)?\s*:\s*(.+)/im);
    if (descBlock) description = descBlock[1].split('\n')[0].trim();
  }

  // Justification — "Justification:" or "Clinical Justification:" block
  let justification = '';
  const justMatch = raw.match(/\b(?:Clinical\s+)?Justification\s*:\s*([\s\S]+?)(?:\n\s*\n|\n\s*[A-Z]|\n\s*\d+\.|\n\s*##|$)/im);
  if (justMatch) justification = justMatch[1].trim();

  return { code, description, justification };
}

/**
 * Convert a raw draft row into the public API shape.
 * Decrypts encrypted fields and parses JSON blobs.
 */
function formatDraftResponse(row) {
  if (!row) return null;

  const noteBody = maybeDecryptNotePayload(row.note_body_enc);
  const sectionsRaw = maybeDecryptNotePayload(row.note_sections_json_enc);
  const sections = normalizeDraftSections(sectionsRaw, noteBody);

  let suggestedDiagnosis = null;
  let confirmedDiagnosis = null;
  try {
    suggestedDiagnosis = row.suggested_dx_json ? JSON.parse(row.suggested_dx_json) : null;
  } catch {
    suggestedDiagnosis = null;
  }
  try {
    confirmedDiagnosis = row.confirmed_dx_json ? JSON.parse(row.confirmed_dx_json) : null;
  } catch {
    confirmedDiagnosis = null;
  }
  if (suggestedDiagnosis?.primary?.code && !suggestedDiagnosis.code) {
    suggestedDiagnosis = {
      ...suggestedDiagnosis.primary,
      diagnoses: suggestedDiagnosis.diagnoses || []
    };
  }
  if (confirmedDiagnosis?.primary?.code && !confirmedDiagnosis.code) {
    confirmedDiagnosis = {
      ...confirmedDiagnosis.primary,
      diagnoses: confirmedDiagnosis.diagnoses || []
    };
  }

  return {
    id: row.id,
    status: row.status,
    serviceCode: row.service_code,
    toolId: row.tool_id,
    diagnosisAction: row.diagnosis_action || null,
    suggestedDiagnosis,
    confirmedDiagnosis,
    sections,
    intakeSubmissionId: row.intake_submission_id || null,
    treatmentPlanId: row.treatment_plan_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at || null
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /clients/:id/intake-note
 * Returns the latest (non-failed) intake note draft for this client.
 */
export const getClientIntakeNote = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const wantedDraftId = safeInt(req.query?.draftId || req.query?.intakeDraftId);
    const row = wantedDraftId
      ? await ClientIntakeNoteDraft.findForClient({ draftId: wantedDraftId, clientId, agencyId })
      : await ClientIntakeNoteDraft.latestForClient({ clientId, agencyId });
    if (wantedDraftId && !row) {
      return res.status(404).json({ error: { message: 'Intake draft not found' } });
    }
    const treatmentPlan = await loadTreatmentPlanResponse(row?.treatment_plan_id);
    const historyRows = await ClientIntakeNoteDraft.listSummariesForClient({ clientId, agencyId });
    const history = (historyRows || []).map((h) => ({
      id: h.id,
      status: h.status,
      serviceCode: h.service_code,
      finalizedAt: h.finalized_at || null,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      treatmentPlanId: h.treatment_plan_id || null,
      isCurrent: row ? Number(h.id) === Number(row.id) : false
    }));
    res.json({ draft: formatDraftResponse(row), treatmentPlan, history });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /clients/:id/intake-note/generate
 *
 * Body:
 *  - summaryText (string, required unless intakeSubmissionId provided)
 *  - intakeSubmissionId (int, optional — used to load + build summary)
 *  - extraNames (string[], optional — additional known names to scrub)
 *
 * Flow: scrub → Gemini → store draft (status=diagnosis_pending) → return
 */
export const generateClientIntakeNote = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const assignedProviderUserId = await resolveAssignedPrimaryProviderUserId(clientId, access.client);
    if (!assignedProviderUserId) {
      return res.status(400).json({ error: { message: 'Assign a clinician to generate.' } });
    }

    const credText = await getProviderCredentialText(assignedProviderUserId);
    const tier = deriveCredentialTierFromText({ userRole: 'provider', providerCredentialText: credText });
    const tierInfo = resolveIntakeTier(tier);
    if (!tierInfo) {
      return res.status(400).json({
        error: {
          message: 'Assigned clinician credential does not qualify for intake note generation. Requires intern/pre-licensed (90791) or bachelor\'s-level (H0031) credential.'
        }
      });
    }

    const { serviceCode, toolId } = tierInfo;
    const tool = getNoteAidToolById(toolId);
    if (!tool) {
      return res.status(500).json({ error: { message: `Note Aid tool not configured: ${toolId}` } });
    }

    const intakeSubmissionId = safeInt(req.body?.intakeSubmissionId);
    let rawSummaryText = req.body?.summaryText ? String(req.body.summaryText).trim() : '';
    let resolvedSubmissionId = intakeSubmissionId;

    if (!rawSummaryText) {
      const resolved = await resolveIntakeSummaryText({ clientId, intakeSubmissionId });
      rawSummaryText = resolved.summaryText;
      resolvedSubmissionId = resolved.resolvedSubmissionId || resolvedSubmissionId;
    }

    if (!rawSummaryText) {
      return res.status(400).json({
        error: { message: 'No intake summary is available for this client. Complete intake or provide summaryText.' }
      });
    }

    const extraNames = [
      ...(await collectScrubExtraNames(access.client)),
      ...(Array.isArray(req.body?.extraNames)
        ? req.body.extraNames.map((n) => String(n || '').trim()).filter(Boolean)
        : [])
    ];
    const scrubbedText = scrubIntakeTextForNoteWriter(rawSummaryText, { extraNames });

    // Build Gemini prompt
    const systemPrompt = String(tool.systemPrompt || '').trim();
    const outputInstructions = String(tool.outputInstructions || '').trim();
    const prompt = [
      systemPrompt,
      '',
      outputInstructions ? `Output instructions:\n${outputInstructions}` : '',
      '',
      'After the clinical note sections, include a structured diagnosis block in exactly this format:',
      'Diagnosis: <ICD-10 code> — <description>',
      'Justification: <1-3 sentence clinical rationale>',
      '',
      'Intake Summary (scrubbed — do NOT add any identifying information):',
      scrubbedText
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    let geminiText, modelName, latencyMs;
    try {
      ({ text: geminiText, modelName, latencyMs } = await callGeminiText({
        prompt,
        temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
        maxOutputTokens: Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 2400,
        model: tool.model || null
      }));
    } catch (e) {
      if (e?.status) {
        return res.status(e.status).json({
          error: { message: e.message || 'AI generation failed', ...(e.details ? { details: e.details } : {}) }
        });
      }
      throw e;
    }

    // Parse sections and diagnosis from AI output
    const suggestedDx = extractSuggestedDiagnosis(geminiText);
    const sectionsObject = parseSections(geminiText);
    const sections = normalizeDraftSections(sectionsObject, geminiText);

    // Encrypt payloads
    const scrubbedInputEnc = maybeEncryptNotePayload(scrubbedText);
    const noteBodyEnc = maybeEncryptNotePayload(geminiText);
    const noteSectionsJsonEnc = sections.length
      ? maybeEncryptNotePayload(JSON.stringify(sections))
      : null;

    const draft = await ClientIntakeNoteDraft.create({
      agencyId,
      clientId,
      providerUserId: assignedProviderUserId,
      serviceCode,
      toolId,
      status: 'diagnosis_pending',
      scrubbedInputEnc,
      noteBodyEnc,
      noteSectionsJsonEnc,
      suggestedDxJson: suggestedDx ? JSON.stringify(suggestedDx) : null,
      intakeSubmissionId: resolvedSubmissionId ?? null
    });

    // Audit (non-blocking — missing ENUM values must not undo draft creation)
    try {
      await AdminAuditLog.logAction({
        actionType: 'client_intake_note_generated',
        actorUserId: req.user.id,
        targetUserId: null,
        agencyId,
        metadata: {
          clientId,
          draftId: draft.id,
          assignedProviderUserId,
          serviceCode,
          toolId,
          model: modelName,
          latencyMs
        }
      });
    } catch (auditErr) {
      console.error('[clientIntakeNote] Audit log failed after generate:', auditErr?.message || auditErr);
    }
    try {
      const { logNoteAidChartEvent } = await import('../services/noteAidChartAudit.service.js');
      await logNoteAidChartEvent(req, {
        clientId,
        agencyId,
        action: 'note_aid_intake_draft_created',
        metadata: { draftId: draft.id, serviceCode }
      });
    } catch {
      // best-effort
    }

    res.status(201).json({ draft: formatDraftResponse(draft) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /clients/:id/intake-note/:draftId/diagnosis
 *
 * HITL step: provider confirms, updates, or keeps the AI-suggested diagnosis.
 *
 * Body:
 *  - action: 'remain' | 'confirmed' | 'updated'
 *  - confirmedCode (string, required when action='updated')
 *  - confirmedDescription (string, optional when action='updated')
 *  - comment (string, optional)
 */
export const confirmClientIntakeDiagnosis = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    const draftId = safeInt(req.params.draftId);
    if (!clientId || !draftId) {
      return res.status(400).json({ error: { message: 'Invalid client id or draftId' } });
    }

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const draft = await ClientIntakeNoteDraft.findForClient({ draftId, clientId, agencyId });
    if (!draft) return res.status(404).json({ error: { message: 'Draft not found' } });
    if (draft.status === 'final') {
      return res.status(409).json({ error: { message: 'Intake note is already finalized' } });
    }
    if (draft.status === 'failed') {
      return res.status(409).json({ error: { message: 'Cannot confirm diagnosis on a failed draft' } });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['remain', 'confirmed', 'updated'].includes(action)) {
      return res.status(400).json({ error: { message: 'action must be remain | confirmed | updated' } });
    }

    let suggestedDx = null;
    try {
      suggestedDx = draft.suggested_dx_json ? JSON.parse(draft.suggested_dx_json) : null;
    } catch {
      suggestedDx = null;
    }

    let confirmedDx;
    if (action === 'updated') {
      const code = String(
        req.body?.confirmedCode || req.body?.code || ''
      ).trim();
      if (!code) {
        return res.status(400).json({ error: { message: 'confirmedCode is required when action is "updated"' } });
      }
      confirmedDx = {
        code,
        description: String(
          req.body?.confirmedDescription || req.body?.description || ''
        ).trim() || (suggestedDx?.description || ''),
        justification: String(
          req.body?.confirmedJustification ||
            req.body?.justification ||
            suggestedDx?.justification ||
            ''
        ).trim() || (suggestedDx?.justification || '')
      };
    } else {
      // remain / confirmed — keep suggested dx including justification
      confirmedDx = suggestedDx
        ? {
            code: suggestedDx.code,
            description: suggestedDx.description,
            justification: suggestedDx.justification || ''
          }
        : null;
    }

    const comment = req.body?.comment ? String(req.body.comment).trim() : null;

    // Persist confirmation audit record
    await ClientDiagnosisConfirmation.create({
      agencyId,
      clientId,
      draftId,
      action,
      suggestedDxJson: JSON.stringify(suggestedDx || {}),
      confirmedDxJson: JSON.stringify(confirmedDx || {}),
      comment,
      actorUserId: req.user.id
    });

    // Update draft
    const updated = await ClientIntakeNoteDraft.updateStatus({
      draftId,
      status: 'ready',
      diagnosisAction: action,
      confirmedDxJson: confirmedDx ? JSON.stringify(confirmedDx) : null
    });

    // Audit (non-blocking — missing ENUM values must not undo diagnosis confirm)
    const actionTypeMap = {
      remain: 'client_intake_note_diagnosis_remain',
      confirmed: 'client_intake_note_diagnosis_confirmed',
      updated: 'client_intake_note_diagnosis_updated'
    };
    try {
      await AdminAuditLog.logAction({
        actionType: actionTypeMap[action],
        actorUserId: req.user.id,
        targetUserId: null,
        agencyId,
        metadata: { clientId, draftId, action, confirmedCode: confirmedDx?.code || null }
      });
    } catch (auditErr) {
      console.error('[clientIntakeNote] Audit log failed after diagnosis:', auditErr?.message || auditErr);
    }

    res.json({ draft: formatDraftResponse(updated) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /clients/:id/intake-note/:draftId/finalize
 *
 * Locks the draft (status=final), creates a draft treatment plan, returns both.
 *
 * Body:
 *  - goals (array, optional) — [{goalText, projectedCompletion, objectives:[]}]
 */
export const finalizeClientIntakeNote = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    const draftId = safeInt(req.params.draftId);
    if (!clientId || !draftId) {
      return res.status(400).json({ error: { message: 'Invalid client id or draftId' } });
    }

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const draft = await ClientIntakeNoteDraft.findForClient({ draftId, clientId, agencyId });
    if (!draft) return res.status(404).json({ error: { message: 'Draft not found' } });
    const allowReplace = req.body?.replace === true || req.body?.forceReplace === true
      || req.query?.replace === '1' || req.query?.forceReplace === '1';
    if (draft.status === 'final') {
      if (!allowReplace) {
        return res.status(409).json({
          error: {
            message: 'Intake note is already finalized',
            code: 'intake_already_finalized',
            replaceAllowed: true
          }
        });
      }
      await ClientIntakeNoteDraft.reopenForReplace(draftId);
    }
    // Re-read after optional reopen
    const draftNow = allowReplace && draft.status === 'final'
      ? await ClientIntakeNoteDraft.findForClient({ draftId, clientId, agencyId })
      : draft;
    if (!draftNow) return res.status(404).json({ error: { message: 'Draft not found' } });
    if (draftNow.status !== 'ready') {
      return res.status(409).json({
        error: { message: `Draft must be in 'ready' status before finalizing (current: ${draftNow.status})` }
      });
    }

    // Build treatment plan goals from request or extract from note sections
    const requestGoals = Array.isArray(req.body?.goals) ? req.body.goals : [];
    const goals = requestGoals.map((g, i) => ({
      goalIndex: i + 1,
      goalText: String(g?.goalText || '').trim(),
      projectedCompletion: g?.projectedCompletion ? String(g.projectedCompletion).slice(0, 10) : null,
      status: 'active',
      objectives: Array.isArray(g?.objectives)
        ? g.objectives.map((o, oi) => ({
            objectiveIndex: oi + 1,
            objectiveText: String(o?.objectiveText || '').trim(),
            scaleCurrent: o?.scaleCurrent ?? null,
            scaleTarget: o?.scaleTarget ?? null,
            measurementMethod: o?.measurementMethod ? String(o.measurementMethod) : null
          }))
        : []
    })).filter((g) => g.goalText);

    // Create draft treatment plan (linked to this intake) — unless an imported / authoritative
    // treatment plan already owns diagnosis + presenting problem + justification.
    let treatmentPlan = null;
    let primaryDiagnosisId = null;
    let diagnosticJustification = null;
    try {
      const { pickAuthoritativeTreatmentPlan } = await import('../services/treatmentPlanPrecedence.service.js');
      const existingPlans = await ClinicalTreatmentPlan.listByClient({ agencyId, clientId });
      const authoritativePlanMeta = pickAuthoritativeTreatmentPlan(existingPlans);
      const authoritativePlan = authoritativePlanMeta?.id
        ? await ClinicalTreatmentPlan.findById(authoritativePlanMeta.id)
        : null;

      let confirmedDx = null;
      let allDiagnoses = [];
      try {
        const parsed = draftNow.confirmed_dx_json ? JSON.parse(draftNow.confirmed_dx_json) : null;
        if (Array.isArray(parsed?.diagnoses)) {
          allDiagnoses = parsed.diagnoses;
          confirmedDx = parsed.primary || parsed.diagnoses[0] || null;
        } else {
          confirmedDx = parsed;
          if (confirmedDx?.code) allDiagnoses = [confirmedDx];
        }
      } catch {
        confirmedDx = null;
      }
      if (!confirmedDx?.code) {
        try {
          const suggested = draftNow.suggested_dx_json ? JSON.parse(draftNow.suggested_dx_json) : null;
          if (Array.isArray(suggested?.diagnoses)) {
            allDiagnoses = suggested.diagnoses;
            confirmedDx = suggested.primary || suggested.diagnoses[0] || null;
          } else {
            confirmedDx = suggested;
            if (confirmedDx?.code) allDiagnoses = [confirmedDx];
          }
        } catch {
          confirmedDx = null;
        }
      }
      diagnosticJustification = String(confirmedDx?.justification || '').trim() || null;

      if (authoritativePlan) {
        // Treatment plan already on file: keep its primary dx / justification / presenting problem.
        // Still add any new intake codes as non-primary chart diagnoses for reference.
        for (let i = 0; i < allDiagnoses.length; i += 1) {
          const dx = allDiagnoses[i];
          if (!dx?.code) continue;
          await upsertClinicalDiagnosis({
            agencyId,
            clientId,
            icd10Code: dx.code,
            description: dx.description || null,
            justification: null,
            createdByUserId: req.user.id,
            setPrimary: false
          });
        }
        treatmentPlan = authoritativePlan;
        primaryDiagnosisId = authoritativePlan.primary_diagnosis_id || null;
        diagnosticJustification = authoritativePlan.diagnostic_justification || diagnosticJustification;
      } else {
        for (let i = 0; i < allDiagnoses.length; i += 1) {
          const dx = allDiagnoses[i];
          if (!dx?.code) continue;
          const dxId = await upsertClinicalDiagnosis({
            agencyId,
            clientId,
            icd10Code: dx.code,
            description: dx.description || null,
            justification: i === 0 ? diagnosticJustification : dx.justification || null,
            createdByUserId: req.user.id,
            setPrimary: i === 0
          });
          if (i === 0) primaryDiagnosisId = dxId;
        }

        if (!primaryDiagnosisId && confirmedDx?.code) {
          primaryDiagnosisId = await upsertPrimaryClinicalDiagnosis({
            agencyId,
            clientId,
            icd10Code: confirmedDx.code,
            description: confirmedDx.description || null,
            justification: diagnosticJustification,
            createdByUserId: req.user.id
          });
        }

        // Refresh or create linked Treatment Plan Draft from finalized intake content.
        const {
          refreshTreatmentPlanDraftFromIntake
        } = await import('../services/intakePacketBootstrap.service.js');
        treatmentPlan = await refreshTreatmentPlanDraftFromIntake({
          intakeDraft: { ...draftNow, status: 'final' },
          agencyId,
          clientId,
          actorUserId: req.user.id,
          goalsFromRequest: goals.length ? goals : null
        });
      }
    } catch (e) {
      // Failing to create the TP should not block note finalization — log and continue.
      console.error('[clientIntakeNote] Failed to create treatment plan / promote diagnosis:', e?.message);
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const finalized = await ClientIntakeNoteDraft.updateStatus({
      draftId,
      status: 'final',
      treatmentPlanId: treatmentPlan?.id ?? draftNow.treatment_plan_id ?? null,
      finalizedAt: now
    });

    // Audit (non-blocking — missing ENUM values must not undo a successful finalize)
    try {
      await AdminAuditLog.logAction({
        actionType: 'client_intake_note_finalized',
        actorUserId: req.user.id,
        targetUserId: null,
        agencyId,
        metadata: {
          clientId,
          draftId,
          serviceCode: draftNow.service_code,
          treatmentPlanId: treatmentPlan?.id ?? null,
          primaryDiagnosisId: primaryDiagnosisId || null
        }
      });
    } catch (auditErr) {
      console.error('[clientIntakeNote] Audit log failed after finalize:', auditErr?.message || auditErr);
    }
    try {
      const { logClientAccess } = await import('../services/clientAccessLog.service.js');
      await logClientAccess(req, clientId, 'intake_note_finalized');
    } catch {
      // best-effort
    }

    res.json({
      draft: formatDraftResponse(finalized),
      treatmentPlan: treatmentPlan
        ? {
            id: treatmentPlan.id,
            goals: treatmentPlan.goals || [],
            primaryDiagnosisId: primaryDiagnosisId || null
          }
        : null,
      primaryDiagnosisId: primaryDiagnosisId || null
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /clients/:id/records-copy-blocks
 * Chart-only demographics plus scrubbed clinical copy blocks for note writer paste.
 */
export const getClientRecordsCopyBlocks = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const extraNames = await collectScrubExtraNames(access.client);
    const demographics = await buildDemographicsCopyBlock(access.client);

    const { summaryText, resolvedSubmissionId, intakeData, link } = await resolveIntakeSummaryText({ clientId });
    const answersText = await resolveIntakeAnswersText({
      clientId,
      intakeSubmissionId: resolvedSubmissionId,
      intakeData,
      link
    });

    const clinicalDeidentified = answersText
      ? scrubIntakeTextForNoteWriter(answersText, { extraNames })
      : '';
    const intakeNarrative = summaryText
      ? scrubIntakeTextForNoteWriter(summaryText, { extraNames })
      : '';

    res.json({
      demographics,
      clinicalDeidentified,
      intakeNarrative
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// Internal: lightweight SOAP section parser (subset of full parser)
// ---------------------------------------------------------------------------

const INTAKE_SECTION_KEYS = [
  'Presenting Problem',
  'Chief Complaint',
  'History of Present Illness',
  'Psychiatric History',
  'Substance Use History',
  'Medical History',
  'Family History',
  'Social History',
  'Mental Status Examination',
  'Risk Assessment',
  'Diagnosis',
  'Clinical Impressions',
  'Assessment',
  'Plan',
  'Treatment Recommendations',
  'Goals',
  'Objective',
  'Subjective',
  'Interventions',
  'Discharge Plan'
];

function parseSections(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/);
  const sections = {};
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const content = buffer.join('\n').trim();
    if (content) sections[currentKey] = content;
    buffer = [];
  };

  const headerRe = new RegExp(
    `^(?:\\d+[.)\\s-]+)?(?:\\*{1,2})?` +
    `(${INTAKE_SECTION_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})` +
    `(?:\\*{1,2})?\\s*:?\\s*(.*)$`,
    'i'
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentKey) buffer.push('');
      continue;
    }
    const m = trimmed.match(headerRe);
    if (m) {
      flush();
      // Match to canonical key (case-insensitive)
      const matched = INTAKE_SECTION_KEYS.find(
        (k) => k.toLowerCase() === m[1].toLowerCase()
      );
      currentKey = matched || m[1];
      const inline = (m[2] || '').trim();
      if (inline) buffer.push(inline);
      continue;
    }
    buffer.push(line);
  }

  flush();
  return Object.keys(sections).length ? sections : null;
}

/**
 * POST /clients/:id/intake-note/import
 * Parse pasted intake text into a reviewable draft (sections preserved).
 * Body: { text, sections?, diagnosis?, serviceCode?, sessionContext? }
 */
export const importClientIntakeNote = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const { parseIntakeSections, parseIntakeDiagnoses } = await import('../services/intakeImport.service.js');
    const rawText = String(req.body?.text || req.body?.intakeText || '').trim();
    let sectionsInput = Array.isArray(req.body?.sections) ? req.body.sections : null;
    let parsedDiagnoses = [];
    if (!sectionsInput) {
      const parsed = parseIntakeSections(rawText);
      sectionsInput = parsed.sections;
      parsedDiagnoses = parsed.diagnoses || [];
    } else {
      parsedDiagnoses = parseIntakeDiagnoses(rawText);
    }

    const normalizedSections = (sectionsInput || []).map((sec, index) => ({
      key: String(sec.key || sec.title || sec.label || `section_${index + 1}`),
      label: String(sec.title || sec.label || sec.key || `Section ${index + 1}`),
      body: String(sec.content || sec.body || '').trim(),
      order: Number(sec.order || index + 1)
    })).filter((s) => s.body);

    const noteBody = normalizedSections
      .map((s) => `${s.label}\n${s.body}`)
      .join('\n\n')
      .slice(0, 50000);

    let diagnosis = req.body?.diagnosis || null;
    let diagnosesPayload = Array.isArray(req.body?.diagnoses) ? req.body.diagnoses : null;
    if (!diagnosesPayload?.length && parsedDiagnoses?.length) {
      diagnosesPayload = parsedDiagnoses;
    }
    if (!diagnosis && diagnosesPayload?.length) {
      diagnosis = {
        code: diagnosesPayload[0].code,
        description: diagnosesPayload[0].description || '',
        justification: diagnosesPayload[0].justification || ''
      };
    }
    if (!diagnosis) {
      diagnosis = extractSuggestedDiagnosis(rawText || noteBody);
    }
    if (diagnosis && !diagnosis.code && diagnosis.icd10Code) {
      diagnosis = {
        code: diagnosis.icd10Code,
        description: diagnosis.description || '',
        justification: diagnosis.justification || ''
      };
    }

    const serviceCode = String(req.body?.serviceCode || '90791').trim().toUpperCase();
    const toolId = serviceCode === 'H0031' ? 'clinical_h0031_intake' : 'clinical_90791_intake_plan';

    const status = diagnosis?.code ? 'ready' : 'diagnosis_pending';
    const noteBodyEnc = maybeEncryptNotePayload(noteBody);
    const noteSectionsJsonEnc = maybeEncryptNotePayload(JSON.stringify(normalizedSections));
    const sessionContextEnc = req.body?.sessionContext
      ? maybeEncryptNotePayload(JSON.stringify(req.body.sessionContext))
      : null;

    const suggestedDxJson = diagnosis
      ? JSON.stringify(
          diagnosesPayload?.length
            ? { diagnoses: diagnosesPayload, primary: diagnosis }
            : diagnosis
        )
      : null;
    const confirmedDxJson = diagnosis?.code && status === 'ready'
      ? JSON.stringify(diagnosis)
      : null;

    const existing = await ClientIntakeNoteDraft.latestForClient({ clientId, agencyId });
    let draft;
    if (existing?.id && existing.status !== 'failed') {
      if (existing.status === 'final') {
        await ClientIntakeNoteDraft.reopenForReplace(existing.id);
      }
      draft = await ClientIntakeNoteDraft.updateContent({
        draftId: existing.id,
        noteBodyEnc,
        noteSectionsJsonEnc,
        sessionContextEnc,
        suggestedDxJson,
        confirmedDxJson,
        status,
        scrubbedInputEnc: maybeEncryptNotePayload(rawText.slice(0, 20000)),
        diagnosisAction: diagnosis?.code && status === 'ready' ? 'confirmed' : null
      });
    } else {
      draft = await ClientIntakeNoteDraft.create({
        agencyId,
        clientId,
        providerUserId: req.user.id,
        serviceCode: ['90791', 'H0031'].includes(serviceCode) ? serviceCode : '90791',
        toolId,
        status,
        scrubbedInputEnc: maybeEncryptNotePayload(rawText.slice(0, 20000)),
        noteBodyEnc,
        noteSectionsJsonEnc,
        sessionContextEnc,
        suggestedDxJson
      });
      if (diagnosis?.code && status === 'ready') {
        await ClientIntakeNoteDraft.updateStatus({
          draftId: draft.id,
          status: 'ready',
          diagnosisAction: 'confirmed',
          confirmedDxJson
        });
      }
    }

    const refreshed = await ClientIntakeNoteDraft.findById(draft.id);
    try {
      const { logNoteAidChartEvent } = await import('../services/noteAidChartAudit.service.js');
      await logNoteAidChartEvent(req, {
        clientId,
        agencyId,
        action: 'note_aid_intake_draft_created',
        metadata: { draftId: draft.id, serviceCode: refreshed?.service_code }
      });
    } catch {
      // best-effort
    }
    return res.status(201).json({
      draft: formatDraftResponse(refreshed),
      parsed: { sections: normalizedSections, diagnosis, diagnoses: diagnosesPayload || (diagnosis ? [diagnosis] : []) }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /clients/:id/intake-note/:draftId/regenerate
 * Rebuild sections from current draft + clinician addendum (typed/spoken).
 * Body: { addendum?, revisionInstruction? }
 */
export const regenerateClientIntakeNote = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    const draftId = safeInt(req.params.draftId);
    if (!clientId || !draftId) {
      return res.status(400).json({ error: { message: 'Invalid client id or draftId' } });
    }

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const draft = await ClientIntakeNoteDraft.findForClient({ draftId, clientId, agencyId });
    if (!draft) return res.status(404).json({ error: { message: 'Draft not found' } });

    const addendum = String(
      req.body?.addendum || req.body?.revisionInstruction || req.body?.additionalInformation || ''
    ).trim();
    if (!addendum) {
      return res.status(400).json({
        error: { message: 'Add additional information or revision instructions before regenerating.' }
      });
    }

    const { regenerateIntakeDraftFromAddendum } = await import('../services/intakePacketBootstrap.service.js');
    const result = await regenerateIntakeDraftFromAddendum({
      draft,
      addendum,
      actorUserId: req.user.id
    });

    try {
      await AdminAuditLog.logAction({
        actionType: 'client_intake_note_generated',
        actorUserId: req.user.id,
        agencyId,
        metadata: {
          clientId,
          draftId,
          regenerated: true,
          model: result.modelName || null
        }
      });
    } catch {
      // best-effort
    }

    return res.json({
      draft: formatDraftResponse(result.draft),
      goals: result.goals || []
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * PATCH /clients/:id/intake-note/:draftId/sections
 * Update reviewed sections / diagnosis before finalize.
 */
export const updateClientIntakeNoteSections = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    const draftId = safeInt(req.params.draftId);
    if (!clientId || !draftId) {
      return res.status(400).json({ error: { message: 'Invalid client id or draftId' } });
    }

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = safeInt(access.client?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });

    const draft = await ClientIntakeNoteDraft.findForClient({ draftId, clientId, agencyId });
    if (!draft) return res.status(404).json({ error: { message: 'Draft not found' } });
    const allowReplace = req.body?.replace === true || req.body?.forceReplace === true
      || req.query?.replace === '1' || req.query?.forceReplace === '1';
    if (draft.status === 'final') {
      if (!allowReplace) {
        return res.status(409).json({
          error: {
            message: 'Intake note is already finalized',
            code: 'intake_already_finalized',
            replaceAllowed: true
          }
        });
      }
      await ClientIntakeNoteDraft.reopenForReplace(draftId);
    }
    if (draft.status === 'failed') {
      return res.status(409).json({ error: { message: 'Cannot update a failed draft' } });
    }

    const sectionsInput = Array.isArray(req.body?.sections) ? req.body.sections : null;
    let noteBodyEnc;
    let noteSectionsJsonEnc;
    if (sectionsInput) {
      const normalizedSections = sectionsInput.map((sec, index) => ({
        key: String(sec.key || sec.title || sec.label || `section_${index + 1}`),
        label: String(sec.title || sec.label || sec.key || `Section ${index + 1}`),
        body: String(sec.content || sec.body || '').trim(),
        order: Number(sec.order || index + 1)
      })).filter((s) => s.body);
      const noteBody = normalizedSections
        .map((s) => `${s.label}\n${s.body}`)
        .join('\n\n')
        .slice(0, 50000);
      noteBodyEnc = maybeEncryptNotePayload(noteBody);
      noteSectionsJsonEnc = maybeEncryptNotePayload(JSON.stringify(normalizedSections));
    }

    let confirmedDxJson;
    let status;
    const sharedJustification = String(
      req.body?.diagnosticJustification
        ?? req.body?.diagnostic_justification
        ?? ''
    ).trim();
    const diagnosesInput = Array.isArray(req.body?.diagnoses) ? req.body.diagnoses : null;
    if (diagnosesInput?.length) {
      const normalized = diagnosesInput
        .map((d, i) => ({
          code: String(d.code || d.icd10Code || d.icd10_code || '').trim(),
          description: String(d.description || '').trim(),
          justification: i === 0
            ? (sharedJustification || String(d.justification || '').trim())
            : '',
          isPrimary: d.isPrimary != null ? !!d.isPrimary : i === 0,
          evaluationScore: d.evaluationScore ?? null,
          evaluationSummary: d.evaluationSummary || null
        }))
        .filter((d) => d.code);
      if (normalized.length) {
        confirmedDxJson = JSON.stringify({
          diagnoses: normalized,
          primary: normalized[0],
          diagnosticJustification: normalized[0].justification || null
        });
        status = 'ready';
      }
    } else if (req.body?.diagnosis) {
      const d = req.body.diagnosis;
      const diagnosis = {
        code: String(d.code || d.icd10Code || d.icd10_code || '').trim(),
        description: String(d.description || '').trim(),
        justification: sharedJustification || String(d.justification || '').trim()
      };
      if (diagnosis.code) {
        confirmedDxJson = JSON.stringify(diagnosis);
        status = 'ready';
      }
    }

    const updated = await ClientIntakeNoteDraft.updateContent({
      draftId,
      noteBodyEnc,
      noteSectionsJsonEnc,
      confirmedDxJson,
      status
    });

    return res.json({ draft: formatDraftResponse(updated) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /clients/:id/intake-note/evaluate-diagnosis
 * AI score for how well justification matches diagnostic criteria.
 * Body: { icd10Code, description?, justification }
 */
export const evaluateIntakeDiagnosisJustification = async (req, res, next) => {
  try {
    const clientId = safeInt(req.params.id);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const access = await ensureClientAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const { evaluateDiagnosticJustification } = await import(
      '../services/diagnosticJustificationEvaluation.service.js'
    );
    const result = await evaluateDiagnosticJustification({
      icd10Code: req.body?.icd10Code || req.body?.code,
      description: req.body?.description,
      justification: req.body?.justification,
      diagnoses: Array.isArray(req.body?.diagnoses) ? req.body.diagnoses : null
    });
    return res.json({ evaluation: result });
  } catch (e) {
    next(e);
  }
};
