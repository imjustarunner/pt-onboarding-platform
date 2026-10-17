import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import ClinicalTreatmentObjectiveRating, { computeProgressLabel } from '../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import { TreatmentPlanAckLink } from '../models/TreatmentPlanAckLink.model.js';
import Notification from '../models/Notification.model.js';
import { requireClinicalScope, ageOn } from './guardianClinicalAccess.service.js';
import { verifiedObjectiveQuestion } from './kioskObjectivePrompt.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const isSharedPlanStatus = status => ['active', 'final', 'finalized'].includes(String(status || '').toLowerCase());
export const sharedPlanGoals = plan => (plan.goals || []).filter(g => !g.superseded_at && !['superseded', 'archived', 'inactive'].includes(g.status))
  .map(g => ({ ...g, objectives: (g.objectives || []).filter(o => !o.superseded_at && !['superseded', 'archived', 'inactive'].includes(o.status)) }));

// Rating changes and acknowledgment timestamps must not invalidate a signature.
// The text, targets and clinical content being approved must invalidate it.
export function guardianPlanRevision(plan) {
  return crypto.createHash('sha256').update(JSON.stringify({
    id: plan.id, title: plan.title, effectiveDate: plan.effective_date,
    presentingProblem: plan.presenting_problem, prescribedFrequency: plan.prescribed_frequency,
    dischargePlan: plan.discharge_plan, primaryDiagnosisId: plan.primary_diagnosis_id,
    diagnosticJustification: plan.diagnostic_justification,
    diagnoses: (plan.planDiagnoses || []).map(d => [d.diagnosis_id, d.icd10_code, d.description, d.justification, d.is_primary]),
    goals: sharedPlanGoals(plan).map(g => ({
      id: g.id, text: g.goal_text, projectedCompletion: g.projected_completion,
      objectives: (g.objectives || []).map(o => ({ id: o.id, text: o.objective_text,
        target: o.scale_target, direction: o.scale_direction, measurement: o.measurement_method,
        interventions: o.interventions || o.interventions_json }))
    }))
  })).digest('hex');
}

export async function requireGuardianPlanAccess({ userId, clientId, agencyId, scope = 'treatment_plan', action = 'read' }) {
  const links = await ClientGuardian.listClientsForGuardian({ guardianUserId: userId });
  const row = links.find(r => Number(r.client_id) === Number(clientId) && Number(r.agency_id) === Number(agencyId));
  if (!row || ClientGuardian.isNoView(row.permissions_json)) throw fail('Plan not available for this account.', 403);
  let permissions;
  try { permissions = typeof row.permissions_json === 'string' ? JSON.parse(row.permissions_json) : (row.permissions_json ?? {}); }
  catch { throw fail('Plan access requires a review by your team.', 403); }
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) throw fail('Plan access requires a review by your team.', 403);
  if (permissions.canViewProgress === false || (action === 'sign' && permissions.canSignDocs === false)) throw fail('This plan action is not enabled for your relationship.', 403);
  const age = ageOn(row.date_of_birth);
  if (row.relationship_type !== 'self' && age != null && age >= 18) throw fail('Plan access requires a review by your team.', 403);
  const learning = String(row.client_type || row.organization_type || '').toLowerCase() === 'learning';
  // Learning relationships use education access, not clinical disclosure grants.
  if (!learning) {
    await requireClinicalScope({ agencyId, clientId, userId, scope });
    if (scope !== 'treatment_plan') await requireClinicalScope({ agencyId, clientId, userId, scope: 'treatment_plan' });
  }
  return { ...row, learning };
}

async function activePlan(context) {
  const plans = await ClinicalTreatmentPlan.listByClient(context);
  const active = plans.find(p => isSharedPlanStatus(p.status));
  if (!active) return null;
  const full = await ClinicalTreatmentPlan.findById(active.id);
  if (!full || Number(full.agency_id) !== Number(context.agencyId) || Number(full.client_id) !== Number(context.clientId) || !isSharedPlanStatus(full.status)) return null;
  return { ...full, goals: sharedPlanGoals(full) };
}

