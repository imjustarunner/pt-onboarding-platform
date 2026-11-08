/** An initial plan may precede a full intake only after explicit clinician review.
 * Client priorities must be preserved in the saved plan; no diagnosis is inferred. */
export function isReviewedStarterPlan(body) {
  const priorities = String(body?.clientIdentifiedGoals || '').trim();
  return body?.sourceToolId === 'note_aid_starter_plan' && body.starterPlanReviewed === true
    && priorities.length > 0
    && (body.goals || []).some(goal => String(goal.goalText || '').includes(priorities));
}
