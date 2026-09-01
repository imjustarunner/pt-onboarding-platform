/**
 * After a school/office digital enrollment packet finalizes, asynchronously
 * create a full sectioned intake draft + linked Treatment Plan Draft on chart.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientIntakeNoteDraft from '../models/ClientIntakeNoteDraft.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { callGeminiText } from './geminiText.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { scrubIntakeTextForNoteWriter } from './phiScrubber.service.js';
import { collectClientPhiNames } from './clientPhiNames.service.js';
import { parseIntakeDiagnoses } from './intakeImport.service.js';
import { deriveCredentialTierFromText } from '../utils/credentialNormalization.js';

export const INTAKE_PACKET_BOOTSTRAP_TOOL = 'intake_packet_bootstrap';
export const TREATMENT_PLAN_DRAFT_TITLE = 'Treatment Plan Draft';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
      const matched = INTAKE_SECTION_KEYS.find((k) => k.toLowerCase() === m[1].toLowerCase());
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

function normalizeDraftSections(sectionsRaw, noteBody) {
  let sections = sectionsRaw;
  if (typeof sectionsRaw === 'string') {
    try { sections = JSON.parse(sectionsRaw); } catch { sections = null; }
  }
  if (Array.isArray(sections)) {
    return sections
      .map((sec, index) => ({
        key: String(sec?.key || sec?.label || `section_${index + 1}`),
        label: String(sec?.label || sec?.key || `Section ${index + 1}`),
        body: String(sec?.body ?? sec?.content ?? '')
      }))
      .filter((sec) => sec.body || sec.label);
  }
  if (sections && typeof sections === 'object') {
    return Object.entries(sections).map(([key, body]) => ({
      key,
      label: key,
      body: String(body ?? '')
    }));
  }
  if (noteBody) return [{ key: 'body', label: 'Note', body: noteBody }];
  return [];
}

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
  const codeMatch = raw.match(/\bDiagnos(?:is|tic)(?:\s+Code)?\s*:\s*([A-Z]\d+(?:\.\d+)?)/im);
  if (!codeMatch) return null;
  const code = codeMatch[1].trim();
  let description = '';
  const codeLine = raw.slice(raw.indexOf(codeMatch[0]));
  const afterCode = codeLine.replace(codeMatch[0], '').trim();
  const descLineMatch = afterCode.match(/^[—\-–]?\s*(.+)/);
  if (descLineMatch) {
    description = descLineMatch[1].split('\n')[0].trim().replace(/^[—\-–]\s*/, '');
  }
  const justMatch = raw.match(/\bJustification\s*:\s*([\s\S]+?)(?=\n\s*\n|\n\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$)/i);
  return {
    code,
    description,
    justification: justMatch ? String(justMatch[1] || '').trim().slice(0, 2000) : ''
  };
}

/**
 * Pull goals/objectives/scales from AI text (Goals section or Goal N: / Objective patterns).
 */