export function familyRatingQuestion(objective) {
  return verifiedObjectiveQuestion(objective, true)
    .replace(/the client[’']s/gi, 'your child/dependent’s')
    .replace(/the client\b/gi, 'your child/dependent');
}

async function ownRatings({ agencyId, clientId, userId }) {
  const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_treatment_objective_ratings
    WHERE agency_id=? AND client_id=? AND rated_by_user_id=? AND rater_kind='other' AND rater_label=?
    ORDER BY rated_at DESC,id DESC LIMIT 200`, [agencyId, clientId, userId, `guardian:${userId}`]);
  return rows;
}

export async function guardianPlanProgress(context) {
  const client = await requireGuardianPlanAccess(context);
  if (client.learning) {
    const { guardianLearningPlanProgress } = await import('./guardianLearningPlan.service.js');
    const learning = await guardianLearningPlanProgress(context);
    if (learning) return learning;
  }
  const full = await activePlan(context);
  if (!full) return { hasActivePlan: false, plan: null, goals: [], ratings: [], acknowledgments: [] };
  const revision = guardianPlanRevision(full);
  const own = await ownRatings(context);
  const all = await ClinicalTreatmentObjectiveRating.listByClient({ ...context, limit: 200 });
  const objectives = new Set(full.goals.flatMap(g => g.objectives.map(o => Number(o.id))));
  const links = await TreatmentPlanAckLink.listForPlan({ ...context, treatmentPlanId: full.id });
  let canRespond = true;
  try { await requireGuardianPlanAccess({ ...context, scope: 'approve_goals', action: 'rate' }); } catch (e) { if (e.status !== 403) throw e; canRespond = false; }
  let canSign = canRespond;
  try { await requireGuardianPlanAccess({ ...context, scope: 'approve_goals', action: 'sign' }); } catch (e) { if (e.status !== 403) throw e; canSign = false; }
  return {
    hasActivePlan: true, clientType: client.learning ? 'learning' : 'clinical',
    plan: { id: full.id, title: full.title, status: full.status, effectiveDate: full.effective_date,
      presentingProblem: full.presenting_problem, prescribedFrequency: full.prescribed_frequency,
      dischargePlan: full.discharge_plan,
      diagnoses: (full.planDiagnoses || []).map(d => ({ description: d.description, justification: d.justification })),
      updatedAt: full.updated_at, revision },
    goals: full.goals.map(g => ({ id: g.id, goalIndex: g.goal_index, goalText: g.goal_text,
      objectives: g.objectives.map(o => {
        const previous = own.find(r => Number(r.objective_id) === Number(o.id));
        return { id: o.id, objectiveIndex: o.objective_index, objectiveText: o.objective_text,
          scaleCurrent: o.scale_current, scaleTarget: o.scale_target, scaleDirection: o.scale_direction,
          measurementMethod: o.measurement_method, interventions: o.interventions || [],
          familyQuestion: familyRatingQuestion(o), canRate: canRespond && !!familyRatingQuestion(o),
          previousOwnRating: previous ? { value: previous.scale_value, ratedAt: previous.rated_at, dateOfService: previous.date_of_service } : null };
      }) })),
    // Never connect different parents' observations into one clinical trend.
    ratings: all.filter(r => objectives.has(Number(r.objective_id)) && (!r.rater_kind || r.rater_kind === 'clinician'))
      .map(r => ({ id: r.id, objectiveId: r.objective_id, scaleValue: r.scale_value, disposition: r.disposition, ratedAt: r.rated_at })),
    acknowledgments: canSign ? links.filter(l => Number(l.recipient_user_id) === Number(context.userId)
      && l.dashboard_visible && !['cancelled', 'expired'].includes(l.status) && l.meta_json?.planRevision === revision)
      .map(l => ({ id: l.id, status: l.status, signedAt: l.signed_at, signedByName: l.signed_by_name })) : []
  };
}

export async function recordGuardianPlanRating(context, input) {
  const client = await requireGuardianPlanAccess({ ...context, scope: 'approve_goals', action: 'rate' });
  if (input.planKind === 'learning') {
    if (!client.learning) throw fail('Learning plan not available.', 403);
    const { recordGuardianLearningRating } = await import('./guardianLearningPlan.service.js');
    return recordGuardianLearningRating(context, input);
  }
  const plan = await activePlan(context);
  if (!plan || Number(input.planId) !== Number(plan.id) || input.revision !== guardianPlanRevision(plan)) throw fail('This plan changed. Refresh it before rating.', 409);
  const goal = plan.goals.find(g => g.objectives.some(o => Number(o.id) === Number(input.objectiveId)));
  const objective = goal?.objectives.find(o => Number(o.id) === Number(input.objectiveId));
  if (!objective || !familyRatingQuestion(objective)) throw fail('Your provider needs to review this family rating question first.', 409);
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1 || value > 10) throw fail('Choose a whole-number rating from 1 to 10.');
  const own = await ownRatings(context);
  const previous = own.find(r => Number(r.objective_id) === Number(objective.id));
  // Preserve observer identity and do not overwrite the clinician's current score.
  const rating = await ClinicalTreatmentObjectiveRating.create({ ...context, objectiveId: objective.id,
    goalId: goal.id, treatmentPlanId: plan.id, ratedByUserId: context.userId, scaleValue: value,
    scaleTargetAtRating: objective.scale_target, raterKind: 'other', raterLabel: `guardian:${context.userId}`,
    progressLabel: computeProgressLabel({ previousValue: previous?.scale_value, newValue: value, target: objective.scale_target }),
    dateOfService: new Date().toISOString().slice(0, 10) });
  return { id: rating.id, value: rating.scale_value, ratedAt: rating.rated_at };
}

export async function signGuardianPlan(context, input) {
  const client = await requireGuardianPlanAccess({ ...context, scope: 'approve_goals', action: 'sign' });
  if (input.planKind === 'learning') {
    if (!client.learning) throw fail('Learning plan not available.', 403);
    const { signGuardianLearningPlan } = await import('./guardianLearningPlan.service.js');
    return signGuardianLearningPlan(context, input);
  }
  if (input.agree !== true) throw fail('Confirm you reviewed this plan and agree to sign electronically.');
  const plan = await activePlan(context);
  const link = await TreatmentPlanAckLink.findById(input.linkId);
  if (!plan || !link || Number(link.recipient_user_id) !== Number(context.userId)
    || Number(link.client_id) !== Number(context.clientId) || Number(link.agency_id) !== Number(context.agencyId)
    || Number(link.treatment_plan_id) !== Number(plan.id) || !link.dashboard_visible) throw fail('Acknowledgment not found.', 404);
  const revision = guardianPlanRevision(plan);
  if (input.revision !== revision || link.meta_json?.planRevision !== revision) throw fail('This plan changed. Refresh it before signing.', 409);
  const { signAcknowledgment } = await import('./treatmentPlanAck.service.js');
  const signed = await signAcknowledgment({ linkId: link.id, signedByName: input.signedByName,
    actorUserId: context.userId, ip: context.ip, userAgent: context.userAgent });
  return { id: signed.id, status: signed.status, signedAt: signed.signed_at };
}

// Invoked only after a provider saves an active plan. Each authorized recipient
// gets a distinct link per content revision; prior signatures remain in the audit.
export async function shareGuardianPlanRevision({ plan, actorUserId }) {
  if (!plan || !isSharedPlanStatus(plan.status)) return { shared: 0 };
  const context = { agencyId: plan.agency_id, clientId: plan.client_id, treatmentPlanId: plan.id };
  const lock = `guardian-plan-share:${plan.id}`;
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?, 10) AS acquired', [lock]);
    if (Number(result?.acquired) !== 1) throw fail('Plan sharing is busy. Try saving again.', 409);
    locked = true;
    const revision = guardianPlanRevision(plan);
    const existing = await TreatmentPlanAckLink.listForPlan(context);
    for (const link of existing.filter(l => l.dashboard_visible && l.meta_json?.planRevision && l.meta_json.planRevision !== revision)) {
      await TreatmentPlanAckLink.updateFields(link.id, { dashboardVisible: false, ...(link.status === 'signed' ? {} : { status: 'cancelled' }) });
    }
    const guardians = await ClientGuardian.listForClient(plan.client_id);
    const { createDashboardShare } = await import('./treatmentPlanAck.service.js');
    let shared = 0;
    let eligible = 0;
    for (const guardian of guardians) {
      if (Number(guardian.access_enabled) !== 1 || guardian.relationship_type === 'self' || ClientGuardian.isNoView(guardian.permissions_json)) continue;
      try { await requireGuardianPlanAccess({ ...context, userId: guardian.guardian_user_id, scope: 'approve_goals', action: 'sign' }); }
      catch (e) { if (e.status === 403) continue; throw e; }
      eligible++;
      let link = existing.find(l => Number(l.recipient_user_id) === Number(guardian.guardian_user_id) && l.meta_json?.planRevision === revision && !['cancelled', 'expired'].includes(l.status));
      if (!link) {
        link = await createDashboardShare({ ...context, actorUserId, recipientUserId: guardian.guardian_user_id,
          recipientName: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), planRevision: revision });
        shared++;
      }
      const [notified] = await db.execute("SELECT id FROM notifications WHERE type='guardian_plan_review' AND related_entity_type='guardian_plan_ack' AND related_entity_id=? AND user_id=? LIMIT 1", [link.id, guardian.guardian_user_id]);
      if (!notified.length) await Notification.create({ type: 'guardian_plan_review', severity: 'info',
        title: 'A plan is ready for your review', message: 'Your child/dependent’s plan has been updated. Sign in to review it and add your own acknowledgment.',
        userId: guardian.guardian_user_id, agencyId: plan.agency_id, relatedEntityType: 'guardian_plan_ack', relatedEntityId: link.id,
        actorUserId, actorSource: 'provider_plan_save', audienceJson: { clientId: plan.client_id } });
    }
    return { shared, eligible };
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { db.release(); }
  }
}
