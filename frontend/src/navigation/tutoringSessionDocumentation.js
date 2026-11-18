// Shared by the session interface and server. Text is assembled only from plan
// selections and recorded results; no model, default ratings or inferred gains.
export const SESSION_RATINGS = Object.freeze([
  { key: 'emerging', score: 1, label: 'Needs reteaching', next: 'Revisit' },
  { key: 'developing', score: 2, label: 'Needs guided practice', next: 'Revisit' },
  { key: 'nearly_secure', score: 3, label: 'Mostly independent', next: 'Move forward' },
  { key: 'secure', score: 4, label: 'Independent', next: 'Move forward' },
  { key: 'not_observed', score: null, label: 'Not observed', next: 'Not assessed' }
]);
const text = value => typeof value === 'string' ? value.trim() : '';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const limited = (value, label, max = 1000) => {
  if (value != null && typeof value !== 'string') fail(`${label} must be text.`);
  if ((value || '').length > max) fail(`${label} must be ${max} characters or fewer.`);
  return text(value);
};
export function planFocusAreas(bundle) {
  return (bundle?.goals || []).flatMap(goal => {
    const objectives = (bundle.objectives || []).filter(objective => Number(objective.plan_goal_id) === Number(goal.id));
    return (objectives.length ? objectives : [null]).map(objective => ({
      key: objective ? `objective:${objective.id}` : `goal:${goal.id}`,
      planGoalId: Number(goal.id), planObjectiveId: objective ? Number(objective.id) : null,
      title: objective?.title || goal.title, description: objective?.description || '',
      goalTitle: goal.title, criteria: goal.success_criteria || '',
      skillKey: goal.skill_key || null, skillLabel: goal.skill_label || goal.title
    }));
  });
}
export function planStrategies(bundle) {
  const entries = bundle?.plan?.instructional_strategies_json || [];
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    key: String(index), label: typeof entry === 'string' ? entry.trim() : text(entry?.title) || text(entry?.strategy) || text(entry?.description) || text(entry?.label)
  })).filter(entry => entry.label);
}
export function assembleLearningSession(bundle, input = {}) {
  if (!Array.isArray(input.areas) || input.areas.length < 1 || input.areas.length > 100) fail('Select at least one learning-plan objective.');
  const focus = planFocusAreas(bundle), strategies = planStrategies(bundle), seen = new Set();
  const areas = input.areas.map(selection => {
    if (!selection || seen.has(selection.key)) fail('Select each objective only once.');
    seen.add(selection.key);
    const area = focus.find(item => item.key === selection.key);
    if (!area) fail('An objective no longer belongs to this learning plan. Reload the plan.');
    const rating = SESSION_RATINGS.find(item => item.key === selection.rating);
    if (!rating) fail(`Choose a performance rating for ${area.title}.`);
    const selectedStrategies = selection.strategyKeys || [];
    if (!Array.isArray(selectedStrategies) || selectedStrategies.length > strategies.length || new Set(selectedStrategies.map(String)).size !== selectedStrategies.length) fail('Choose each plan strategy only once.');
    const used = selectedStrategies.map(key => {
      const strategy = strategies.find(item => item.key === String(key));
      if (!strategy) fail('A strategy no longer belongs to this learning plan. Reload the plan.');
      return strategy;
    });
    const result = limited(selection.result, 'The observed result');
    if (rating.key === 'not_observed' && (used.length || result)) fail('An unobserved objective cannot include strategies used or a performance result. Clear those entries or select an observed rating.');
    return { ...area, rating: rating.key, score: rating.score, performance: rating.label, nextStep: rating.next,
      strategyKeys: used.map(item => item.key), strategies: used.map(item => item.label), result };
  });
  const observation = limited(input.observation, 'The additional observation');
  const participantDetails = limited(input.participantDetails, 'Additional participants');
  const summary = areas.map(area => area.rating === 'not_observed'
    ? `${area.title}: not observed; progress not assessed.`
    : `${area.title}: ${area.score}/4 — ${area.performance.toLowerCase()}.${area.strategies.length ? ` Strategies used: ${area.strategies.join('; ')}.` : ''}${area.result ? ` Result: ${area.result}${/[.!?]$/.test(area.result) ? '' : '.'}` : ''} Next: ${area.nextStep.toLowerCase()}.`
  ).join(' ') + (observation ? ` Observation: ${observation}${/[.!?]$/.test(observation) ? '' : '.'}` : '');
  return { version: 1, participantDetails, learningPlanId: Number(bundle.plan.id), planTitle: bundle.plan.title, areas, observation, summary,
    nextSteps: areas.filter(area => area.score != null).map(area => `${area.title}: ${area.nextStep.toLowerCase()}.`).join(' ') };
}

// Objective ratings describe one session, not independent mastery checks. Keep
// them visible for review without applying the legacy goal-level threshold.
export function checklistMasteryReview(planGoalId, evidence) {
  if (!evidence.some(row => row.metadata_json?.documentationMode === 'learning_plan_checklist')) return null;
  const sessions = new Set(evidence.filter(row => row.rating && row.session_id).map(row => String(row.session_id)));
  return { planGoalId, measureCount: sessions.size, positiveCount: null, strongCount: null,
    recommendedStatus: null, confidence: 'low', requiresPlanCriteriaReview: true,
    reason: 'Review objective performance against the approved learning-plan criteria. Session ratings alone do not establish goal mastery.',
    evidenceIds: evidence.map(row => row.id) };
}
