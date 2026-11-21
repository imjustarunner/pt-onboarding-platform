import { CLINICAL_NOTE_AGENT_TOOLS } from '../config/clinicalNoteAgentTools.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';

export const THERAPY_NOTES_QUICK_COPY_ID = 'temporary_therapy_notes_quick_copy';
const RETIRED_TOOLS = new Set(['clinical_90791_note_aid', 'clinical_h0032_consult']);
const STAFF_ROLES = new Set(['super_admin', 'admin', 'staff', 'support', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'intern', 'intern_plus', 'facilitator']);
const TOOL_CODES = {
  clinical_h0004_note: ['H0004'], clinical_h0004_plan: ['H0004'], clinical_h2011_note: ['H2011'], clinical_h0031_intake: ['H0031'],
  clinical_h0031_additional: ['H0031'], clinical_h0032_plan_development: ['H0032'],
  clinical_h2014_group: ['H2014'], clinical_h2014_individual: ['H2014', 'H2015', 'H2016'],
  clinical_psychotherapy_note: ['90832', '90834', '90837', '90839'], clinical_family_note: ['90846', '90847'],
  clinical_90791_intake_plan: ['90791'], clinical_psc_17: ['H0002'], clinical_screening_review: ['H0002'],
  clinical_h0023_full_packet: ['H0023']
};

export function quickCopyTools() {
  return CLINICAL_NOTE_AGENT_TOOLS.filter(tool => !RETIRED_TOOLS.has(tool.id)).map(tool => ({
    id: tool.id, name: tool.name, description: tool.description,
    category: /plan/i.test(tool.id) ? 'Treatment plans' : /diagnosis|assessment|intake|screening|psc_17/i.test(tool.id) ? 'Assessments and diagnosis' : /termination|summary/i.test(tool.id) ? 'Summaries and termination' : 'Progress notes',
    serviceCodes: TOOL_CODES[tool.id] || []
  }));
}

export function assertQuickCopyStaff(user) {
  if (!STAFF_ROLES.has(String(user?.role || '').toLowerCase())) {
    throw Object.assign(new Error('Staff access is required for the Therapy Notes generator.'), { status: 403 });
  }
}

export function therapyNotesQuickGeneratorEnabled(agency, settings = []) {
  if (!agency) return false;
  const setting = settings.find(row => (row.catalog_aid_id || row.catalogAidId) === THERAPY_NOTES_QUICK_COPY_ID);
  return !setting || [true, 1, '1'].includes(setting.enabled);
}

export function assertQuickCopyHasNoChartContext(body) {
  if (['clientId', 'clinicalSessionId', 'officeEventId', 'draftId', 'appointmentId'].some(key => body?.[key] != null && body[key] !== '')) {
    throw Object.assign(new Error('Quick copy generates text only. Start it without a client, session, appointment, or existing draft.'), { status: 400 });
  }
  if (!quickCopyTools().some(tool => tool.id === String(body?.toolId || '').trim())) {
    throw Object.assign(new Error('Choose a Therapy Notes generator type.'), { status: 400 });
  }
  if (body?.recordingPurpose && body.recordingPurpose !== 'dictation') throw Object.assign(new Error('Use this generator to dictate your notes, not to record a client session.'), { status: 400 });
}

// The outer marker is non-sensitive and lets SQL separate these personal notes
// before pagination. The client name and the authoritative marker stay encrypted.
export function encryptQuickCopyOutput(output) {
  return JSON.stringify({ ...JSON.parse(maybeEncryptNotePayload(JSON.stringify(output))), _quickCopy: true });
}

export function isQuickCopyDraft(row) {
  if (!row?.output_json) return false;
  try {
    const envelope = typeof row.output_json === 'object' ? row.output_json : JSON.parse(row.output_json);
    return envelope?._quickCopy === true || envelope?.meta?.quickCopyOnly === true;
  } catch { return false; }
}

export function readQuickCopyNote(row, { full = true } = {}) {
  if (!row || !isQuickCopyDraft(row) || row.client_id || row.clinical_session_id || row.office_event_id) return null;
  const output = JSON.parse(maybeDecryptNotePayload(row.output_json));
  if (output?.meta?.quickCopyOnly !== true) return null;
  return {
    id: Number(row.id), clientName: output.meta.clientName || '',
    dateOfService: String(output.meta.dateOfService || row.date_of_service || '').slice(0, 10),
    toolId: output.meta.toolId, toolName: quickCopyTools().find(tool => tool.id === output.meta.toolId)?.name || 'Therapy Notes note',
    serviceCode: output.meta.serviceCode || null, createdAt: row.created_at || null, updatedAt: row.updated_at || null,
    ...(full ? { outputJson: output, inputText: maybeDecryptNotePayload(row.input_text) } : {})
  };
}
