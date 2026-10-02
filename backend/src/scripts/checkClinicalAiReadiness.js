// Run in the app's configured runtime with its service identity. This check uses
// fixed synthetic facts only, writes no records, and never prints model text.
import { pathToFileURL } from 'node:url';
import { sessionPrivacyConfigurationStatus, requireSessionPrivacyConfiguration, createSessionPrivacyContext } from '../services/sessionAiPrivacy.service.js';
import { encryptChatText, decryptChatText } from '../services/chatEncryption.service.js';
import { buildPromptForTool, generateClinicalText } from '../services/clinicalNoteWriter.service.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { parseTreatmentPlanText } from '../services/treatmentPlanImport.service.js';

export async function checkClinicalAiReadiness() {
  const configuration = sessionPrivacyConfigurationStatus();
  requireSessionPrivacyConfiguration();
  const synthetic = 'Synthetic readiness test only. No real person. The fictional client reports difficulty coping with everyday stress. The clinician requests one goal for practicing coping skills, two measurable objectives, and related interventions. Baseline measurements and diagnosis have not been assessed. Do not invent them.';
  if (decryptChatText(encryptChatText(synthetic)) !== synthetic) throw new Error('ENCRYPTION_ROUNDTRIP_FAILED');
  const privacyContext = createSessionPrivacyContext();
  const inspected = await privacyContext.redact(synthetic);
  const tool = getNoteAidToolById('clinical_psychotherapy_plan');
  const result = await generateClinicalText({ tool, prompt: buildPromptForTool({ tool, inputText: inspected }), privacyContext });
  const plan = parseTreatmentPlanText(result.text);
  if (result.provider !== 'vertex' || result.finishReason !== 'STOP' || !plan.goals?.some(goal => goal.objectives?.length)) {
    throw new Error('PLAN_REVIEW_CHECK_FAILED');
  }
  return { configuration, encryptionRoundtrip: true, privacyInspection: true, treatmentPlanReview: true, model: result.modelName };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkClinicalAiReadiness())); }
  catch (error) {
    console.error(JSON.stringify({ ready: false, configuration: sessionPrivacyConfigurationStatus(), code: error.code || 'READINESS_CHECK_FAILED', reason: error.details?.reason || null }));
    process.exitCode = 1;
  }
}
