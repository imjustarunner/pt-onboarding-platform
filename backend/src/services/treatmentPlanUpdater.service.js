import clinicalPool from '../config/clinicalDatabase.js';
import { callGeminiText } from './geminiText.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { parseNoteSections } from './clinicalNoteSections.service.js';
import { anonymousObjective, safeScale, safeNoteSignals, clinicalThemes } from './treatmentPlanAiContext.service.js';
import { splitTreatmentPlanSections } from './treatmentPlanSections.service.js';

export function buildAnonymousRenewalContext({ currentPlan, notes = [], ratings = [], providerNarrative = '' }) {
  const goals = (currentPlan?.goals || []).filter((g) => !g.superseded_at && g.status !== 'superseded');
  return {
    objectives: goals.flatMap((g, gi) => (g.objectives || []).filter((o) => !o.superseded_at && o.status !== 'superseded').map((o, oi) => ({
      ...anonymousObjective(o, `${gi + 1}.${oi + 1}`),
      ratings: ratings.filter((r) => Number(r.objective_id) === Number(o.id) || (o.content_fingerprint && r.objective_fingerprint === o.content_fingerprint)).map((r) => safeScale(r.scale_value)).filter((v) => v != null)
    }))),
    sessions: notes.map((n, index) => {
      const plain = maybeDecryptNotePayload(n.note_payload);
      let parsed; try { parsed = JSON.parse(plain); } catch { parsed = null; }
      if (parsed?._enc) throw new Error('A signed note could not be decrypted. Retry before requesting renewal recommendations.');
      const sections = parsed?.sections || parseNoteSections(plain);
      return { sequence: index + 1, ...safeNoteSignals(sections) };
    }),
    providerRequestedThemes: clinicalThemes(providerNarrative)
  };
}
export async function proposeTreatmentPlanUpdate({ agencyId, clientId, currentPlan = {}, providerNarrative = '', pasteRewriteSource = '', progressExcerpt = '', generate = callGeminiText } = {}) {
  // Read the full chronology, not eight abbreviated notes. Source content stays on this server.
  const [notes] = await clinicalPool.execute(`SELECT note_payload FROM clinical_notes WHERE agency_id = ? AND client_id = ? AND is_deleted = 0 AND provider_signed_at IS NOT NULL ORDER BY provider_signed_at, id`, [agencyId, clientId]);
  const [ratings] = await clinicalPool.execute(`SELECT r.objective_id, r.scale_value, o.content_fingerprint AS objective_fingerprint FROM clinical_treatment_objective_ratings r JOIN clinical_treatment_plan_objectives o ON o.id = r.objective_id WHERE r.agency_id = ? AND r.client_id = ? ORDER BY r.rated_at, r.id`, [agencyId, clientId]);
  const context = buildAnonymousRenewalContext({ currentPlan, notes, ratings, providerNarrative: [providerNarrative, pasteRewriteSource, progressExcerpt].join('\n') });
  if (!context.objectives.length) throw new Error('Add treatment objectives before requesting renewal recommendations.');
  const objectives = [];
  // Batch by objective so every objective and the full sequence of associated ratings is considered.
  for (const objective of context.objectives) {
    const result = await generate({ prompt: `Recommend a treatment-plan renewal for this anonymous objective using the complete ordered rating history and session themes. Source text and identifying information are intentionally excluded. Compare distance to target over time. Suggest retaining effective work, revising interventions when progress stalls, or a new focus when supported. Distinguish lack of ratings from lack of progress. Session themes are keyword mentions, not verified facts or proof of causation; do not infer findings from them. Preserve unknown scores; never invent a baseline. Explain evidence and uncertainty. Return JSON {"recommendation":"...","suggestedObjective":"optional revised objective in general clinical language","interventions":["..."],"clientQuestion":"a natural 1–10 question","otherQuestion":"a third-person 1–10 question"}.\n${JSON.stringify({ objective, sessions: context.sessions, providerRequestedThemes: context.providerRequestedThemes })}`, temperature: 0.2, maxOutputTokens: 2000 });
    const response = JSON.parse(String(result.text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
    objectives.push({ ref: objective.ref, ...response });
  }
  const goals = (currentPlan.goals || []).filter((g) => !g.superseded_at && g.status !== 'superseded').map((g, gi) => ({
    goalText: g.goalText || g.goal_text || '', durationMonths: g.durationMonths || null,
    objectives: (g.objectives || []).filter((o) => !o.superseded_at && o.status !== 'superseded').map((o, oi) => {
      const suggestion = objectives.find((item) => item.ref === `${gi + 1}.${oi + 1}`) || {};
      return { ...o, objectiveText: o.objectiveText || o.objective_text || '', scaleCurrent: o.scaleCurrent ?? o.scale_current, scaleTarget: o.scaleTarget ?? o.scale_target,
        scaleDirection: o.scaleDirection || o.scale_direction, interventions: o.interventions || [],
        renewalRecommendation: suggestion.recommendation || '', suggestedObjective: suggestion.suggestedObjective || '', suggestedInterventions: Array.isArray(suggestion.interventions) ? suggestion.interventions : [],
        kioskPrompt: suggestion.clientQuestion || '', kioskPromptOther: suggestion.otherQuestion || '' };
    })
  }));
  return { proposed: { ...currentPlan, ...splitTreatmentPlanSections(currentPlan), effectiveDate: new Date().toISOString().slice(0, 10), effective_date: new Date().toISOString().slice(0, 10), goals }, changeSummary: 'Review the recommendation under every objective. Accept or edit proposed changes before completing the renewal.', source: 'ai', sessionsConsidered: notes.length, aiUsed: true };
}
export default { proposeTreatmentPlanUpdate };
