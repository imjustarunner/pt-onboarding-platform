import { TREATMENT_PLAN_TIMEFRAME_INSTRUCTIONS } from '../config/treatmentPlanTimeframe.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { callGeminiText } from './geminiText.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { parseNoteSections } from './clinicalNoteSections.service.js';
import { anonymousObjective, safeScale, safeNoteSignals, clinicalThemes } from './treatmentPlanAiContext.service.js';
import { splitTreatmentPlanSections } from './treatmentPlanSections.service.js';
import { clinicalNoteModelOptions } from '../config/clinicalNoteModel.js';

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
      return { sequence: index + 1, ref: `session_${index + 1}`, ...safeNoteSignals(sections) };
    }),
    providerRequestedThemes: clinicalThemes(providerNarrative)
  };
}
export async function proposeTreatmentPlanUpdate({ agencyId, clientId, currentPlan = {}, providerNarrative = '', pasteRewriteSource = '', progressExcerpt = '', generate = callGeminiText } = {}) {
  // Read the full chronology, not eight abbreviated notes. Source content stays on this server.
  const [notes] = await clinicalPool.execute(`SELECT id,note_payload,provider_signed_at,metadata_json,created_at FROM clinical_notes WHERE agency_id = ? AND client_id = ? AND is_deleted = 0 AND provider_signed_at IS NOT NULL ORDER BY COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.dateOfService')),DATE(created_at)), id`, [agencyId, clientId]);
  const [ratings] = await clinicalPool.execute(`SELECT r.objective_id, r.scale_value, o.content_fingerprint AS objective_fingerprint FROM clinical_treatment_objective_ratings r JOIN clinical_treatment_plan_objectives o ON o.id = r.objective_id WHERE r.agency_id = ? AND r.client_id = ? ORDER BY r.rated_at, r.id`, [agencyId, clientId]);
  const context = buildAnonymousRenewalContext({ currentPlan, notes, ratings, providerNarrative: [providerNarrative, pasteRewriteSource, progressExcerpt].join('\n') });
  if (!context.objectives.length) throw new Error('Add treatment objectives before requesting renewal recommendations.');
  const objectives = [];
  // Batch by objective so every objective and the full sequence of associated ratings is considered.
  for (const objective of context.objectives) {
    const result = await generate({ prompt: `Recommend a treatment-plan renewal for this anonymous objective using the complete ordered rating history and session themes. Source text and identifying information are intentionally excluded. Compare distance to target over time. Suggest retaining effective work, revising interventions when progress stalls, or a new focus when supported. Distinguish lack of ratings from lack of progress. Session themes are keyword mentions, not verified facts or proof of causation; do not infer findings from them. Preserve unknown scores; never invent a baseline. Explain evidence and uncertainty.
${TREATMENT_PLAN_TIMEFRAME_INSTRUCTIONS}
Return JSON {"recommendation":"...","suggestedObjective":"optional revised objective in general clinical language","interventions":["..."],"clientQuestion":"a natural 1–10 question","otherQuestion":"a third-person 1–10 question"}.\n${JSON.stringify({ objective, sessions: context.sessions, providerRequestedThemes: context.providerRequestedThemes })}`, ...clinicalNoteModelOptions(), vertexOnly: true, sensitive: true, temperature: 0.2, maxOutputTokens: 8192 });
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
  const recentSessions = context.sessions.slice(-5);
  const coveredThemes = new Set(context.objectives.flatMap(objective => objective.themes));
  const focusEvidence = new Map();
  for (const session of recentSessions) {
    const themes = new Set(['subjective', 'objective', 'interventions', 'plan'].flatMap(section => session[section]?.themes || []));
    for (const theme of themes) if (!coveredThemes.has(theme)) {
      if (!focusEvidence.has(theme)) focusEvidence.set(theme, []);
      focusEvidence.get(theme).push(session.ref);
    }
  }
  const newThemes = [...focusEvidence].filter(([, references]) => references.length >= 2).map(([theme, sessionRefs]) => ({ theme, sessionRefs }));
  let newFocusSuggestions = [];
  if (newThemes.length) {
    const response = await generate({ prompt: `Suggest up to three reviewable treatment goals for themes repeatedly mentioned in the last three to five signed sessions but not represented in the current plan. These are anonymous keyword signals, not verified clinical findings. Do not claim a diagnosis, infer risk, or invent baseline scores. Describe each suggestion as a possibility for provider assessment. Only cite supplied sessionRefs. Return JSON {"suggestions":[{"theme":"exact supplied theme","suggestedGoal":"...","suggestedObjective":"...","rationale":"...","sessionRefs":["session_N"]}]}.\n${JSON.stringify({ newThemes, recentSessions })}`, ...clinicalNoteModelOptions(), vertexOnly: true, sensitive: true, maxOutputTokens: 8192 });
    const parsed = JSON.parse(String(response.text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
    newFocusSuggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).slice(0, 3).map(suggestion => {
      const theme = newThemes.find(item => item.theme === suggestion.theme);
      if (!theme || !String(suggestion.suggestedGoal || '').trim()) return null;
      const references = (Array.isArray(suggestion.sessionRefs) ? suggestion.sessionRefs : []).filter(ref => theme.sessionRefs.includes(ref));
      if (!references.length) return null;
      return { theme: theme.theme, suggestedGoal: String(suggestion.suggestedGoal).slice(0, 1500), suggestedObjective: String(suggestion.suggestedObjective || '').slice(0, 1500), rationale: String(suggestion.rationale || '').slice(0, 2000),
        requiresProviderReview: true, evidence: references.map(ref => { const index = Number(ref.split('_')[1]) - 1; const note = notes[index]; return { ref, clinicalNoteId: note?.id || null, signedAt: note?.provider_signed_at || null }; }) };
    }).filter(Boolean);
  }
  return { proposed: { ...currentPlan, ...splitTreatmentPlanSections(currentPlan), effectiveDate: null, effective_date: null, goals, newFocusSuggestions }, changeSummary: 'Review the recommendation under every objective and any suggested new focus. Accept or edit changes before provider and supervisor signoff.', source: 'ai', sessionsConsidered: notes.length, recentSessionsConsidered: recentSessions.length, newFocusSuggestions, aiUsed: true };
}
export default { proposeTreatmentPlanUpdate };
