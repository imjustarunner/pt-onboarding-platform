import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/StudentLearningPlan.model.js', () => ({ default: { getPlanBundle: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn(), isNoView: p => !!p?.noView } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../guardianPlanProgress.service.js', () => ({ requireGuardianPlanAccess: vi.fn(async () => ({ learning: true })) }));
import pool from '../../config/database.js';
import Plan from '../../models/StudentLearningPlan.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import Notification from '../../models/Notification.model.js';
import { requireGuardianPlanAccess } from '../guardianPlanProgress.service.js';
import { guardianLearningPlanProgress, learningPlanRevision, recordGuardianLearningRating, signGuardianLearningPlan, shareGuardianLearningPlan } from '../guardianLearningPlan.service.js';
const context = { userId: 10, agencyId: 2, clientId: 5 };
let bundle, db;
beforeEach(() => {
  vi.clearAllMocks(); requireGuardianPlanAccess.mockResolvedValue({ learning: true });
  bundle = { plan: { id: 3, agency_id: 2, client_id: 5, status: 'active', approved_at: '2026-10-01', title: 'Reading', parent_summary: 'Practice reading.' },
    goals: [{ id: 8, title: 'Reading fluency', status: 'developing', metadata_json: { guardianRatingQuestion: 'How confident is your child/dependent with reading, from 1 (not at all) to 10 (very)?', guardianRatingQuestionVerifiedBy: 4, guardianRatingQuestionVerifiedAt: '2026-10-01' } }], objectives: [] };
  Plan.getPlanBundle.mockImplementation(async () => bundle);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT id,title FROM student_learning_plans')) return [[{ id: 3, title: 'Reading' }]];
    if (sql.includes('FROM guardian_learning_plan_ratings')) return [[{ id: 5, plan_goal_id: 8, scale_value: 4, rated_at: '2026-10-03' }]];
    if (sql.includes('SELECT * FROM guardian_learning_plan_reviews')) return [[{ id: 20 }]];
    if (sql.includes('FROM guardian_learning_plan_reviews')) return [[{ id: 20, signed_at: null }]];
    return [{ insertId: 9, affectedRows: 1 }];
  });
  ClientGuardian.listForClient.mockResolvedValue([{ guardian_user_id: 10, access_enabled: 1 }, { guardian_user_id: 11, access_enabled: 1 }]);
  db = { execute: vi.fn(async (sql, args) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('INSERT IGNORE')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT id FROM guardian_learning_plan_reviews')) return [[{ id: 20 }]];
    if (sql.includes('SELECT * FROM guardian_learning_plan_reviews') || sql.includes('UPDATE guardian_learning_plan_reviews SET signed_name')) return pool.execute(sql, args);
    return [[]];
  }), release: vi.fn() };
  pool.getConnection.mockResolvedValue(db);
});
it('returns only own ratings and own version-specific acknowledgments', async () => {
  const result = await guardianLearningPlanProgress(context);
  expect(result.plan).toMatchObject({ id: 3, kind: 'learning' });
  expect(result.goals[0].objectives[0].previousOwnRating.value).toBe(4);
  expect(result.ratings).toEqual([]);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM guardian_learning_plan_ratings'), [2, 5, 3, 10]);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM guardian_learning_plan_reviews'), [2, 5, 3, 10, learningPlanRevision(bundle)]);
});
it('does not expose a draft or another tenant’s plan', async () => {
  bundle.plan.status = 'draft';
  await expect(guardianLearningPlanProgress(context)).rejects.toMatchObject({ status: 404 });
  bundle.plan.status = 'active'; bundle.plan.agency_id = 7;
  await expect(guardianLearningPlanProgress(context)).rejects.toMatchObject({ status: 404 });
});
it('does not conflate parent numeric observations with tutor mastery classifications', async () => {
  await recordGuardianLearningRating(context, { planId: 3, objectiveId: 8, revision: learningPlanRevision(bundle), value: 6, guardianUserId: 11 });
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO guardian_learning_plan_ratings'), [2, 5, 3, 8, 10, learningPlanRevision(bundle), 6]);
  expect(bundle.goals[0].status).toBe('developing');
});
it('requires verified family wording and a current revision before recording a score', async () => {
  await expect(recordGuardianLearningRating(context, { planId: 3, objectiveId: 8, revision: 'old', value: 6 })).rejects.toMatchObject({ status: 409 });
  bundle.goals[0].metadata_json.guardianRatingQuestionVerifiedBy = null;
  await expect(recordGuardianLearningRating(context, { planId: 3, objectiveId: 8, revision: learningPlanRevision(bundle), value: 6 })).rejects.toMatchObject({ status: 409 });
  expect(pool.execute).not.toHaveBeenCalled();
});
it('requires a personally addressed request and explicit consent to sign', async () => {
  await expect(signGuardianLearningPlan(context, { planId: 3, linkId: 20, revision: learningPlanRevision(bundle), agree: false, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 400 });
  await signGuardianLearningPlan(context, { planId: 3, linkId: 20, revision: learningPlanRevision(bundle), agree: true, signedByName: 'Parent One' });
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM guardian_learning_plan_reviews'), [20, 2, 5, 3, 10, learningPlanRevision(bundle)]);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE guardian_learning_plan_reviews SET signed_name'), ['Parent One', 20, 10]);
});
it('checks current relationship authorization again for rating and signing', async () => {
  requireGuardianPlanAccess.mockRejectedValue(Object.assign(new Error('Revoked'), { status: 403 }));
  await expect(recordGuardianLearningRating(context, { planId: 3 })).rejects.toMatchObject({ status: 403 });
  await expect(signGuardianLearningPlan(context, { planId: 3, agree: true, signedByName: 'Parent' })).rejects.toMatchObject({ status: 403 });
  expect(pool.execute).not.toHaveBeenCalled();
});
it('creates separate review requests for each permitted guardian after tutor approval', async () => {
  expect(await shareGuardianLearningPlan({ bundle, actorUserId: 4 })).toEqual({ shared: 2 });
  expect(Notification.create).toHaveBeenCalledTimes(2);
  expect(Notification.create.mock.calls.map(([arg]) => arg.userId)).toEqual([10, 11]);
});
it('never creates family review requests for an unapproved draft', async () => {
  bundle.plan.status = 'draft'; bundle.plan.approved_at = null;
  expect(await shareGuardianLearningPlan({ bundle, actorUserId: 4 })).toEqual({ shared: 0 });
  expect(Notification.create).not.toHaveBeenCalled();
});
it('does not invalidate plan acknowledgment when tutor mastery status changes', () => {
  const revision = learningPlanRevision(bundle);
  bundle.goals[0].status = 'mastered'; bundle.plan.updated_at = '2030-01-01';
  expect(learningPlanRevision(bundle)).toBe(revision);
  bundle.goals[0].success_criteria = 'New target';
  expect(learningPlanRevision(bundle)).not.toBe(revision);
});
it('revalidates the plan after waiting for publication and releases the shared lock', async () => {
  const revision = learningPlanRevision(bundle);
  const execute = db.execute.getMockImplementation();
  db.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('GET_LOCK')) bundle.plan.parent_summary = 'Changed while waiting for publication.';
    return execute(sql, args);
  });
  await expect(signGuardianLearningPlan(context, { planId: 3, linkId: 20, revision, agree: true, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 409 });
  expect(db.execute).toHaveBeenCalledWith('SELECT GET_LOCK(?,10) AS acquired', ['guardian-learning-share:3']);
  expect(db.execute).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)', ['guardian-learning-share:3']);
  expect(db.release).toHaveBeenCalledOnce();
  expect(pool.execute).not.toHaveBeenCalled();
});
it('rejects a retired review instead of reporting success when the signature update affects no rows', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 20 }]]).mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
  await expect(signGuardianLearningPlan(context, { planId: 3, linkId: 20, revision: learningPlanRevision(bundle), agree: true, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 409 });
  expect(db.release).toHaveBeenCalledOnce();
});
it('allows an idempotent retry only if the exact current review is already signed', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 20 }]]).mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ id: 20, signed_at: '2026-10-17' }]]);
  expect(await signGuardianLearningPlan(context, { planId: 3, linkId: 20, revision: learningPlanRevision(bundle), agree: true, signedByName: 'Parent One' })).toEqual({ id: 20, status: 'signed' });
  expect(db.release).toHaveBeenCalledOnce();
});
