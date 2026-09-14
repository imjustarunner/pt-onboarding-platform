import { CLINICAL_INTERVENTION_SEED } from '../config/clinicalInterventionSeed.js';
import { clinicalThemes } from './treatmentPlanAiContext.service.js';
import { callGeminiText } from './geminiText.service.js';

export async function recommendObjectiveInterventions({ goalText, objectiveText, generate = callGeminiText }) {
  // Only allowlisted themes cross the AI boundary; never send raw goals, identifiers or custom catalog text.
  const context = { goalThemes: clinicalThemes(goalText), objectiveThemes: clinicalThemes(objectiveText) };
  if (!context.goalThemes.length && !context.objectiveThemes.length) {
    return { interventions: [], message: 'There is not enough recognized goal or objective context to recommend interventions. Select interventions manually.' };
  }
  const result = await generate({
    prompt: `Suggest 2–5 treatment interventions relevant to BOTH the anonymous goal and objective themes below. Themes are keyword mentions, not confirmed diagnoses or a complete clinical assessment. Do not infer severity, risk, facts or services already performed. Recommend for provider review within their scope of practice. Select only from the numbered catalog; return JSON {"indices":[0,1]} with no other fields. Do not select the entire list.\nCatalog: ${JSON.stringify(CLINICAL_INTERVENTION_SEED.map((name, index) => ({ index, name })))}\nContext: ${JSON.stringify(context)}`,
    temperature: 0.2,
    maxOutputTokens: 500
  });
  const parsed = JSON.parse(String(result.text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  const indices = Array.isArray(parsed.indices) ? parsed.indices : [];
  const interventions = [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0 && index < CLINICAL_INTERVENTION_SEED.length))]
    .slice(0, 5).map((index) => CLINICAL_INTERVENTION_SEED[index]);
  if (!interventions.length) throw new Error('No usable intervention recommendations were returned.');
  return { interventions, source: 'ai' };
}
