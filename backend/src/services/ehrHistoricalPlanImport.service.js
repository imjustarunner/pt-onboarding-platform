import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { clientAccess } from './safetyPlans/access.js';
import { historicalImportDetails, historicalPlanSourceKey, historicalSourceNarrative } from './ehrHistoricalImport.service.js';
import { withHistoricalImportLock } from './ehrHistoricalImportLock.service.js';
import clinicalPool from '../config/clinicalDatabase.js';

/** Retain a historical plan in the existing chart without activating care/billing. */
export async function importHistoricalPlan({ user, agencyId, clientId, input }, dependencies = {}) {
  const access = dependencies.clientAccess || clientAccess;
  const plans = dependencies.plans || ClinicalTreatmentPlan;
  const client = await access(user, clientId, { write: !['admin', 'super_admin'].includes(user.role) });
  if (Number(client.agency_id) !== Number(agencyId)) throw Object.assign(new Error('Client not found in this agency.'), { status: 403 });
  if (input.finalize !== false || input.status !== 'draft' || input.clinicalSessionId || input.clinicalNoteId || input.officeEventId) {
    throw Object.assign(new Error('Historical imports must remain unsigned, unlinked drafts for clinical review.'), { status: 400 });
  }
  const sourceText = String(input.historicalImport?.sourceText || '').trim();
  const details = historicalImportDetails(input.historicalImport, sourceText);
  if (!details) throw Object.assign(new Error('Historical source details are required.'), { status: 400 });
  const sourceToolId = historicalPlanSourceKey(details);
  const lock = dependencies.lock || withHistoricalImportLock;
  return lock(agencyId, clientId, 'plan', async () => {
  const existing = await plans.listByClient({ agencyId, clientId });
  const same = existing.find(plan => plan.source_tool_id === sourceToolId);
  if (same) return { plan: await plans.findById(same.id), reused: true, historicalImport: details };
  if (existing.some(plan => String(plan.source_tool_id || '').startsWith('ehr_transition_import:'))) {
    throw Object.assign(new Error('A historical treatment plan has already been imported. Review it in the chart before importing a different version.'), { status: 409, code: 'EHR_PLAN_REVIEW_REQUIRED' });
  }
  // The generic plan model supports old deployments by dropping this column.
  // A transition must retain the original date rather than take that fallback.
  try {
    const ensureSchema = dependencies.ensureSchema || (() => clinicalPool.execute('SELECT effective_date FROM clinical_treatment_plans WHERE agency_id = ? AND client_id = ? LIMIT 0', [agencyId, clientId]));
    await ensureSchema();
  } catch (error) {
    if (['ER_BAD_FIELD_ERROR','ER_NO_SUCH_TABLE'].includes(error.code)) throw Object.assign(new Error('Historical plan import requires the clinical treatment-plan date schema. Ask an administrator to complete the clinical migrations; nothing was imported.'), {status:503,code:'EHR_CLINICAL_SCHEMA_REQUIRED'});
    throw error;
  }
  const goals = Array.isArray(input.goals) ? input.goals.slice(0, 100) : [];
  const plan = await plans.create({
    agencyId, clientId, createdByUserId: user.id,
    title: 'Historical treatment plan — clinical review required',
    status: 'draft', effectiveDate: details.sourceDate, sourceToolId,
    dischargePlan: `${historicalSourceNarrative(details)}\n\nOriginal pasted treatment plan\n${sourceText}`,
    presentingProblem: input.presentingProblem || null,
    prescribedFrequency: input.prescribedFrequency || null,
    goals: goals.map((goal, index) => ({
      goalIndex: index + 1, goalText: String(goal.goalText || goal.text || ''), projectedCompletion: goal.projectedCompletion || null,
      objectives: (Array.isArray(goal.objectives) ? goal.objectives : []).slice(0, 100).map((objective, objectiveIndex) => ({
        objectiveIndex: objectiveIndex + 1, objectiveText: String(objective.objectiveText || objective.text || ''),
        scaleCurrent: objective.scaleCurrent ?? null, scaleTarget: objective.scaleTarget ?? null,
        scaleDirection: ['increase', 'decrease'].includes(objective.scaleDirection) ? objective.scaleDirection : null,
        measurementMethod: objective.measurementMethod || null,
        interventions: Array.isArray(objective.interventions) ? objective.interventions : []
      }))
    }))
  });
  return { plan, reused: false, historicalImport: details };
  });
}
