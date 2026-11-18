import crypto from 'node:crypto';
import pool from '../config/database.js';
import NarrivaGeneratorSettings from '../models/NarrivaGeneratorSettings.model.js';
import { CLINICAL_NOTE_AGENT_TOOLS } from '../config/clinicalNoteAgentTools.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { clinicalNoteModelOptions } from '../config/clinicalNoteModel.js';
import { DEFAULT_NARRIVA_SERVICE_GENERATORS, normalizeNarrivaConfiguration, resolveNarrivaGenerator } from '../config/narrivaGeneratorPolicy.js';
import { loadNarrivaSettings, invalidateNarrivaSettings } from '../services/narrivaPlatformSettings.service.js';
import { buildPromptForTool, generateClinicalText } from '../services/clinicalNoteWriter.service.js';
import { loadNarrivaGuidanceContext } from '../services/narrivaGuidance.service.js';
import { createSessionPrivacyContext } from '../services/sessionAiPrivacy.service.js';
import { requireNarrivaIdentifierCorrection } from '../services/narrivaInputPrivacy.service.js';
import { requireNarrivaAgency } from '../services/narrivaAccess.service.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';

export function assertNarrivaPlatformAccess(user) {
  if (!user?.id || user.role !== 'super_admin' || user.demoMode || user.switchedFromUserId) throw Object.assign(new Error('Use your own authorized platform administrator account.'), { status: 403 });
}
const handle = fn => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { assertNarrivaPlatformAccess(req.user); await fn(req, res); }
  catch (error) { next(error); }
};
export async function getNarrivaGeneratorMappings(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId);
    await requireNarrivaAgency(req.user, agencyId);
    const settings = await loadNarrivaSettings();
    const services = await AgencyMedicalServiceCode.listByAgency(agencyId);
    const mappings = { ...DEFAULT_NARRIVA_SERVICE_GENERATORS, ...settings.configuration.mappings };
    res.set('Cache-Control', 'no-store');
    res.json({ settingsVersion: settings.version, mappings, services: services.filter(service => !service.isAddon).map(service => ({ code: service.serviceCode, toolId: resolveNarrivaGenerator({ serviceCode: service.serviceCode }, settings.configuration) })) });
  } catch (error) { next(error); }
}
export const getNarrivaPlatformSettings = handle(async (req, res) => {
  const settings = await loadNarrivaSettings({ refresh: true });
  const [services] = await pool.execute('SELECT service_code,MAX(description) AS description,COUNT(DISTINCT agency_id) AS agency_count FROM agency_medical_service_codes WHERE is_active=1 AND is_addon=0 GROUP BY service_code ORDER BY service_code');
  const [agencies] = await pool.execute('SELECT id,name FROM agencies ORDER BY name');
  res.json({ ...settings, ...await NarrivaGeneratorSettings.history(), agencies,
    model: clinicalNoteModelOptions().model, defaultMappings: DEFAULT_NARRIVA_SERVICE_GENERATORS,
    services: services.map(service => ({ code: service.service_code, description: service.description, agencyCount: service.agency_count, toolId: resolveNarrivaGenerator({ serviceCode: service.service_code }, settings.configuration) })),
    tools: CLINICAL_NOTE_AGENT_TOOLS.map(tool => ({ id: tool.id, name: tool.name, systemPrompt: tool.systemPrompt, outputInstructions: tool.outputInstructions, kbFolders: tool.kbFolders || [], source: 'Clinical Note Agent + shared output contracts', sourceHash: crypto.createHash('sha256').update([tool.systemPrompt, tool.outputInstructions].join('\n')).digest('hex') }))
  });
});
export const putNarrivaPlatformSettings = handle(async (req, res) => {
  const expectedVersion = Number(req.body?.expectedVersion);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !reason || reason.length > 2000) throw Object.assign(new Error('Provide the current settings version and a brief reason for this change.'), { status: 400 });
  const configuration = normalizeNarrivaConfiguration(req.body.configuration, CLINICAL_NOTE_AGENT_TOOLS.map(tool => tool.id));
  const settings = await NarrivaGeneratorSettings.save({ configuration, expectedVersion, reason, actorUserId: req.user.id });
  invalidateNarrivaSettings();
  res.json(settings);
});
export const testNarrivaGenerator = handle(async (req, res) => {
  const permitted = new Set(['agencyId', 'toolId', 'serviceCode', 'inputText', 'syntheticConfirmed']);
  if (Object.keys(req.body || {}).some(key => !permitted.has(key)) || req.body?.syntheticConfirmed !== true) throw Object.assign(new Error('Use fictional or deidentified tester content only. Chart, draft and session links are not accepted.'), { status: 422 });
  const inputText = String(req.body.inputText || '').trim();
  const agencyId = Number(req.body.agencyId), serviceCode = String(req.body.serviceCode || '').trim().toUpperCase();
  const tool = getNoteAidToolById(req.body.toolId);
  if (!tool || !Number.isSafeInteger(agencyId) || agencyId < 1 || !serviceCode || !inputText || inputText.length > 60000) throw Object.assign(new Error('Choose a workspace, service, generator and up to 60,000 characters of fictional source facts.'), { status: 422 });
  requireNarrivaIdentifierCorrection(inputText);
  const privacyContext = createSessionPrivacyContext();
  if (await privacyContext.redact(inputText) !== inputText) throw Object.assign(new Error('Remove identifying details before running a generator test.'), { status: 422, code: 'PHI_INPUT_REQUIRES_CORRECTION', quiet: true });
  const guidance = await loadNarrivaGuidanceContext({ agencyId, userId: req.user.id, source: {}, meta: { toolId: tool.id, serviceCode }, service: { code: serviceCode } });
  const result = await generateClinicalText({ tool, prompt: [buildPromptForTool({ tool, inputText }), guidance.guidance].join('\n\n'), privacyContext, generatorGuidance: guidance });
  res.json({ testOnly: true, toolId: tool.id, outputText: result.text, model: result.modelName, finishReason: result.finishReason, settingsVersion: result.generatorSettingsVersion, guidanceHash: guidance.guidanceHash, supportCoverage: guidance.supportCoverage, quickSignEligible: false, savedToChart: false });
});
export const postNarrivaGeneratorFeedback = handle(async (req, res) => {
  const tool = getNoteAidToolById(req.body?.toolId), feedback = String(req.body?.feedback || '').trim();
  if (!tool || req.body.syntheticConfirmed !== true || !feedback || feedback.length > 5000) throw Object.assign(new Error('Provide a generator and up to 5,000 characters of feedback without identifying details.'), { status: 422 });
  const privacy = createSessionPrivacyContext();
  const redacted = await privacy.redact(feedback);
  const settings = await loadNarrivaSettings();
  res.status(201).json(await NarrivaGeneratorSettings.feedback({ toolId: tool.id, settingsVersion: settings.version, feedback: redacted, actorUserId: req.user.id }));
});
