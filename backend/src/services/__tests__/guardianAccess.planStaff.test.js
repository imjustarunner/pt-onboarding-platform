import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../familyBillingPolicy.service.js', () => ({ requireResponsiblePayer: vi.fn() }));
vi.mock('../../utils/learningAccess.js', () => ({ assertLearningClientAccess: vi.fn() }));
vi.mock('../tutoringLearningOs.service.js', () => ({ StudentSubject: { findById: vi.fn() }, StudentLearningPlan: { findById: vi.fn(), findGoalById: vi.fn(), update: vi.fn(), create: vi.fn(), updateGoal: vi.fn(), getPlanBundle: vi.fn() } }));
import { requireStaffPlanActor, guardianLearningRouteAllowed } from '../../utils/planStaffAccess.js';
import { createOrUpdatePlan, getPlan, approvePlan } from '../../controllers/tutoringLearningOs.controller.js';
import { StudentSubject, StudentLearningPlan } from '../tutoringLearningOs.service.js';
let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { user: { id: 4, role: 'provider' }, body: { id: 3, studentSubjectId: 7, goals: [{ id: 8 }] }, params: { planId: 3 } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  StudentSubject.findById.mockResolvedValue({ id: 7, client_id: 5, agency_id: 2 });
  StudentLearningPlan.findById.mockResolvedValue({ id: 3, client_id: 5, agency_id: 2, student_subject_id: 7 });
});
it.each(['client_guardian', 'guardian', 'client', 'student', 'school_staff'])('blocks %s from the all-observer staff view', role => {
  expect(() => requireStaffPlanActor({ id: 10, role })).toThrow('Staff plan access');
});
it('permits provider roles while preserving the separate agency/client guard', () => {
  expect(() => requireStaffPlanActor({ id: 4, role: 'provider' })).not.toThrow();
});
it.each([['POST', '/plans'], ['POST', '/plans/3/approve'], ['GET', '/plans/3'], ['GET', '/subjects/7/evidence'], ['POST', '/session-notes']])('keeps %s %s out of family routes', (method, path) => {
  expect(guardianLearningRouteAllowed(method, path)).toBe(false);
});
it.each([['GET', '/clients/5/office-status'], ['POST', '/clients/5/office-visit'], ['GET', '/clients/5/guardian-dashboard'], ['POST', '/practice/7/complete'], ['POST', '/clients/5/packages/3/checkout']])('preserves authorized family operation %s %s', (method, path) => {
  expect(guardianLearningRouteAllowed(method, path)).toBe(true);
});
it.each([createOrUpdatePlan, getPlan, approvePlan])('also rejects family roles inside the staff handler', async handler => {
  req.user.role = 'client_guardian';
  await handler(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(StudentSubject.findById).not.toHaveBeenCalled();
  expect(StudentLearningPlan.findById).not.toHaveBeenCalled();
});
it('validates a submitted existing goal belongs to the plan before any mutation', async () => {
  StudentLearningPlan.findGoalById.mockResolvedValue({ id: 8, learning_plan_id: 99, student_subject_id: 7 });
  await createOrUpdatePlan(req, res, next);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(StudentLearningPlan.update).not.toHaveBeenCalled();
  expect(StudentLearningPlan.updateGoal).not.toHaveBeenCalled();
});
it('validates the existing plan belongs to the selected subject and agency', async () => {
  req.body.goals = [];
  StudentLearningPlan.findById.mockResolvedValue({ id: 3, client_id: 5, agency_id: 99, student_subject_id: 7 });
  await createOrUpdatePlan(req, res, next);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(StudentLearningPlan.update).not.toHaveBeenCalled();
});
