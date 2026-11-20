export const objectiveReviewMessage = 'Please rate each treatment objective or mark it Deferred, On hold, or Not addressed before submitting.';
export const objectiveDispositions = Object.freeze({ deferred: 'Deferred', on_hold: 'On hold', not_addressed: 'Not addressed' });

export function planObjectiveReview(goals, ratings, previousScores = {}) {
  const observations = new Map();
  for (const row of Array.isArray(ratings) ? ratings : []) {
    if (!row || (row.raterKind && row.raterKind !== 'clinician')) continue;
    const score = Number(row.scaleValue);
    const rated = (!row.disposition || row.disposition === 'rated') && Number.isInteger(score) && score >= 1 && score <= 10;
    if (rated || Object.hasOwn(objectiveDispositions, row.disposition)) {
      observations.set(String(row.objectiveId), rated ? { rating: score } : { disposition: objectiveDispositions[row.disposition] });
    }
  }
  const objectives = [];
  const missing = [];
  for (const goal of goals || []) {
    if (goal.superseded_at || goal.status === 'superseded') continue;
    for (const objective of goal.objectives || []) {
      if (objective.superseded_at || objective.status === 'superseded') continue;
      const observation = observations.get(String(objective.id));
      if (!observation) missing.push(objective.id);
      else objectives.push({ goal: goal.goal_text || goal.title, objective: objective.objective_text || objective.title,
        ...(previousScores[objective.id] != null ? { previousRating: previousScores[objective.id] } : {}),
        target: objective.scale_target ?? objective.scaleTarget ?? null, ...observation });
    }
  }
  return { objectives, missing };
}
