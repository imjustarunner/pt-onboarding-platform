import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';

const fail = (message, status = 409, code = 'TREATMENT_PLAN_REVIEW_REQUIRED') => Object.assign(new Error(message), { status, code });
const SIGNING_ROLES = new Set(['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'admin', 'super_admin']);
export async function treatmentPlanContentHash(plan) {
  const { guardianPlanRevision, sharedPlanGoals } = await import('./guardianPlanProgress.service.js');
  // An authored baseline is clinical plan content; later observed ratings are not.
  // Keep portal revision hashes stable for already-issued historical links.
  const baselines = sharedPlanGoals(plan).flatMap(goal => (goal.objectives || []).map(objective => [objective.id, objective.scale_start ?? null]));
  return crypto.createHash('sha256').update(JSON.stringify({ revision: guardianPlanRevision(plan), baselines })).digest('hex');
}
export function treatmentPlanApprovalState({ plan, contentHash, providerSignoff = null, supervisorReview = null, supervisorUserId = null, legacyHash = null }) {
  const providerId = Number(plan.created_by_user_id);
  const providerApproved = !!providerSignoff && Number(providerSignoff.provider_user_id) === providerId && providerSignoff.content_hash === contentHash;
  const supervisorApproved = !!supervisorReview && supervisorReview.outcome === 'approved'
    && Number(supervisorReview.provider_user_id) === providerId
    && Number(supervisorReview.supervisor_user_id) !== providerId
    && (!supervisorUserId || Number(supervisorReview.supervisor_user_id) === Number(supervisorUserId))
    && [contentHash, legacyHash].filter(Boolean).includes(supervisorReview.content_hash);
  return { contentHash, providerApproved, supervisorApproved, ready: providerApproved && supervisorApproved,
    providerSignedAt: providerApproved ? providerSignoff.signed_at : null,
    providerSignoff: providerApproved ? { providerUserId: Number(providerSignoff.provider_user_id), signedAt: providerSignoff.signed_at, statement: providerSignoff.statement || null, contentHash: providerSignoff.content_hash } : null,
    supervisorApprovedAt: supervisorApproved ? supervisorReview.created_at : null,
    supervisorSignoff: supervisorApproved ? { supervisorUserId: Number(supervisorReview.supervisor_user_id), signedAt: supervisorReview.created_at, contentHash: supervisorReview.content_hash } : null,
    supervisorUserId: supervisorUserId || null,
    legacyRecordOnFile: ['active', 'final', 'finalized'].includes(String(plan.status || '').toLowerCase()) && !providerSignoff,
    required: ['provider', 'supervisor'], quickSignEligible: false };
}
export async function getTreatmentPlanApproval(plan, { database = pool, supervisorModel = SupervisorAssignment } = {}) {
  const contentHash = await treatmentPlanContentHash(plan);
  const [providerResult, supervisorResult, supervisor] = await Promise.all([
    database.execute('SELECT * FROM clinical_treatment_plan_provider_signoffs WHERE agency_id=? AND client_id=? AND treatment_plan_id=? AND provider_user_id=? ORDER BY (content_hash=?) DESC,id DESC LIMIT 1', [plan.agency_id, plan.client_id, plan.id, plan.created_by_user_id, contentHash]),
    database.execute("SELECT * FROM clinical_document_reviews WHERE agency_id=? AND document_type='treatment_plan' AND document_id=? ORDER BY id DESC LIMIT 1", [plan.agency_id, plan.id]),
    supervisorModel.findBySuperviseeAndType(plan.created_by_user_id, plan.agency_id, 'clinical')
  ]);
  return treatmentPlanApprovalState({ plan, contentHash, providerSignoff: providerResult[0]?.[0], supervisorReview: supervisorResult[0]?.[0], supervisorUserId: supervisor?.supervisor_id,
    legacyHash: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') });
}
export async function annotateProviderSignedDrafts(plans, { database = pool, model = ClinicalTreatmentPlan } = {}) {
  const drafts = plans.filter(plan => plan.status === 'draft');
  if (!drafts.length) return;
  const [signoffs] = await database.execute(
    `SELECT treatment_plan_id, provider_user_id, content_hash, signed_at
     FROM clinical_treatment_plan_provider_signoffs WHERE agency_id=? AND client_id=?
       AND treatment_plan_id IN (${drafts.map(() => '?').join(',')})`,
    [drafts[0].agency_id, drafts[0].client_id, ...drafts.map(plan => plan.id)]
  );
  const byPlan = new Map();
  for (const signoff of signoffs) {
    const id = Number(signoff.treatment_plan_id);
    if (!byPlan.has(id)) byPlan.set(id, []);
    byPlan.get(id).push(signoff);
  }
  await Promise.all(drafts.filter(plan => byPlan.has(Number(plan.id))).map(async plan => {
    const current = await model.findById(plan.id);
    if (current?.status !== 'draft' || Number(current.agency_id) !== Number(plan.agency_id) || Number(current.client_id) !== Number(plan.client_id)) return;
    const hash = await treatmentPlanContentHash(current);
    const signature = byPlan.get(Number(plan.id)).find(signoff =>
      Number(signoff.provider_user_id) === Number(current.created_by_user_id) && signoff.content_hash === hash
    );
    if (signature) {
      plan.providerApproved = true;
      plan.providerSignedAt = signature.signed_at;
    }
  }));
}

export async function assertTreatmentPlanShareApproval(plan, dependencies) {
  const approval = await getTreatmentPlanApproval(plan, dependencies);
  if (!approval.ready) throw fail('The provider and assigned supervisor must review and sign off on this treatment-plan version before it can be shared for client approval.');
  return approval;
}
export async function attestTreatmentPlanProvider({ user, plan, contentHash, reviewedAndAccurate }, { database = pool, requireCare = requireStaffCareEligibility } = {}) {
  if (!user?.id || !SIGNING_ROLES.has(String(user.role || '').toLowerCase()) || Number(user.id) !== Number(plan.created_by_user_id)) throw fail('The plan author must review and attest to their own plan.', 403);
  await requireCare(user.id, plan.agency_id);
  const current = await treatmentPlanContentHash(plan);
  if (reviewedAndAccurate !== true || contentHash !== current) throw fail('Open the current treatment plan and confirm its accuracy before signing.');
  if (['discarded', 'superseded', 'void', 'deleted', 'inactive'].includes(String(plan.status || '').toLowerCase())) throw fail('This plan is no longer available for review.');
  await database.execute(`INSERT IGNORE INTO clinical_treatment_plan_provider_signoffs
    (agency_id,client_id,treatment_plan_id,provider_user_id,content_hash,statement) VALUES (?,?,?,?,?,?)`,
  [plan.agency_id, plan.client_id, plan.id, user.id, current, 'I reviewed this treatment plan and confirm the clinical content is accurate, supported, and appropriate for the client.']);
  return current;
}
export async function completeTreatmentPlanSupervisorApproval(plan, dependencies = {}) {
  const database = dependencies.clinicalDatabase || clinicalPool;
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM clinical_treatment_plans WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE', [plan.id, plan.agency_id, plan.client_id]);
    const latest = await ClinicalTreatmentPlan.findById(plan.id, connection);
    if (!latest || await treatmentPlanContentHash(latest) !== await treatmentPlanContentHash(plan)) throw fail('The plan changed during review. Review its current content before approval.');
    const approval = await getTreatmentPlanApproval(latest, dependencies);
    if (!approval.ready) throw fail('Provider and supervisor approval of the current treatment-plan content are required.');
    await connection.execute("UPDATE clinical_treatment_plans SET status='active',client_ack_status='awaiting_portal',updated_at=NOW() WHERE id=? AND agency_id=? AND client_id=? AND status='draft'", [plan.id, plan.agency_id, plan.client_id]);
    await connection.commit();
    return ClinicalTreatmentPlan.findById(plan.id);
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
