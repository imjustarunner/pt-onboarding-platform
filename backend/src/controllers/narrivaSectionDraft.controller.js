import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import { requireNarrivaClient } from '../services/narrivaAccess.service.js';
import { requireStaffCareEligibility } from '../services/staffCareEligibility.service.js';
import { assertActualProgressSessionSnapshot } from '../services/clinicalProgressSessionGate.service.js';
import { assertEncounterTreatmentPlanEligibility } from '../services/treatmentPlanEncounterEligibility.service.js';
import { loadNarrivaSettings } from '../services/narrivaPlatformSettings.service.js';
import { resolveNarrivaGenerator } from '../config/narrivaGeneratorPolicy.js';
import { resolveProBonoDocumentationService } from '../utils/clinicalFundingPolicy.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { isProgressNoteToolId } from '../config/clinicalNotePlanOutput.js';
import { loadNarrivaGuidanceContext } from '../services/narrivaGuidance.service.js';
import { buildPromptForTool, generateClinicalText } from '../services/clinicalNoteWriter.service.js';
import { createSessionPrivacyContext } from '../services/sessionAiPrivacy.service.js';
import { parseNoteSections } from '../services/clinicalNoteSections.service.js';
import { narrivaFeatures } from '../services/narrivaReview.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status, quiet: true });
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; } catch { return {}; } };
export function createNarrivaSectionDraftHandler(dependencies = {}) {
  const findSession = dependencies.findSession || (id => ClinicalSession.findById(id));
  const clientAccess = dependencies.clientAccess || requireNarrivaClient;
  const careEligibility = dependencies.careEligibility || requireStaffCareEligibility;
  const planEligibility = dependencies.planEligibility || assertEncounterTreatmentPlanEligibility;
  const settingsProvider = dependencies.settings || loadNarrivaSettings;
  const guidanceProvider = dependencies.guidance || loadNarrivaGuidanceContext;
  const writer = dependencies.writer || generateClinicalText;
  const privacy = dependencies.privacy || createSessionPrivacyContext;
  const features = dependencies.features || narrivaFeatures;
  return async (req, res, next) => {
    try {
      const body = req.body || {}, allowed = new Set(['agencyId', 'clientId', 'clinicalSessionId', 'serviceCode', 'section', 'inputText']);
      if (Object.keys(body).some(key => !allowed.has(key)) || body.section !== 'Plan') throw fail(422, 'Only a Plan section preview is supported.');
      const agencyId = positive(body.agencyId), clientId = positive(body.clientId), sessionId = positive(body.clinicalSessionId);
      const inputText = String(body.inputText || '').trim();
      if (!agencyId || !clientId || !sessionId || !inputText) throw fail(422, 'Open your assigned clinical session and enter source facts before requesting a Plan draft.');
      if (inputText.length > 12000) throw fail(413, 'The guided source facts exceed 12,000 characters. Your entries have not changed.');
      const client = await clientAccess(req.user, agencyId, clientId);
      if (!(await features(agencyId)).writing) throw fail(403, 'Narriva writing is disabled for this workspace. Your source facts have not changed.');
      const session = await findSession(sessionId);
      if (!session || Number(session.agency_id) !== agencyId || Number(session.client_id) !== clientId) throw fail(404, 'This clinical session is not available for this client and workspace.');
      assertActualProgressSessionSnapshot(session, { providerUserId: req.user.id });
      await careEligibility(req.user.id, agencyId);
      const metadata = parse(session.metadata_json), actualService = String(session.service_code || metadata.serviceCode || '').trim().toUpperCase();
      if (!actualService || String(body.serviceCode || '').trim().toUpperCase() !== actualService) throw fail(409, 'The service changed. Refresh this session before requesting a section draft.');
      const documentationServiceCode = resolveProBonoDocumentationService({ serviceCode: actualService, metadata }).serviceCode;
      if (!documentationServiceCode) throw fail(409, 'Confirm the actual clinical service in the session header before requesting a Plan draft.');
      const settings = await settingsProvider();
      const toolId = resolveNarrivaGenerator({ serviceCode: documentationServiceCode, sessionMode: metadata.programId || metadata.sessionMode === 'group' ? 'group' : 'individual' }, settings.configuration);
      const tool = getNoteAidToolById(toolId);
      if (!tool || !isProgressNoteToolId(tool.id)) throw fail(409, 'No progress-note generator is linked to this service. Review its Narriva platform mapping.');
      let dateOfService = metadata.serviceDate || metadata.dateOfService;
      if (!dateOfService && session.scheduled_start_at) {
        const raw = String(session.scheduled_start_at).replace(' ', 'T');
        const date = session.scheduled_start_at instanceof Date ? session.scheduled_start_at : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
        if (!Number.isFinite(+date)) throw fail(409, 'The scheduled service date needs correction before requesting a Plan draft.');
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: session.source_timezone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
        dateOfService = `${parts.year}-${parts.month}-${parts.day}`;
      }
      await planEligibility({ agencyId, clientId, dateOfService });
      const guidance = await guidanceProvider({ agencyId, userId: req.user.id, source: session, meta: { ...metadata, toolId, serviceCode: actualService }, service: { code: actualService } });
      const privacyContext = privacy({ clientNames: [client.full_name, client.first_name, client.last_name, client.initials], providerNames: [req.user.first_name, req.user.last_name, req.user.firstName, req.user.lastName] });
      const prompt = [buildPromptForTool({ tool, inputText }), guidance.guidance,
        'The clinician requested a Plan-field preview from these source facts. Keep the normal required output structure so the Plan can be extracted consistently. The Plan must describe follow-up supported by the clinician input and treatment goals. Do not invent homework, frequency, referrals, agreements or a generic follow-up that was not supported. Where follow-up is unspecified, identify what needs clinician clarification.'].join('\n\n');
      const result = await writer({ tool, prompt, privacyContext, generatorGuidance: guidance });
      const text = parseNoteSections(result.text).Plan?.trim();
      if (result.finishReason !== 'STOP' || !text) throw fail(502, 'The writer did not complete a Plan section. Your source facts have not changed.');
      res.set('Cache-Control', 'no-store');
      res.json({ section: 'Plan', text, model: result.modelName, settingsVersion: result.generatorSettingsVersion, guidanceHash: guidance.guidanceHash, previewOnly: true, savedToChart: false, quickSignEligible: false });
    } catch (error) { next(error); }
  };
}
export const draftNarrivaSection = createNarrivaSectionDraftHandler();
