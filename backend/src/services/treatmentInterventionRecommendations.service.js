import { CLINICAL_INTERVENTION_SEED } from '../config/clinicalInterventionSeed.js';
import { clinicalThemes } from './treatmentPlanAiContext.service.js';
import { clinicalNoteModelOptions } from '../config/clinicalNoteModel.js';
import { callGeminiText } from './geminiText.service.js';

const catalogMatches = [
  [/anxiety|stress|intrusive/, ['Exploration of Coping Patterns', 'Relaxation/Deep Breathing', 'Psycho-Education']],
  [/mood|emotion|self-confidence/, ['Emotional Awareness', 'Exploration of Emotions', 'Skill Development']],
  [/communication|relationship|conflict/, ['Communication Skills', 'Conflict Resolution Strategies', 'Role-Play/Behavioral Rehearsal']],
  [/responsibilities|school|attention|motivation|routines|sleep/, ['Structured Problem Solving', 'Behavioral Intervention', 'Skill Development']]
];

export async function recommendObjectiveInterventions({ goalText, objectiveText, generate = callGeminiText }) {
  // Only allowlisted themes cross the AI boundary; never send raw goals, identifiers or custom catalog text.
  const context = { goalThemes: clinicalThemes(goalText), objectiveThemes: clinicalThemes(objectiveText) };
  if (!context.goalThemes.length && !context.objectiveThemes.length) {
    return { interventions: [], message: 'There is not enough recognized goal or objective context to recommend interventions. Select interventions manually.' };
  }
  try {
    const result = await generate({
      prompt: `Suggest 2–5 treatment interventions relevant to BOTH the anonymous goal and objective themes below. Themes are keyword mentions, not confirmed diagnoses or a complete clinical assessment. Do not infer severity, risk, facts or services already performed. Recommend for provider review within their scope of practice. Select only from the numbered catalog; return JSON {"indices":[0,1]} with no other fields. Do not select the entire list.\nCatalog: ${JSON.stringify(CLINICAL_INTERVENTION_SEED.map((name, index) => ({ index, name })))}\nContext: ${JSON.stringify(context)}`,
      ...clinicalNoteModelOptions(), vertexOnly: true, sensitive: true, jsonMode: true,
      temperature: 0.2,
      maxOutputTokens: 1024
    });
    const parsed = JSON.parse(String(result.text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    const indices = Array.isArray(parsed.indices) ? parsed.indices : [];
    const interventions = [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0 && index < CLINICAL_INTERVENTION_SEED.length))]
      .slice(0, 5).map((index) => CLINICAL_INTERVENTION_SEED[index]);
    if (!interventions.length) throw new Error('No usable intervention recommendations were returned.');
    return { interventions, source: 'ai' };
  } catch (error) {
    const themes = [...context.objectiveThemes, ...context.goalThemes].join(' ');
    const interventions = [...new Set(catalogMatches.flatMap(([pattern, names]) => pattern.test(themes) ? names : []))]
      .filter(name => CLINICAL_INTERVENTION_SEED.includes(name)).slice(0, 5);
    if (!interventions.length) throw error;
    return { interventions, source: 'catalog', message: 'Catalog suggestions are available for this objective.' };
  }
}
