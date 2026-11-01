import { updateTreatmentGoalProgress, treatmentGoalProgressHistory } from '../services/treatmentGoalProgress.service.js';
export async function setTreatmentGoalProgress(req, res, next) {
  try {
    const result = await updateTreatmentGoalProgress(req, { ...req.body, planId: req.params.planId, goalId: req.params.goalId });
    res.json(result);
  } catch (error) { next(error); }
}
export async function getTreatmentGoalProgressHistory(req, res, next) {
  try { res.json(await treatmentGoalProgressHistory(req, { ...req.query, planId: req.params.planId })); }
  catch (error) { next(error); }
}
