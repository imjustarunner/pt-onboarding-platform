import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import NoteAidAgencyCatalog from '../models/NoteAidAgencyCatalog.model.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { createSessionPrivacyContext } from '../services/sessionAiPrivacy.service.js';
import { buildPromptForTool, generateClinicalText } from '../services/clinicalNoteWriter.service.js';
import { getKnowledgeBaseContext, noteAidKnowledgeBaseOptions } from '../services/clinicalKnowledgeBase.service.js';
import { parseNoteSections, intakeOutputError } from '../services/clinicalNoteSections.service.js';
import { transcribeLongAudio } from '../services/speechTranscription.service.js';
import { logNoteAidChartEvent } from '../services/noteAidChartAudit.service.js';
import { maybeEncryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { assertQuickCopyHasNoChartContext, assertQuickCopyStaff, encryptQuickCopyOutput, quickCopyTools, readQuickCopyNote, therapyNotesQuickGeneratorEnabled } from '../utils/therapyNotesQuickGenerator.js';

const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = (status, message) => Object.assign(new Error(message), { status });
const parseFlags = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };

async function authorize(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw fail(400, 'Check the generator request and try again.');
  assertQuickCopyStaff(req.user);
  const agencyId = positive(req.body?.agencyId || req.query?.agencyId);
  if (!agencyId) throw fail(400, 'agencyId is required');
  if (req.auricwellPreview && Number(req.auricwellPreview.agencyId) !== agencyId) throw fail(403, 'Choose your current organization.');
  // This separate tool is available to active staff; it does not grant care,
  // billing, chart, or session permissions.
  if (String(req.user.role).toLowerCase() !== 'super_admin') {
    const agencies = await User.getAgencies(req.user.id);
    if (!agencies.some(agency => Number(agency.id) === agencyId)) throw fail(403, 'You do not have access to this organization.');
  }
  const agency = await Agency.findById(agencyId);
  const flags = parseFlags(agency?.feature_flags);
  const settings = await NoteAidAgencyCatalog.listSettings(agencyId);
  if ((flags.noteAidEnabled === false && flags.clinicalNoteGeneratorEnabled === false) || !therapyNotesQuickGeneratorEnabled(agency, settings)) {
    throw fail(403, 'The temporary Therapy Notes generator is disabled for this organization.');
  }
  return { agencyId, agency, flags };
}

function handler(action) {
  return async (req, res, next) => {
    try { return await action(req, res); }
    catch (error) { if (error.status) return res.status(error.status).json({ error: { message: error.message } }); next(error); }
  };
}

async function ownNote(req, agencyId, id) {
  const row = await ClinicalNoteDraft.findByIdForUser({ draftId: positive(id), userId: req.user.id });
  const note = Number(row?.agency_id) === agencyId ? readQuickCopyNote(row) : null;
  if (!note) throw fail(404, 'This saved generator note is not available.');
  return { row, note };
}

