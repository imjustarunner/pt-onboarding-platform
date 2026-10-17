import crypto from 'node:crypto';
import pool from '../config/database.js';
import StudentLearningPlan from '../models/StudentLearningPlan.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const meta = goal => goal.metadata_json || {};
export const learningFamilyQuestion = goal => meta(goal).guardianRatingQuestionVerifiedBy && meta(goal).guardianRatingQuestionVerifiedAt
  ? String(meta(goal).guardianRatingQuestion || '').trim() : '';
export function learningPlanRevision({ plan, goals, objectives }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    id: plan.id, title: plan.title, summary: plan.parent_summary, from: plan.effective_from, to: plan.effective_to,
    strengths: plan.strengths_json, needs: plan.priority_needs_json, strategies: plan.instructional_strategies_json,
    monitoring: plan.progress_monitoring_plan_json,
    goals: goals.map(g => ({ id: g.id, title: g.title, description: g.description,
      baseline: g.baseline_text, criteria: g.success_criteria, measurement: g.measurement_method, question: learningFamilyQuestion(g) })),
    objectives: objectives.map(o => ({ id: o.id, goal: o.plan_goal_id, title: o.title, description: o.description, target: o.target_date }))
  })).digest('hex');
}

async function requireAccess(context, action = 'read') {
  const { requireGuardianPlanAccess } = await import('./guardianPlanProgress.service.js');
  const client = await requireGuardianPlanAccess({ ...context, action });
  if (!client.learning) throw fail('Learning plan not available for this relationship.', 403);
}

async function authorizedBundle(context, planId) {
  await requireAccess(context);
  const bundle = await StudentLearningPlan.getPlanBundle(Number(planId));
  if (!bundle || Number(bundle.plan.agency_id) !== Number(context.agencyId) || Number(bundle.plan.client_id) !== Number(context.clientId)
    || bundle.plan.status !== 'active' || !bundle.plan.approved_at) throw fail('Learning plan not available.', 404);
  return bundle;
}

export async function guardianLearningPlanProgress(context) {
  await requireAccess(context);
  const [plans] = await pool.execute(`SELECT id,title FROM student_learning_plans WHERE agency_id=? AND client_id=? AND status='active' AND approved_at IS NOT NULL ORDER BY approved_at DESC,id DESC`, [context.agencyId, context.clientId]);
  if (!plans.length) return null;
  const selectedId = Number(context.learningPlanId || plans[0].id);
  if (!plans.some(p => Number(p.id) === selectedId)) throw fail('Learning plan not available.', 404);
  const bundle = await authorizedBundle(context, selectedId);
  const { plan, goals, objectives } = bundle;
  const revision = learningPlanRevision(bundle);
  const [ratings] = await pool.execute(`SELECT id,plan_goal_id,scale_value,rated_at FROM guardian_learning_plan_ratings
    WHERE agency_id=? AND client_id=? AND learning_plan_id=? AND guardian_user_id=? ORDER BY rated_at DESC,id DESC LIMIT 200`, [context.agencyId, context.clientId, plan.id, context.userId]);
  const [reviews] = await pool.execute(`SELECT id,signed_name,signed_at FROM guardian_learning_plan_reviews
    WHERE agency_id=? AND client_id=? AND learning_plan_id=? AND guardian_user_id=? AND plan_revision=? AND retired_at IS NULL`, [context.agencyId, context.clientId, plan.id, context.userId, revision]);
  let canSign = true;
  try { await requireAccess(context, 'sign'); } catch (error) { if (error.status !== 403) throw error; canSign = false; }
  return {
    hasActivePlan: true, clientType: 'learning', availablePlans: plans,
    plan: { id: plan.id, kind: 'learning', title: plan.title, status: plan.status, revision,
      effectiveDate: plan.effective_from, updatedAt: plan.updated_at, presentingProblem: plan.parent_summary,
      strengths: plan.strengths_json || [], priorityNeeds: plan.priority_needs_json || [],
      instructionalStrategies: plan.instructional_strategies_json || [], progressMonitoring: plan.progress_monitoring_plan_json || {} },
    goals: goals.map((g, index) => {
      const previous = ratings.find(r => Number(r.plan_goal_id) === Number(g.id));
      return { id: g.id, goalIndex: index + 1, goalText: g.title, objectives: [{ id: g.id, objectiveIndex: 1,
        objectiveText: g.description || g.title, providerStatus: g.status, measurementMethod: g.measurement_method,
        successCriteria: g.success_criteria, baseline: g.baseline_text,
        learningObjectives: objectives.filter(o => Number(o.plan_goal_id) === Number(g.id)).map(o => ({ title: o.title, description: o.description, targetDate: o.target_date })),
        familyQuestion: learningFamilyQuestion(g), canRate: !!learningFamilyQuestion(g),
        previousOwnRating: previous ? { value: previous.scale_value, ratedAt: previous.rated_at } : null }]
      };
    }),
    // Tutor mastery classifications are deliberately not converted into 1–10 scores.
    ratings: [],
    acknowledgments: canSign ? reviews.map(r => ({ id: r.id, status: r.signed_at ? 'signed' : 'issued', signedAt: r.signed_at, signedByName: r.signed_name })) : []
  };
}

