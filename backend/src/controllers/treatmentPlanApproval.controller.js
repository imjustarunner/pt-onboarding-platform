import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { requireNarrivaClient } from '../services/narrivaAccess.service.js';
import { getTreatmentPlanApproval, attestTreatmentPlanProvider } from '../services/treatmentPlanApproval.service.js';
import { logNoteAidChartEvent } from '../services/noteAidChartAudit.service.js';

async function scopedPlan(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId), clientId = Number(req.body?.clientId || req.query?.clientId), planId = Number(req.params.planId);
  if (![agencyId, clientId, planId].every(value => Number.isSafeInteger(value) && value > 0)) throw Object.assign(new Error('Select the agency, client and plan.'), { status: 400 });
  await requireNarrivaClient(req.user, agencyId, clientId);
  const plan = await ClinicalTreatmentPlan.findById(planId);
  if (!plan || Number(plan.agency_id) !== agencyId || Number(plan.client_id) !== clientId) throw Object.assign(new Error('Treatment plan not found for this client and practice.'), { status: 404 });
  return plan;
}
export async function getPlanApproval(req, res, next) {
  try { const plan = await scopedPlan(req); res.set('Cache-Control', 'no-store').json({ approval: await getTreatmentPlanApproval(plan), canProviderSign: Number(plan.created_by_user_id) === Number(req.user.id) }); }
  catch (error) { next(error); }
}
export async function signPlanProviderReview(req, res, next) {
  try {
    const plan = await scopedPlan(req);
    await attestTreatmentPlanProvider({ user: req.user, plan, contentHash: req.body.contentHash, reviewedAndAccurate: req.body.reviewedAndAccurate });
    await logNoteAidChartEvent(req, { agencyId: plan.agency_id, clientId: plan.client_id, action: 'clinical_treatment_plan_provider_signed', metadata: { planId: plan.id, contentHash: req.body.contentHash } });
    res.json({ approval: await getTreatmentPlanApproval(plan) });
  } catch (error) { next(error); }
}
