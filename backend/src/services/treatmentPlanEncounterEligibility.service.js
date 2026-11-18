import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { loadRenewalPolicy } from './treatmentPlanRenewal.service.js';
import { evaluateTreatmentPlanForEncounter } from '../../../frontend/src/utils/treatmentPlanEncounterEligibility.js';

export async function loadEncounterTreatmentPlanEligibility({ agencyId, clientId, dateOfService, planModel = ClinicalTreatmentPlan, policyLoader = loadRenewalPolicy } = {}) {
  const [rows, policy] = await Promise.all([planModel.listByClient({ agencyId, clientId }), policyLoader(agencyId)]);
  const plans = await Promise.all((rows || []).filter(row => !['draft', 'discarded', 'void', 'deleted', 'inactive'].includes(String(row.status || '').toLowerCase())).map(row => planModel.findById(row.id)));
  return evaluateTreatmentPlanForEncounter({ plans: plans.filter(plan => plan && Number(plan.agency_id) === Number(agencyId) && Number(plan.client_id) === Number(clientId)), dateOfService, policy });
}

export async function assertEncounterTreatmentPlanEligibility(input) {
  const eligibility = await loadEncounterTreatmentPlanEligibility(input);
  if (!eligibility.eligible) throw Object.assign(new Error(eligibility.message), { status: 422, code: eligibility.code, details: { treatmentPlanEligibility: eligibility } });
  return eligibility;
}
