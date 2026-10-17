import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const state = vi.hoisted(() => ({ pool: null }));
vi.mock('../../config/database.js', () => ({ default: {
  execute: (...args) => state.pool.execute(...args),
  getConnection: (...args) => state.pool.getConnection(...args)
} }));
vi.mock('../guardianPlanProgress.service.js', () => ({ requireGuardianPlanAccess: vi.fn(async () => ({ learning: true })) }));
vi.mock('../../models/StudentLearningPlan.model.js', () => ({ default: { getPlanBundle: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn(), isNoView: () => false } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
import Plan from '../../models/StudentLearningPlan.model.js';
import Guardian from '../../models/ClientGuardian.model.js';
import { guardianLearningPlanProgress, learningPlanRevision, recordGuardianLearningRating, signGuardianLearningPlan, shareGuardianLearningPlan } from '../guardianLearningPlan.service.js';

const socket = process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated native learning plan feedback SQL', () => {
  let admin, bundle;
  const database = `guardian_plan_test_${crypto.randomBytes(5).toString('hex')}`;
  const context = { agencyId: 2, clientId: 5, userId: 10 };
  beforeAll(async () => {
    admin = await mysql.createConnection({ socketPath: socket, user: 'root', multipleStatements: true });
    await admin.query(`CREATE DATABASE ${database}`);
    state.pool = mysql.createPool({ socketPath: socket, user: 'root', database, multipleStatements: true });
    // These signed INT primary keys match migration 1315's actual plan tables.
    await state.pool.query(`CREATE TABLE student_learning_plans (id INT PRIMARY KEY,agency_id INT,client_id INT,title VARCHAR(255),status VARCHAR(32),approved_at DATETIME);
      CREATE TABLE student_learning_plan_goals (id INT PRIMARY KEY,learning_plan_id INT);
      CREATE TABLE notifications (id INT PRIMARY KEY,type VARCHAR(80),related_entity_type VARCHAR(80),related_entity_id BIGINT,user_id INT);`);
    await state.pool.query(await fs.readFile(new URL('../../../../database/migrations/1653_guardian_learning_plan_feedback.sql', import.meta.url), 'utf8'));
  });
  beforeEach(async () => {
    await state.pool.query('DELETE FROM guardian_learning_plan_reviews; DELETE FROM guardian_learning_plan_ratings; DELETE FROM student_learning_plan_goals; DELETE FROM student_learning_plans');
    await state.pool.query("INSERT INTO student_learning_plans VALUES(3,2,5,'Reading plan','active','2026-10-17'); INSERT INTO student_learning_plan_goals VALUES(8,3)");
    bundle = { plan: { id: 3, agency_id: 2, client_id: 5, title: 'Reading plan', status: 'active', approved_at: '2026-10-17' },
      goals: [{ id: 8, title: 'Reading fluency', metadata_json: { guardianRatingQuestion: 'Rate your child’s reading confidence from 1 to 10.', guardianRatingQuestionVerifiedBy: 4, guardianRatingQuestionVerifiedAt: '2026-10-17' } }], objectives: [] };
    Plan.getPlanBundle.mockImplementation(async () => bundle);
    Guardian.listForClient.mockResolvedValue([{ guardian_user_id: 10, access_enabled: 1 }, { guardian_user_id: 11, access_enabled: 1 }]);
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${database}`); await admin.end(); }
  });
  it('stores two independent acknowledgments and returns only the authenticated parent’s ratings', async () => {
    await shareGuardianLearningPlan({ bundle, actorUserId: 4 });
    const revision = learningPlanRevision(bundle);
    await recordGuardianLearningRating(context, { planId: 3, objectiveId: 8, revision, value: 3 });
    await recordGuardianLearningRating({ ...context, userId: 11 }, { planId: 3, objectiveId: 8, revision, value: 9 });
    const own = await guardianLearningPlanProgress(context);
    expect(own.goals[0].objectives[0].previousOwnRating.value).toBe(3);
    expect(own.acknowledgments).toHaveLength(1);
    expect(own.ratings).toEqual([]);
    await signGuardianLearningPlan(context, { planId: 3, linkId: own.acknowledgments[0].id, revision, signedByName: 'Parent One', agree: true });
    const other = await guardianLearningPlanProgress({ ...context, userId: 11 });
    expect(other.goals[0].objectives[0].previousOwnRating.value).toBe(9);
    expect(other.acknowledgments[0].status).toBe('issued');
    await expect(signGuardianLearningPlan({ ...context, userId: 11 }, { planId: 3, linkId: own.acknowledgments[0].id, revision, signedByName: 'Parent Two', agree: true })).rejects.toHaveProperty('status', 404);
  });
  it('deduplicates publication and retires prior signatures when the content changes', async () => {
    await shareGuardianLearningPlan({ bundle, actorUserId: 4 });
    await shareGuardianLearningPlan({ bundle, actorUserId: 4 });
    const [[initial]] = await state.pool.query('SELECT COUNT(*) n FROM guardian_learning_plan_reviews');
    expect(initial.n).toBe(2);
    const oldRevision = learningPlanRevision(bundle);
    const own = await guardianLearningPlanProgress(context);
    bundle.plan.parent_summary = 'A revised plan to review.';
    await shareGuardianLearningPlan({ bundle, actorUserId: 4 });
    const [[retired]] = await state.pool.query('SELECT COUNT(*) n FROM guardian_learning_plan_reviews WHERE retired_at IS NOT NULL');
    expect(retired.n).toBe(2);
    await expect(signGuardianLearningPlan(context, { planId: 3, linkId: own.acknowledgments[0].id, revision: oldRevision, signedByName: 'Parent One', agree: true })).rejects.toHaveProperty('status', 409);
  });
  it('enforces scale and foreign-key integrity in MySQL and cascades deleted goals', async () => {
    const revision = learningPlanRevision(bundle);
    const insert = 'INSERT INTO guardian_learning_plan_ratings (agency_id,client_id,learning_plan_id,plan_goal_id,guardian_user_id,plan_revision,scale_value) VALUES (2,5,3,?,10,?,?)';
    await expect(state.pool.execute(insert, [8, revision, 11])).rejects.toBeDefined();
    await expect(state.pool.execute(insert, [999, revision, 5])).rejects.toBeDefined();
    await state.pool.execute(insert, [8, revision, 5]);
    await state.pool.query('DELETE FROM student_learning_plan_goals WHERE id=8');
    const [[count]] = await state.pool.query('SELECT COUNT(*) n FROM guardian_learning_plan_ratings');
    expect(count.n).toBe(0);
  });
});