export async function recordGuardianLearningRating(context, input) {
  const bundle = await authorizedBundle(context, input.planId);
  const revision = learningPlanRevision(bundle);
  if (input.revision !== revision) throw fail('This learning plan changed. Refresh before rating.', 409);
  const goal = bundle.goals.find(g => Number(g.id) === Number(input.objectiveId));
  if (!goal || !learningFamilyQuestion(goal)) throw fail('Your tutor needs to review the family rating question first.', 409);
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1 || value > 10) throw fail('Choose a whole-number rating from 1 to 10.');
  const [result] = await pool.execute(`INSERT INTO guardian_learning_plan_ratings
    (agency_id,client_id,learning_plan_id,plan_goal_id,guardian_user_id,plan_revision,scale_value) VALUES (?,?,?,?,?,?,?)`,
  [context.agencyId, context.clientId, bundle.plan.id, goal.id, context.userId, revision, value]);
  return { id: result.insertId, value };
}

export async function signGuardianLearningPlan(context, input) {
  await requireAccess(context, 'sign');
  if (input.agree !== true || !String(input.signedByName || '').trim()) throw fail('Review the plan, enter your full name and agree to sign electronically.');
  const planId = Number(input.planId);
  if (!Number.isSafeInteger(planId) || planId < 1) throw fail('A valid learning plan is required.');
  const db = await pool.getConnection();
  const lock = `guardian-learning-share:${planId}`;
  let locked = false;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (Number(result?.acquired) !== 1) throw fail('This learning plan is being updated. Try again shortly.', 409);
    locked = true;
    // Check authorization and content after waiting for a concurrent publication.
    await requireAccess(context, 'sign');
    const bundle = await authorizedBundle(context, planId);
    const revision = learningPlanRevision(bundle);
    if (input.revision !== revision) throw fail('This learning plan changed. Refresh before signing.', 409);
    const query = `SELECT * FROM guardian_learning_plan_reviews
      WHERE id=? AND agency_id=? AND client_id=? AND learning_plan_id=? AND guardian_user_id=? AND plan_revision=? AND retired_at IS NULL`;
    const args = [input.linkId, context.agencyId, context.clientId, bundle.plan.id, context.userId, revision];
    const [reviews] = await db.execute(query, args);
    const review = reviews[0];
    if (!review) throw fail('Acknowledgment not found.', 404);
    if (!review.signed_at) {
      const [updated] = await db.execute(`UPDATE guardian_learning_plan_reviews SET signed_name=?,signed_at=UTC_TIMESTAMP()
        WHERE id=? AND guardian_user_id=? AND signed_at IS NULL AND retired_at IS NULL`, [String(input.signedByName).trim().slice(0, 255), review.id, context.userId]);
      if (Number(updated.affectedRows) !== 1) {
        const [current] = await db.execute(query, args);
        if (!current[0]?.signed_at) throw fail('This learning plan acknowledgment changed. Refresh before signing.', 409);
      }
    }
    return { id: review.id, status: 'signed' };
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}

