import { validationResult } from 'express-validator';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import ClinicalTreatmentFrequency from '../models/ClinicalTreatmentFrequency.model.js';
import { recommendObjectiveInterventions } from '../services/treatmentInterventionRecommendations.service.js';

async function authorize(req, res) {
  if (!validationResult(req).isEmpty()) {
    res.status(400).json({ error: { message: 'Valid agency and treatment plan options are required.' } });
    return null;
  }
  const agencyId = Number(req.method === 'GET' ? req.query.agencyId : req.body.agencyId);
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return { agencyId, userId: req.user.id };
}
export async function listTreatmentFrequencies(req, res, next) {
  try {
    const scope = await authorize(req, res);
    if (scope) res.json({ all: await ClinicalTreatmentFrequency.list(scope) });
  } catch (error) { next(error); }
}
export async function addTreatmentFrequency(req, res, next) {
  try {
    const scope = await authorize(req, res);
    if (scope) res.json({ all: await ClinicalTreatmentFrequency.add({ ...scope, name: req.body.name.replace(/\s+/g, ' ').trim() }) });
  } catch (error) { next(error); }
}
export async function suggestObjectiveInterventions(req, res, next) {
  try {
    const scope = await authorize(req, res);
    if (!scope) return;
    try {
      res.json(await recommendObjectiveInterventions({ goalText: req.body.goalText, objectiveText: req.body.objectiveText }));
    } catch {
      res.status(502).json({ error: { message: 'Could not recommend interventions. Please try again or select them manually.' } });
    }
  } catch (error) { next(error); }
}
