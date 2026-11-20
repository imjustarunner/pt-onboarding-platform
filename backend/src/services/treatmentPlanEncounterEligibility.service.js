import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { loadRenewalPolicy } from './treatmentPlanRenewal.service.js';
import { evaluateTreatmentPlanForEncounter } from '../../../frontend/src/utils/treatmentPlanEncounterEligibility.js';

export async function loadEncounterTreatmentPlanEligibility({ agencyId, clientId, dateOfService, includePlan = false, planModel = ClinicalTreatmentPlan, policyLoader = loadRenewalPolicy } = {}) {
  const rows = await planModel.listByClient({ agencyId, clientId });
  const policy = rows?.length ? await policyLoader(agencyId) : {};
  const plans = await Promise.all((rows || []).filter(row => !['draft', 'discarded', 'void', 'deleted', 'inactive'].includes(String(row.status || '').toLowerCase())).map(row => planModel.findById(row.id)));
  const scoped = plans.filter(plan => plan && Number(plan.agency_id) === Number(agencyId) && Number(plan.client_id) === Number(clientId));
  const eligibility = evaluateTreatmentPlanForEncounter({ plans: scoped, dateOfService, policy });
  return includePlan ? { ...eligibility, plan: scoped.find(plan => plan.id === eligibility.planId) || null } : eligibility;
}

export async function assertEncounterTreatmentPlanEligibility(input) {
  const eligibility = await loadEncounterTreatmentPlanEligibility(input);
  if (!eligibility.eligible) throw Object.assign(new Error(eligibility.message), { status: 422, code: eligibility.code, details: { treatmentPlanEligibility: eligibility } });
  return eligibility;
}