export async function shareGuardianLearningPlan({ bundle, actorUserId }) {
  if (!bundle || bundle.plan.status !== 'active' || !bundle.plan.approved_at) return { shared: 0 };
  const { plan } = bundle;
  const revision = learningPlanRevision(bundle);
  const guardians = await ClientGuardian.listForClient(plan.client_id);
  const db = await pool.getConnection();
  let locked = false;
  const lock = `guardian-learning-share:${plan.id}`;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (Number(result?.acquired) !== 1) throw fail('Learning plan sharing is busy. Try again.', 409);
    locked = true;
    await db.execute('UPDATE guardian_learning_plan_reviews SET retired_at=UTC_TIMESTAMP() WHERE learning_plan_id=? AND plan_revision<>? AND retired_at IS NULL', [plan.id, revision]);
    let shared = 0;
    for (const guardian of guardians) {
      if (Number(guardian.access_enabled) !== 1 || guardian.relationship_type === 'self' || ClientGuardian.isNoView(guardian.permissions_json)) continue;
      try { await requireAccess({ agencyId: plan.agency_id, clientId: plan.client_id, userId: guardian.guardian_user_id }, 'sign'); }
      catch (error) { if (error.status === 403) continue; throw error; }
      const [insert] = await db.execute(`INSERT IGNORE INTO guardian_learning_plan_reviews
        (agency_id,client_id,learning_plan_id,guardian_user_id,plan_revision) VALUES (?,?,?,?,?)`, [plan.agency_id, plan.client_id, plan.id, guardian.guardian_user_id, revision]);
      if (insert.affectedRows) shared++;
      const [[review]] = await db.execute('SELECT id FROM guardian_learning_plan_reviews WHERE learning_plan_id=? AND guardian_user_id=? AND plan_revision=? AND retired_at IS NULL', [plan.id, guardian.guardian_user_id, revision]);
      if (!review) continue;
      const [noticed] = await db.execute("SELECT id FROM notifications WHERE type='guardian_plan_review' AND related_entity_type='guardian_learning_review' AND related_entity_id=? AND user_id=? LIMIT 1", [review.id, guardian.guardian_user_id]);
      if (!noticed.length) await Notification.create({ type: 'guardian_plan_review', severity: 'info', title: 'A learning plan is ready for your review',
        message: 'Your child/dependent’s learning plan has been updated. Sign in to review it and add your own acknowledgment.',
        agencyId: plan.agency_id, userId: guardian.guardian_user_id, relatedEntityType: 'guardian_learning_review', relatedEntityId: review.id,
        actorUserId, actorSource: 'tutor_plan_save', audienceJson: { clientId: plan.client_id } });
    }
    return { shared };
  } finally { try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { db.release(); } }
}

// This is called only after the staff plan endpoint has verified client/agency
// access. Parent-facing endpoints above always query the authenticated user.
export async function learningPlanStaffFeedback(plan) {
  const [ratings] = await pool.execute(`SELECT r.id,r.plan_goal_id,r.scale_value,r.rated_at,r.guardian_user_id,CONCAT_WS(' ',u.first_name,u.last_name) AS observer_name
    FROM guardian_learning_plan_ratings r JOIN users u ON u.id=r.guardian_user_id
    WHERE r.agency_id=? AND r.client_id=? AND r.learning_plan_id=? ORDER BY r.rated_at DESC,r.id DESC LIMIT 200`, [plan.agency_id, plan.client_id, plan.id]);
  const [acknowledgments] = await pool.execute(`SELECT r.id,r.guardian_user_id,r.signed_at,r.retired_at,CONCAT_WS(' ',u.first_name,u.last_name) AS observer_name
    FROM guardian_learning_plan_reviews r JOIN users u ON u.id=r.guardian_user_id
    WHERE r.agency_id=? AND r.client_id=? AND r.learning_plan_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 100`, [plan.agency_id, plan.client_id, plan.id]);
  return { ratings, acknowledgments };
}