export function extractGoalsFromIntakeText(text) {
  const raw = String(text || '');
  const goals = [];
  const goalBlocks = raw
    .split(/\n(?=(?:Goal|GOAL)\s*\d+\s*[:.])/i)
    .filter((b) => /^(?:Goal|GOAL)\s*\d+\s*[:.]/i.test(b.trim()));
  const sourceBlocks = goalBlocks.length
    ? goalBlocks
    : (() => {
      const m = raw.match(/(?:^|\n)\s*Goals?\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Plan|Treatment Recommendations|Discharge|Diagnosis)\s*:|$)/i);
      return m ? [m[1]] : [];
    })();

  for (const block of sourceBlocks) {
    const lines = String(block || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let goalText = lines[0]
      .replace(/^(?:Goal|GOAL)\s*\d*\s*[:.\-–—]?\s*/i, '')
      .trim();
    if (!goalText && lines[1]) goalText = lines[1];
    if (!goalText) continue;
    const objectives = [];
    let currentObj = null;
    for (const line of lines.slice(1)) {
      if (/^(?:Objective|Obj\.?)\s*\d*/i.test(line) || /^[-*•]\s+/.test(line)) {
        if (currentObj?.objectiveText) objectives.push(currentObj);
        const text = line
          .replace(/^(?:Objective|Obj\.?)\s*\d*\s*[:.\-–—]?\s*/i, '')
          .replace(/^[-*•]\s+/, '')
          .trim();
        const scaleMatch = text.match(/(\d{1,2})\s*(?:\/|→|->|to)\s*(\d{1,2})/);
        currentObj = {
          objectiveIndex: objectives.length + 1,
          objectiveText: text.replace(/\s*\(?\s*\d{1,2}\s*(?:\/|→|->|to)\s*\d{1,2}\s*\)?/g, '').trim() || text,
          scaleCurrent: scaleMatch ? Math.max(1, Math.min(10, Number(scaleMatch[1]))) : null,
          scaleTarget: scaleMatch ? Math.max(1, Math.min(10, Number(scaleMatch[2]))) : null,
          measurementMethod: '1-10 scale (client self-report)'
        };
      } else if (currentObj) {
        currentObj.objectiveText = `${currentObj.objectiveText} ${line}`.trim();
        if (currentObj.scaleCurrent == null) {
          const scaleMatch = line.match(/(\d{1,2})\s*(?:\/|→|->|to)\s*(\d{1,2})/);
          if (scaleMatch) {
            currentObj.scaleCurrent = Math.max(1, Math.min(10, Number(scaleMatch[1])));
            currentObj.scaleTarget = Math.max(1, Math.min(10, Number(scaleMatch[2])));
          }
        }
      }
    }
    if (currentObj?.objectiveText) objectives.push(currentObj);
    if (!objectives.length) {
      objectives.push({
        objectiveIndex: 1,
        objectiveText: goalText,
        scaleCurrent: 3,
        scaleTarget: 7,
        measurementMethod: '1-10 scale (client self-report)'
      });
    }
    goals.push({
      goalIndex: goals.length + 1,
      goalText,
      status: 'active',
      objectives
    });
  }

  if (!goals.length) {
    goals.push({
      goalIndex: 1,
      goalText: 'Improve overall functioning and reduce target symptoms identified at intake.',
      status: 'active',
      objectives: [{
        objectiveIndex: 1,
        objectiveText: 'Engage in weekly therapeutic interventions and practice coping skills between sessions.',
        scaleCurrent: 3,
        scaleTarget: 7,
        measurementMethod: '1-10 scale (client self-report)'
      }]
    });
  }
  return goals.slice(0, 6);
}