function subject(body) {
  const clientName = String(body?.clientName || '').trim();
  const dateOfService = String(body?.dateOfService || '').trim();
  if (!clientName || clientName.length > 200) throw fail(400, 'Enter a client name of up to 200 characters.');
  const parsedDate = new Date(`${dateOfService}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfService) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfService) throw fail(400, 'Enter the date of service.');
  return { clientName, dateOfService };
}

export const getTherapyNotesQuickCopyCatalog = handler(async (req, res) => {
  await authorize(req);
  return res.json({ enabled: true, tools: quickCopyTools() });
});

export const listTherapyNotesQuickCopyNotes = handler(async (req, res) => {
  const { agencyId } = await authorize(req);
  const rows = await ClinicalNoteDraft.listQuickCopyForUser({ userId: req.user.id, agencyId });
  const notes = rows.filter(row => Number(row.agency_id) === agencyId).map(row => readQuickCopyNote(row, { full: false })).filter(Boolean);
  return res.json({ notes });
});

export const getTherapyNotesQuickCopyNote = handler(async (req, res) => {
  const { agencyId } = await authorize(req);
  return res.json({ note: (await ownNote(req, agencyId, req.params.id)).note });
});

export const updateTherapyNotesQuickCopyNote = handler(async (req, res) => {
  const { agencyId } = await authorize(req);
  const { note } = await ownNote(req, agencyId, req.params.id);
  const { clientName, dateOfService } = subject({ clientName: req.body.clientName ?? note.clientName, dateOfService: req.body.dateOfService ?? note.dateOfService });
  const sections = req.body.sections ?? note.outputJson.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections) || Object.keys(sections).length > 150 || Object.values(sections).some(value => typeof value !== 'string') || JSON.stringify(sections).length > 1500000) {
    throw fail(400, 'Provide the edited note sections.');
  }
  const inputText = req.body.inputText === undefined ? note.inputText : String(req.body.inputText || '');
  if (inputText.length > 1500000) throw fail(400, 'The narrative is too long to save.');
  const output = { ...note.outputJson, sections, meta: { ...note.outputJson.meta, clientName, dateOfService, quickCopyOnly: true } };
  const updated = await ClinicalNoteDraft.updateForUser({ draftId: note.id, userId: req.user.id,
    patch: { dateOfService, inputText: maybeEncryptNotePayload(inputText), outputJson: encryptQuickCopyOutput(output) } });
  await logNoteAidChartEvent(req, { agencyId, action: 'therapy_notes_generator_note_updated', metadata: { quickCopyNoteId: note.id } });
  return res.json({ note: readQuickCopyNote(updated) });
});

export const transcribeTherapyNotesQuickCopy = handler(async (req, res) => {
  const { agencyId } = await authorize(req);
  if (req.body?.recordingPurpose !== 'dictation') throw fail(400, 'Use this tool to dictate your own notes. Client-session recording belongs in the session workflow.');
  if (['clientId', 'clinicalSessionId', 'officeEventId', 'appointmentId', 'draftId'].some(key => req.body[key] != null && req.body[key] !== '')) throw fail(400, 'Dictation does not attach to a client or session.');
  if (!req.file?.buffer) throw fail(400, 'Record your dictation before transcribing.');
  const transcript = await transcribeLongAudio({ buffer: req.file.buffer, mimeType: req.file.mimetype, languageCode: 'en-US', userId: req.user.id });
  await logNoteAidChartEvent(req, { agencyId, action: 'therapy_notes_generator_dictation_transcribed', metadata: { recordingPurpose: 'dictation' } });
  return res.json({ transcript: String(transcript || '').trim(), text: String(transcript || '').trim() });
});

export const generateTherapyNotesQuickCopy = handler(async (req, res) => {
  const { agencyId, flags } = await authorize(req);
  assertQuickCopyHasNoChartContext(req.body);
  if (req.file) throw fail(400, 'Transcribe your dictation first, then generate the note from the text.');
  const { clientName, dateOfService } = subject(req.body);
  const toolId = String(req.body.toolId || '').trim();
  const tool = getNoteAidToolById(toolId);
  const descriptor = quickCopyTools().find(item => item.id === toolId);
  const serviceCode = String(req.body.serviceCode || (descriptor.serviceCodes.length === 1 ? descriptor.serviceCodes[0] : '')).trim().toUpperCase();
  if (serviceCode && descriptor.serviceCodes.length && !descriptor.serviceCodes.includes(serviceCode)) throw fail(400, 'Choose a service code supported by the selected generator.');
  const existing = req.body.quickCopyNoteId ? await ownNote(req, agencyId, req.body.quickCopyNoteId) : null;
  const rawInput = String(req.body.inputText || '').trim();
  if (!rawInput || rawInput.length > 1500000) throw fail(400, 'Enter session notes of up to 1,500,000 characters.');
  const privacyContext = createSessionPrivacyContext({ identifiers: [clientName], clientNames: [clientName], providerNames: [req.user.first_name, req.user.last_name, req.user.firstName, req.user.lastName] });
  const inputText = await privacyContext.redact(rawInput);
  let prompt = buildPromptForTool({ tool, inputText });
  prompt += `\n\nClinician-selected generator: ${tool.name}.\nDate of service supplied by clinician: ${dateOfService}.${serviceCode ? `\nSelected documentation service code: ${serviceCode}. Write in the selected service\'s trained format; do not silently substitute a different service.` : ''}`;
  prompt += '\n\nThis is a standalone TherapyNotes draft based only on the supplied narrative. No client chart, appointment, or session is attached. Do not invent missing history, duration, consent, diagnosis, assessment findings, goals, or outcomes. Identify information that was not supplied rather than assuming it. Return the selected generator\'s trained sections for clinician review and copying.';
  if (tool.includeKnowledgeBase) {
    const override = flags.noteAidKbFolderOverrides?.[toolId];
    const baseFolders = Array.isArray(override) ? override : (Array.isArray(tool.kbFolders) ? tool.kbFolders : ['shared']);
    const folders = [...new Set([...baseFolders, ...(Array.isArray(flags.noteAidKbExtraFolders) ? flags.noteAidKbExtraFolders : [])]
      .map(folder => String(folder || '').trim().replace(/^\/+|\/+$/g, '')).filter(folder => folder && !folder.includes('..')))];
    const knowledge = await getKnowledgeBaseContext(noteAidKnowledgeBaseOptions({ query: inputText, folders, titleHints: [tool.name], codeHints: serviceCode ? [serviceCode] : [] })).catch(() => '');
    if (knowledge) prompt += `\n\nKnowledge Base Context (read-only):\n${knowledge}`;
  }
  const result = await generateClinicalText({ tool, prompt, privacyContext });
  const sections = parseNoteSections(result.text, { intake: ['clinical_90791_intake_plan', 'clinical_h0031_intake'].includes(toolId) });
  const error = intakeOutputError(toolId, sections, result.finishReason);
  if (error) throw fail(422, error);
  if (!Object.keys(sections).length && !String(result.text || '').trim()) throw fail(502, 'No note was returned. Please try again.');
  const output = { sections: Object.keys(sections).length ? sections : { Output: String(result.text || '').trim() }, meta: {
    quickCopyOnly: true, clientName, dateOfService, toolId, toolName: tool.name,
    serviceCode: serviceCode || null,
    dateWritten: new Date().toISOString().slice(0, 10), model: result.modelName, latencyMs: result.latencyMs
  } };
  const patch = { agencyId, clientId: null, clinicalSessionId: null, officeEventId: null, programId: null, initials: null,
    serviceCode: output.meta.serviceCode, dateOfService, inputText: maybeEncryptNotePayload(rawInput), outputJson: encryptQuickCopyOutput(output) };
  const saved = existing
    ? await ClinicalNoteDraft.updateForUser({ draftId: existing.note.id, userId: req.user.id, patch })
    : await ClinicalNoteDraft.create({ userId: req.user.id, ...patch, allowReuse: false });
  const note = readQuickCopyNote(saved);
  if (!note) throw fail(503, 'The generated note could not be saved securely. Please retry.');
  await logNoteAidChartEvent(req, { agencyId, action: 'therapy_notes_generator_note_generated', metadata: { quickCopyNoteId: note.id, toolId, serviceCode: output.meta.serviceCode } });
  return res.json({ quickCopyOnly: true, draftId: note.id, quickCopyNoteId: note.id, outputJson: output, note });
});
