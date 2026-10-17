import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listClientsForGuardian: vi.fn(), listForClient: vi.fn(), isNoView: p => !!p?.noView } }));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js', () => ({ default: { listByClient: vi.fn(), findById: vi.fn() } }));
vi.mock('../../models/clinical/ClinicalTreatmentObjectiveRating.model.js', () => ({ default: { listByClient: vi.fn(), create: vi.fn() }, computeProgressLabel: vi.fn(() => 'progressing') }));
vi.mock('../../models/TreatmentPlanAckLink.model.js', () => ({ TreatmentPlanAckLink: { listForPlan: vi.fn(), findById: vi.fn(), updateFields: vi.fn() } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ requireClinicalScope: vi.fn(), ageOn: () => 10 }));
vi.mock('../kioskObjectivePrompt.service.js', () => ({ verifiedObjectiveQuestion: o => o.kiosk_prompt_other_verified_at ? o.kiosk_prompt_other : '' }));
vi.mock('../treatmentPlanAck.service.js', () => ({ createDashboardShare: vi.fn(), signAcknowledgment: vi.fn() }));
vi.mock('../guardianLearningPlan.service.js', () => ({ guardianLearningPlanProgress: vi.fn(async () => null) }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import Plan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import Rating from '../../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import { TreatmentPlanAckLink as Link } from '../../models/TreatmentPlanAckLink.model.js';
import Notification from '../../models/Notification.model.js';
import { requireClinicalScope } from '../guardianClinicalAccess.service.js';
import { signAcknowledgment, createDashboardShare } from '../treatmentPlanAck.service.js';
import { guardianPlanRevision, guardianPlanProgress, recordGuardianPlanRating, signGuardianPlan, shareGuardianPlanRevision } from '../guardianPlanProgress.service.js';

const context = { userId: 10, clientId: 5, agencyId: 2 };
const objective = () => ({ id: 8, objective_index: 1, objective_text: 'Manage worry', scale_current: 7, scale_target: 3, kiosk_prompt_other: 'How would you rate the client’s worry on a scale of 1–10?', kiosk_prompt_other_verified_at: '2026-01-01', kiosk_prompt_other_verified_by: 4 });
const plan = () => ({ id: 3, agency_id: 2, client_id: 5, status: 'active', title: 'Support plan', goals: [{ id: 4, goal_index: 1, goal_text: 'Coping', objectives: [objective()] }] });
let current, db;
beforeEach(() => {
  vi.clearAllMocks(); current = plan();
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 5, agency_id: 2, client_type: 'clinical', relationship_type: 'guardian' }]);
  ClientGuardian.listForClient.mockResolvedValue([{ guardian_user_id: 10, access_enabled: 1 }, { guardian_user_id: 11, access_enabled: 1 }]);
  requireClinicalScope.mockResolvedValue({ scopes: ['treatment_plan', 'approve_goals'] });
  Plan.listByClient.mockResolvedValue([{ id: 3, status: 'active' }]); Plan.findById.mockImplementation(async () => current);
  clinicalPool.execute.mockResolvedValue([[{ objective_id: 8, scale_value: 6, rated_at: '2026-10-01', rated_by_user_id: 10 }]]);
  Rating.listByClient.mockResolvedValue([{ id: 1, objective_id: 8, rater_kind: 'clinician', scale_value: 7 }, { id: 2, objective_id: 8, rater_kind: 'other', scale_value: 9 }]);
  Rating.create.mockResolvedValue({ id: 9, scale_value: 5 }); Link.listForPlan.mockResolvedValue([]);
  createDashboardShare.mockImplementation(async input => ({ id: input.recipientUserId, status: 'issued' }));
  db = { execute: vi.fn(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]]), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
});
it('never publishes a draft when no finalized plan exists', async () => {
  Plan.listByClient.mockResolvedValue([{ id: 3, status: 'draft' }, { id: 4, status: 'inactive' }]);
  expect(await guardianPlanProgress(context)).toMatchObject({ hasActivePlan: false });
  expect(Plan.findById).not.toHaveBeenCalled();
});
it('keeps each parent’s prior score separate from clinician progress', async () => {
  const result = await guardianPlanProgress(context);
  expect(result.ratings).toHaveLength(1);
  expect(result.goals[0].objectives[0]).toMatchObject({ previousOwnRating: { value: 6 }, familyQuestion: 'How would you rate your child/dependent’s worry on a scale of 1–10?' });
  expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('rated_by_user_id=?'), [2, 5, 10, 'guardian:10']);
});
it('honors tenant and clinical disclosure restrictions before reading plans', async () => {
  await expect(guardianPlanProgress({ ...context, agencyId: 9 })).rejects.toMatchObject({ status: 403 });
  expect(Plan.listByClient).not.toHaveBeenCalled();
  requireClinicalScope.mockRejectedValue(Object.assign(new Error('Revoked'), { status: 403 }));
  await expect(guardianPlanProgress(context)).rejects.toMatchObject({ status: 403 });
});
it('does not require clinical grants for an authorized learning relationship', async () => {
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 5, agency_id: 2, client_type: 'learning' }]);
  expect((await guardianPlanProgress(context)).clientType).toBe('learning');
  expect(requireClinicalScope).not.toHaveBeenCalled();
});
it('honors explicit progress and signature restrictions for learning relationships', async () => {
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 5, agency_id: 2, client_type: 'learning', permissions_json: { canViewProgress: false } }]);
  await expect(guardianPlanProgress(context)).rejects.toMatchObject({ status: 403 });
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 5, agency_id: 2, client_type: 'learning', permissions_json: { canViewProgress: true, canSignDocs: false } }]);
  await expect(signGuardianPlan(context, { planKind: 'learning', agree: true })).rejects.toMatchObject({ status: 403 });
  expect(signAcknowledgment).not.toHaveBeenCalled();
});
it.each([[], '[]', 'null', 'false', '"wide"', 0, false, '1', 'invalid'])('fails closed for malformed relationship permissions %#', async permissions => {
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 5, agency_id: 2, client_type: 'learning', permissions_json: permissions }]);
  await expect(guardianPlanProgress(context)).rejects.toMatchObject({ status: 403 });
  expect(Plan.listByClient).not.toHaveBeenCalled();
});
it('omits superseded goals and never leaks a different parent’s rating in the JSON', async () => {
  current.goals.push({ id: 20, status: 'superseded', goal_text: 'Old private goal', objectives: [{ id: 21 }] });
  Rating.listByClient.mockResolvedValue([{ objective_id: 8, rater_kind: 'other', scale_value: 9, notes: 'Other parent private observation', rater_label: 'guardian:11' }]);
  const result = await guardianPlanProgress(context);
  expect(result.goals).toHaveLength(1); expect(result.ratings).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('Other parent');
  expect(JSON.stringify(result)).not.toContain('guardian:11');
});
it('writes parent observations with authenticated identity and never as clinician ratings', async () => {
  await recordGuardianPlanRating(context, { planId: 3, revision: guardianPlanRevision(current), objectiveId: 8, value: 5, userId: 11, raterKind: 'clinician' });
  expect(Rating.create).toHaveBeenCalledWith(expect.objectContaining({ ratedByUserId: 10, raterKind: 'other', raterLabel: 'guardian:10', scaleValue: 5 }));
});
it.each([0, 11, 1.5, 'oops'])('rejects invalid scale %s', async value => {
  await expect(recordGuardianPlanRating(context, { planId: 3, revision: guardianPlanRevision(current), objectiveId: 8, value })).rejects.toMatchObject({ status: 400 });
  expect(Rating.create).not.toHaveBeenCalled();
});
it('requires reviewed family wording and the current plan version', async () => {
  await expect(recordGuardianPlanRating(context, { planId: 3, revision: 'stale', objectiveId: 8, value: 5 })).rejects.toMatchObject({ status: 409 });
  current.goals[0].objectives[0].kiosk_prompt_other_verified_at = null;
  await expect(recordGuardianPlanRating(context, { planId: 3, revision: guardianPlanRevision(current), objectiveId: 8, value: 5 })).rejects.toMatchObject({ status: 409 });
  expect(Rating.create).not.toHaveBeenCalled();
});
it('requires the recipient’s own acknowledgment and electronic consent', async () => {
  Link.findById.mockResolvedValue({ id: 50, recipient_user_id: 11, agency_id: 2, client_id: 5, treatment_plan_id: 3, dashboard_visible: true, meta_json: { planRevision: guardianPlanRevision(current) } });
  await expect(signGuardianPlan(context, { linkId: 50, agree: true, signedByName: 'Parent One', revision: guardianPlanRevision(current) })).rejects.toMatchObject({ status: 404 });
  await expect(signGuardianPlan(context, { linkId: 50, agree: false })).rejects.toMatchObject({ status: 400 });
  expect(signAcknowledgment).not.toHaveBeenCalled();
});
it('invalidates signatures for content changes but not clinical rating or ack timestamps', () => {
  const revision = guardianPlanRevision(current);
  current.updated_at = '2030-01-01'; current.client_ack_status = 'signed'; current.goals[0].objectives[0].scale_current = 4;
  expect(guardianPlanRevision(current)).toBe(revision);
  current.goals[0].objectives[0].scale_target = 2;
  expect(guardianPlanRevision(current)).not.toBe(revision);
});
it('creates a distinct request and in-app notice for each currently authorized parent', async () => {
  expect(await shareGuardianPlanRevision({ plan: current, actorUserId: 4 })).toEqual({ shared: 2, eligible: 2 });
  expect(createDashboardShare.mock.calls.map(([args]) => args.recipientUserId)).toEqual([10, 11]);
  expect(Notification.create).toHaveBeenCalledTimes(2);
  expect(db.release).toHaveBeenCalled();
});
it('does not duplicate current requests or create new ones for revoked guardians', async () => {
  Link.listForPlan.mockResolvedValue([{ id: 10, recipient_user_id: 10, meta_json: { planRevision: guardianPlanRevision(current) }, status: 'signed' }]);
  requireClinicalScope.mockImplementation(async ({ userId }) => { if (userId === 11) throw Object.assign(new Error('Revoked'), { status: 403 }); });
  expect(await shareGuardianPlanRevision({ plan: current, actorUserId: 4 })).toEqual({ shared: 0, eligible: 1 });
  expect(createDashboardShare).not.toHaveBeenCalled();
});