async function resolveAssignedProviderUserId(clientId, client = null) {
  const cid = safeInt(clientId);
  if (!cid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT provider_user_id
       FROM client_provider_assignments
       WHERE client_id = ? AND is_active = TRUE
       ORDER BY is_primary DESC, id ASC
       LIMIT 1`,
      [cid]
    );
    if (rows?.[0]?.provider_user_id) return safeInt(rows[0].provider_user_id);
  } catch {
    // table may not exist
  }
  return safeInt(client?.provider_id || client?.provider_user_id || 0) || null;
}

async function getProviderCredentialText(userId) {
  const uid = safeInt(userId);
  if (!uid) return null;
  try {
    const [rows] = await pool.execute(`SELECT credential FROM users WHERE id = ? LIMIT 1`, [uid]);
    if (rows?.[0]?.credential) return String(rows[0].credential);
  } catch {
    // ignore
  }
  return null;
}

function resolveIntakeTier(tier) {
  if (tier === 'intern_plus') {
    return { serviceCode: '90791', toolId: 'clinical_90791_intake_plan' };
  }
  if (tier === 'bachelors' || tier === 'qbha') {
    return { serviceCode: 'H0031', toolId: 'clinical_h0031_intake' };
  }
  return { serviceCode: '90791', toolId: 'clinical_90791_intake_plan' };
}

async function resolveSummaryText({ clientId, intakeSubmissionId = null }) {
  const { resolveIntakeSummaryText } = await import('../controllers/clientIntakeNote.controller.js');
  return resolveIntakeSummaryText({ clientId, intakeSubmissionId });
}

async function runIntakeGemini({ scrubbedText, toolId }) {
  const tool = getNoteAidToolById(toolId) || getNoteAidToolById('clinical_90791_intake_plan');
  if (!tool) throw new Error(`Note Aid tool not configured: ${toolId}`);
  const systemPrompt = String(tool.systemPrompt || '').trim();
  const outputInstructions = String(tool.outputInstructions || '').trim();
  const prompt = [
    systemPrompt,
    '',
    outputInstructions ? `Output instructions:\n${outputInstructions}` : '',
    '',
    'After the clinical note sections, include structured treatment goals using this format:',
    'Goal 1: <goal text>',
    'Objective 1.1: <objective text> (current/target on 1-10, e.g. 3/8)',
    'Goal 2: ...',
    '',
    'Also include a structured diagnosis block:',
    'Diagnosis: <ICD-10 code> — <description>',
    'Justification: <1-3 sentence clinical rationale>',
    '',
    'Intake Summary (scrubbed — do NOT add any identifying information):',
    scrubbedText
  ].filter((l) => l !== undefined).join('\n');

  const { text, modelName, latencyMs } = await callGeminiText({
    prompt,
    temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
    maxOutputTokens: Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 3200,
    model: tool.model || null
  });
  return { text, modelName, latencyMs, toolId: tool.id || toolId };
}

/**
 * Create intake draft + linked Treatment Plan Draft from packet clinical info.
 * Idempotent per client/submission while a non-failed draft exists.
 */
export async function bootstrapIntakeAndPlanFromPacket({
  clientId,
  agencyId = null,
  submissionId = null,
  actorUserId = null
} = {}) {
  const cid = safeInt(clientId);
  if (!cid) return null;

  const client = await Client.findById(cid, { includeSensitive: true }).catch(() => null);
  const aid = safeInt(agencyId) || safeInt(client?.agency_id);
  if (!aid) {
    console.warn('[intakePacketBootstrap] missing agency for client', cid);
    return null;
  }

  const existing = await ClientIntakeNoteDraft.findOpenForSubmission({
    clientId: cid,
    agencyId: aid,
    intakeSubmissionId: submissionId
  });
  if (existing && existing.status !== 'final') {
    return { skipped: true, reason: 'draft_exists', draftId: existing.id };
  }
  if (existing?.status === 'final') {
    return { skipped: true, reason: 'already_final', draftId: existing.id };
  }

  const { summaryText, resolvedSubmissionId } = await resolveSummaryText({
    clientId: cid,
    intakeSubmissionId: submissionId
  });
  if (!String(summaryText || '').trim()) {
    console.warn('[intakePacketBootstrap] no summary text for client', cid);
    return { skipped: true, reason: 'no_summary' };
  }

  const providerUserId = await resolveAssignedProviderUserId(cid, client);
  let serviceCode = '90791';
  let toolId = 'clinical_90791_intake_plan';
  if (providerUserId) {
    const cred = await getProviderCredentialText(providerUserId);
    const tier = deriveCredentialTierFromText({ userRole: 'provider', providerCredentialText: cred });
    const info = resolveIntakeTier(tier);
    serviceCode = info.serviceCode;
    toolId = info.toolId;
  }

  const extraNames = await collectClientPhiNames(client).catch(() => []);
  const scrubbedText = scrubIntakeTextForNoteWriter(summaryText, { extraNames });
  const { text: geminiText, modelName, latencyMs } = await runIntakeGemini({ scrubbedText, toolId });

  const suggestedDx = extractSuggestedDiagnosis(geminiText);
  const sectionsObject = parseSections(geminiText);
  const sections = normalizeDraftSections(sectionsObject, geminiText);
  const goals = extractGoalsFromIntakeText(geminiText);

  const scrubbedInputEnc = maybeEncryptNotePayload(scrubbedText);
  const noteBodyEnc = maybeEncryptNotePayload(geminiText);
  const noteSectionsJsonEnc = sections.length
    ? maybeEncryptNotePayload(JSON.stringify(sections))
    : null;

  const draft = await ClientIntakeNoteDraft.create({
    agencyId: aid,
    clientId: cid,
    providerUserId,
    serviceCode,
    toolId,
    status: 'diagnosis_pending',
    scrubbedInputEnc,
    noteBodyEnc,
    noteSectionsJsonEnc,
    suggestedDxJson: suggestedDx ? JSON.stringify(suggestedDx) : null,
    intakeSubmissionId: resolvedSubmissionId || safeInt(submissionId)
  });

  let treatmentPlan = null;
  try {
    treatmentPlan = await ClinicalTreatmentPlan.create({
      agencyId: aid,
      clientId: cid,
      title: TREATMENT_PLAN_DRAFT_TITLE,
      status: 'draft',
      sourceToolId: INTAKE_PACKET_BOOTSTRAP_TOOL,
      createdByUserId: providerUserId || actorUserId || null,
      goals,
      diagnosticJustification: suggestedDx?.justification || null
    });
    if (treatmentPlan?.id) {
      await ClientIntakeNoteDraft.updateStatus({
        draftId: draft.id,
        status: draft.status,
        treatmentPlanId: treatmentPlan.id
      });
    }
  } catch (e) {
    console.error('[intakePacketBootstrap] treatment plan create failed', e?.message || e);
  }

  try {
    await AdminAuditLog.logAction({
      actionType: 'client_intake_note_generated',
      actorUserId: actorUserId || providerUserId || null,
      targetUserId: null,
      agencyId: aid,
      metadata: {
        clientId: cid,
        draftId: draft.id,
        treatmentPlanId: treatmentPlan?.id || null,
        source: INTAKE_PACKET_BOOTSTRAP_TOOL,
        model: modelName,
        latencyMs,
        submissionId: resolvedSubmissionId || submissionId || null
      }
    });
  } catch {
    // best-effort
  }

  return {
    draftId: draft.id,
    treatmentPlanId: treatmentPlan?.id || null,
    serviceCode,
    modelName
  };
}

/**
 * Fire-and-forget bootstrap for each client id from packet finalize.
 */
export function scheduleIntakePacketBootstraps({
  clientIds = [],
  agencyId = null,
  submissionId = null,
  actorUserId = null
} = {}) {
  const ids = [...new Set((clientIds || []).map((id) => safeInt(id)).filter(Boolean))];
  if (!ids.length) return;
  for (const clientId of ids) {
    void bootstrapIntakeAndPlanFromPacket({
      clientId,
      agencyId,
      submissionId,
      actorUserId
    }).catch((err) => {
      console.warn('[intakePacketBootstrap] failed for client', clientId, err?.message || err);
    });
  }
}

/**
 * Regenerate intake draft sections from current content + clinician addendum.
 */
export async function regenerateIntakeDraftFromAddendum({
  draft,
  addendum = '',
  actorUserId = null
}) {
  if (!draft?.id) throw new Error('draft required');
  if (draft.status === 'final') {
    const err = new Error('Cannot regenerate a finalized intake note');
    err.status = 409;
    throw err;
  }

  const existingBody = maybeDecryptNotePayload(draft.note_body_enc) || '';
  const existingSectionsEnc = maybeDecryptNotePayload(draft.note_sections_json_enc);
  let sectionsText = '';
  try {
    const parsed = existingSectionsEnc ? JSON.parse(existingSectionsEnc) : null;
    if (Array.isArray(parsed)) {
      sectionsText = parsed.map((s) => `${s.label || s.key}\n${s.body || ''}`).join('\n\n');
    } else {
      sectionsText = existingBody;
    }
  } catch {
    sectionsText = existingBody;
  }

  const scrubbedBase = maybeDecryptNotePayload(draft.scrubbed_input_enc) || '';
  const addendumClean = String(addendum || '').trim();
  const combined = [
    scrubbedBase ? `Original scrubbed intake summary:\n${scrubbedBase}` : '',
    sectionsText ? `Current draft sections:\n${sectionsText}` : '',
    addendumClean ? `Additional clinician information / revision instructions:\n${addendumClean}` : ''
  ].filter(Boolean).join('\n\n');

  const toolId = String(draft.tool_id || 'clinical_90791_intake_plan');
  const { text: geminiText, modelName } = await runIntakeGemini({
    scrubbedText: combined,
    toolId
  });

  const sectionsObject = parseSections(geminiText);
  const sections = normalizeDraftSections(sectionsObject, geminiText);
  let suggestedDx = null;
  try {
    suggestedDx = draft.suggested_dx_json ? JSON.parse(draft.suggested_dx_json) : null;
  } catch {
    suggestedDx = null;
  }
  // Keep confirmed diagnosis; refresh suggested only if none confirmed.
  const hasConfirmed = !!draft.confirmed_dx_json;
  if (!hasConfirmed) {
    suggestedDx = extractSuggestedDiagnosis(geminiText) || suggestedDx;
  }

  const updated = await ClientIntakeNoteDraft.updateContent({
    draftId: draft.id,
    noteBodyEnc: maybeEncryptNotePayload(geminiText),
    noteSectionsJsonEnc: sections.length
      ? maybeEncryptNotePayload(JSON.stringify(sections))
      : null,
    suggestedDxJson: suggestedDx ? JSON.stringify(suggestedDx) : draft.suggested_dx_json,
    status: draft.status === 'failed' ? 'diagnosis_pending' : draft.status
  });

  return { draft: updated, modelName, sections, goals: extractGoalsFromIntakeText(geminiText) };
}

/**
 * After intake finalize, refresh linked bootstrap TP draft (or create one).
 */
export async function refreshTreatmentPlanDraftFromIntake({
  intakeDraft,
  agencyId,
  clientId,
  actorUserId = null,
  goalsFromRequest = null
} = {}) {
  const aid = safeInt(agencyId);
  const cid = safeInt(clientId);
  if (!aid || !cid || !intakeDraft?.id) return null;

  const noteBody = maybeDecryptNotePayload(intakeDraft.note_body_enc) || '';
  const goals = Array.isArray(goalsFromRequest) && goalsFromRequest.length
    ? goalsFromRequest
    : extractGoalsFromIntakeText(noteBody);

  let justification = null;
  try {
    const confirmed = intakeDraft.confirmed_dx_json
      ? JSON.parse(intakeDraft.confirmed_dx_json)
      : null;
    justification = confirmed?.justification || null;
  } catch {
    justification = null;
  }

  const existingPlanId = safeInt(intakeDraft.treatment_plan_id);
  let plan = null;
  if (existingPlanId) {
    plan = await ClinicalTreatmentPlan.findById(existingPlanId);
  }

  const isBootstrapDraft = plan
    && String(plan.source_tool_id || '') === INTAKE_PACKET_BOOTSTRAP_TOOL
    && String(plan.status || '').toLowerCase() === 'draft';

  if (isBootstrapDraft) {
    // Replace draft by creating a fresh plan and leaving the old draft orphaned (still draft).
    // Prefer create new + relink to avoid complex amend supersede noise on bootstrap drafts.
    plan = await ClinicalTreatmentPlan.create({
      agencyId: aid,
      clientId: cid,
      title: TREATMENT_PLAN_DRAFT_TITLE,
      status: 'draft',
      sourceToolId: INTAKE_PACKET_BOOTSTRAP_TOOL,
      createdByUserId: actorUserId || intakeDraft.provider_user_id || null,
      goals,
      diagnosticJustification: justification
    });
  } else if (!plan) {
    plan = await ClinicalTreatmentPlan.create({
      agencyId: aid,
      clientId: cid,
      title: TREATMENT_PLAN_DRAFT_TITLE,
      status: 'draft',
      sourceToolId: INTAKE_PACKET_BOOTSTRAP_TOOL,
      createdByUserId: actorUserId || intakeDraft.provider_user_id || null,
      goals,
      diagnosticJustification: justification
    });
  }

  if (plan?.id) {
    await ClientIntakeNoteDraft.updateStatus({
      draftId: intakeDraft.id,
      status: intakeDraft.status || 'final',
      treatmentPlanId: plan.id,
      finalizedAt: intakeDraft.finalized_at || undefined
    });
  }
  return plan;
}

export function isPacketBootstrapPlan(plan) {
  return String(plan?.source_tool_id || plan?.sourceToolId || '').trim() === INTAKE_PACKET_BOOTSTRAP_TOOL
    && String(plan?.status || '').toLowerCase() === 'draft';
}
