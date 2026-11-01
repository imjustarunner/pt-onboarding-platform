import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { findBySuperviseeAndType: vi.fn() } }));
vi.mock('../staffCareEligibility.service.js', () => ({ requireStaffCareEligibility: vi.fn() }));
vi.mock('../guardianPlanProgress.service.js', () => ({ requireGuardianPlanAccess: vi.fn(), isSharedPlanStatus: (status) => ['active', 'final', 'finalized'].includes(status) }));
vi.mock('../noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn() }));
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import Guardian from '../../models/ClientGuardian.model.js';
import User from '../../models/User.model.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import pool from '../../config/database.js';
vi.mock('../clientServiceEnrollment.service.js', () => ({ listClientServices: vi.fn(async () => []) }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: vi.fn(async () => ({ url: (path) => `https://app.example.test/${path}` })), sendClientPortalEmail: vi.fn(async () => ({ id: 'accepted' })) }));
import { sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { listClientServices } from '../clientServiceEnrollment.service.js';
import { requireGuardianPlanAccess } from '../guardianPlanProgress.service.js';
import { createTreatmentGoalProgressService, treatmentGoalProgressEmail, sendProgressEmail, assertQueuedTreatmentGoalProgressRecipient } from '../treatmentGoalProgress.service.js';

let state, db, deps, service;
const req = () => ({ user: { id: 1439, role: 'provider' } });
const input = (status = 'improved') => ({ agencyId: 450, clientId: 2297, planId: 51, goalId: 61, status, expectedStatus: 'active' });
const denied = () => Object.assign(new Error('Permission removed'), { status: 403 });
beforeEach(() => {
  vi.clearAllMocks(); listClientServices.mockResolvedValue([]); requireGuardianPlanAccess.mockResolvedValue({});
  state = { goal: { id: 61, treatment_plan_id: 51, agency_id: 450, client_id: 2297, created_by_user_id: 1439, status: 'active', plan_status: 'active', goal_text: 'PRIVATE CLINICAL GOAL' }, events: [], jobs: [] };
  let snapshot;
  async function execute(sql, params = []) {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[]];
    if (sql.startsWith('SELECT g.')) return [params[0] === 61 && params[1] === 51 && params[2] === 450 && params[3] === 2297 ? [{ ...state.goal }] : []];
    if (sql.startsWith('UPDATE clinical_treatment_plan_goals')) { state.goal.status = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.includes('INSERT INTO clinical_treatment_goal_progress_events')) {
      const row = { id: state.events.length + 1, agency_id: params[0], client_id: params[1], treatment_plan_id: params[2], goal_id: params[3], actor_user_id: params[4], previous_status: params[5], progress_status: params[6], service_id: params[7] }; state.events.push(row); return [{ insertId: row.id }];
    }
    if (sql.includes('INSERT INTO clinical_treatment_goal_progress_deliveries')) { state.jobs.push({ ...state.events.find((event) => event.id === params[0]), id: state.jobs.length + 1, progress_event_id: params[0], recipient_user_id: params[1], delivery_status: 'pending' }); return [{ insertId: state.jobs.length }]; }
    if (sql.startsWith('SELECT d.')) {
      if (sql.includes('WHERE d.id=?')) return [[state.jobs.find((job) => job.id === params[0])].filter(Boolean)];
      if (sql.includes("IN ('queued','sending')")) return [state.jobs.filter((job) => ['queued', 'sending'].includes(job.delivery_status) && job.communication_id)];
      return [state.jobs.filter((job) => job.delivery_status === 'pending' && (!params.length || job.progress_event_id === params[0]))];
    }
    if (sql.startsWith('UPDATE clinical_treatment_goal_progress_deliveries')) {
      const job = state.jobs.find((row) => row.id === params.at(-1));
      if (sql.includes('interrupted_send')) return [{ affectedRows: 0 }];
      if (sql.includes('notification_id=?')) job.notification_id = params[0];
      else if (sql.includes('communication_id=?')) { job.delivery_status = params[0]; job.communication_id = params[1]; }
      else if (sql.includes("delivery_status='sending'")) job.delivery_status = 'sending';
      else if (sql.includes("delivery_status='skipped'")) job.delivery_status = 'skipped';
      else if (sql.includes("delivery_status='needs_review'")) job.delivery_status = 'needs_review';
      else if (sql.includes('delivery_status=?')) job.delivery_status = params[0];
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unhandled test query: ${sql}`);
  }
  db = { execute: vi.fn(execute), getConnection: vi.fn(async () => db), beginTransaction: vi.fn(async () => { snapshot = structuredClone(state); }), commit: vi.fn(), rollback: vi.fn(async () => { state = snapshot || state; }), release: vi.fn() };
  deps = { serviceContext: vi.fn(async () => 808), database: db, requireProvider: vi.fn(), recipients: vi.fn(async () => [601, 602]), authorizeRecipient: vi.fn(async (job) => ({ user: { id: job.recipient_user_id }, to: `${job.recipient_user_id}@example.test` })), notify: vi.fn(async (job) => ({ id: job.id + 10 })), send: vi.fn(async (job) => ({ id: `transport-${job.id}`, communicationId: job.id + 100 })), audit: vi.fn(), receipt: vi.fn(async () => null) };
  service = createTreatmentGoalProgressService(deps);
});
it('commits a progress event and separate recipient jobs with the status and never rewrites goal content', async () => {
  const result = await service.update(req(), input());
  expect(state.goal).toMatchObject({ status: 'improved', goal_text: 'PRIVATE CLINICAL GOAL' });
  expect(state.events).toHaveLength(1); expect(state.jobs).toHaveLength(2); expect(db.commit).toHaveBeenCalledOnce();
  expect(result.notifications).toEqual({ sent: 2 }); expect(deps.send).toHaveBeenCalledTimes(2);
  expect(deps.audit.mock.calls[0][1].metadata).toMatchObject({ treatmentPlanId: 51, goalId: 61, progressEventId: 1 });
  expect(JSON.stringify(deps.audit.mock.calls)).not.toContain('PRIVATE CLINICAL GOAL');
});
it('makes saving or reloading the same assessment a durable no-op', async () => {
  await service.update(req(), input()); const again = await service.update(req(), input()); await service.dispatch();
  expect(again.changed).toBe(false); expect(state.events).toHaveLength(1); expect(deps.send).toHaveBeenCalledTimes(2);
});
it('allows an explicit return to in-progress without notifying families', async () => {
  state.goal.status = 'achieved'; await service.update(req(), { ...input('active'), expectedStatus: 'achieved' });
  expect(state.goal.status).toBe('active'); expect(state.jobs).toEqual([]); expect(deps.send).not.toHaveBeenCalled();
});
it('rejects stale, foreign and unshared plan updates before creating events or messages', async () => {
  await expect(service.update(req(), { ...input(), clientId: 9 })).rejects.toMatchObject({ status: 404 });
  await expect(service.update(req(), { ...input(), expectedStatus: 'achieved' })).rejects.toMatchObject({ status: 409 });
  state.goal.plan_status = 'draft'; await expect(service.update(req(), input())).rejects.toMatchObject({ status: 409 });
  expect(state.events).toEqual([]); expect(deps.send).not.toHaveBeenCalled();
});
it('rolls back the goal status if the durable event cannot be saved', async () => {
  const execute = db.execute.getMockImplementation(); db.execute.mockImplementation((sql, params) => sql.includes('INSERT INTO clinical_treatment_goal_progress_events') ? Promise.reject(new Error('Unavailable')) : execute(sql, params));
  await expect(service.update(req(), input())).rejects.toThrow('Unavailable'); expect(state.goal.status).toBe('active'); expect(state.jobs).toEqual([]); expect(deps.send).not.toHaveBeenCalled();
});
it('rechecks access at delivery and skips recipients whose clinical permissions were removed', async () => {
  deps.authorizeRecipient.mockRejectedValue(denied()); const result = await service.update(req(), input());
  expect(result.notifications).toEqual({ skipped: 2 }); expect(deps.notify).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
});
it('checks permissions again after notification creation before starting email transport', async () => {
  deps.recipients.mockResolvedValue([601]); deps.authorizeRecipient.mockResolvedValueOnce({ to: '601@example.test' }).mockRejectedValue(denied());
  await service.update(req(), input()); expect(deps.notify).toHaveBeenCalledOnce(); expect(deps.send).not.toHaveBeenCalled();
});
it('holds an uncertain send for review and never blindly retries it', async () => {
  deps.send.mockRejectedValue(new Error('Transport timeout after possible acceptance'));
  const result = await service.update(req(), input()); expect(result.notifications).toEqual({ needs_review: 2 });
  await service.dispatch(); expect(deps.send).toHaveBeenCalledTimes(2); expect(state.jobs.map((job) => job.delivery_status)).toEqual(['needs_review', 'needs_review']);
});
it('reconciles an approved queued email from transport receipt without sending it again', async () => {
  deps.send.mockResolvedValue({ queued: true, communicationId: 100 }); await service.update(req(), input());
  deps.receipt.mockResolvedValue({ delivery_status: 'failed', external_message_id: 'actual-accepted-message' });
  await service.dispatch(); expect(state.jobs.every((job) => job.delivery_status === 'sent')).toBe(true); expect(deps.send).toHaveBeenCalledTimes(2);
});
it.each(['support', 'school_staff', 'client', 'client_guardian'])('blocks %s from authoring a clinical progress assessment', async (role) => {
  const guarded = createTreatmentGoalProgressService({ ...deps, requireProvider: undefined });
  await expect(guarded.update({ user: { id: 1439, role } }, input())).rejects.toMatchObject({ status: 403 }); expect(state.events).toEqual([]);
});
it('allows the assigned clinical supervisor but rejects an unrelated provider', async () => {
  const guarded = createTreatmentGoalProgressService({ ...deps, requireProvider: undefined });
  SupervisorAssignment.findBySuperviseeAndType.mockResolvedValue({ supervisor_id: 1438 });
  await expect(guarded.update({ user: { id: 1433, role: 'provider' } }, input())).rejects.toMatchObject({ status: 403 });
  await guarded.update({ user: { id: 1438, role: 'provider_plus' } }, input()); expect(state.goal.status).toBe('improved');
});
it('queues only currently permitted portal clients/guardians, including self access', async () => {
  Guardian.listForClient.mockResolvedValue([{ guardian_user_id: 601, access_enabled: 1, relationship_type: 'guardian' }, { guardian_user_id: 602, access_enabled: 1, relationship_type: 'guardian' }, { guardian_user_id: 603, access_enabled: 0 }, { guardian_user_id: 604, access_enabled: 1, relationship_type: 'self' }]);
  requireGuardianPlanAccess.mockImplementation(async ({ userId }) => { if (userId === 602) throw denied(); });
  await createTreatmentGoalProgressService({ ...deps, recipients: undefined }).update(req(), input('achieved'));
  expect(state.jobs.map((job) => job.recipient_user_id)).toEqual([601, 604]);
});
it('keeps goal wording, client identities and other guardians out of each template', () => {
  const message = treatmentGoalProgressEmail('achieved', 'https://portal.example.test/guardian?panel=plan');
  expect(message.text).toContain('marked a treatment goal as achieved'); expect(message).not.toHaveProperty('cc');
  expect(treatmentGoalProgressEmail('improved', 'https://portal.example.test', 'es')).toMatchObject({ locale: 'es', linkLabel: 'Ver las actualizaciones' });
  expect(() => treatmentGoalProgressEmail('active', 'https://portal.example.test')).toThrow();
});
const queuedInput = { communicationId: 120, agencyId: 450, clientId: 2297, userId: 601, to: 'parent@example.test' };
function queuedFixture() {
  requireGuardianPlanAccess.mockResolvedValue({});
  User.findById.mockResolvedValue({ id: 601, email: 'parent@example.test', is_active: 1, status: 'ACTIVE' });
  pool.execute.mockResolvedValue([[{}]]);
  clinicalPool.execute.mockImplementation(async (sql) => sql.startsWith('SELECT d.')
    ? [[{ id: 1, communication_id: 120, recipient_user_id: 601, agency_id: 450, client_id: 2297, goal_id: 61, treatment_plan_id: 51, progress_status: 'improved', delivery_status: 'queued' }]]
    : sql.startsWith('UPDATE') ? [{ affectedRows: 1 }] : [[{ status: 'improved', plan_status: 'active', agency_id: 450, client_id: 2297, created_by_user_id: 1439 }]]);
}
it('rechecks current clinical disclosure before an approval queue is released', async () => {
  queuedFixture(); requireGuardianPlanAccess.mockRejectedValue(denied());
  await expect(assertQueuedTreatmentGoalProgressRecipient(queuedInput)).rejects.toMatchObject({ status: 403 });
  expect(User.findById).not.toHaveBeenCalled();
});
it('refuses stale recipient addresses and an already-accepted queued message', async () => {
  queuedFixture(); await expect(assertQueuedTreatmentGoalProgressRecipient({ ...queuedInput, to: 'other-parent@example.test' })).rejects.toMatchObject({ status: 403 });
  pool.execute.mockResolvedValue([[{ external_message_id: 'already-accepted' }]]);
  await expect(assertQueuedTreatmentGoalProgressRecipient(queuedInput)).rejects.toMatchObject({ status: 409 });
});
it('claims queued transport once so simultaneous approval clicks cannot duplicate it', async () => {
  queuedFixture(); await assertQueuedTreatmentGoalProgressRecipient({ ...queuedInput, claim: true });
  expect(clinicalPool.execute.mock.calls.at(-1)[0]).toContain("delivery_status='sending' WHERE id=? AND delivery_status='queued'");
  clinicalPool.execute.mockResolvedValueOnce([[{ delivery_status: 'sending' }]]);
  await expect(assertQueuedTreatmentGoalProgressRecipient({ ...queuedInput, claim: true })).rejects.toMatchObject({ status: 403 });
});

it('sends the branded portal button to the exact dependent and counseling service', async () => {
  await sendProgressEmail({ agency_id: 450, client_id: 2297, service_id: 808, recipient_user_id: 601, progress_status: 'achieved', actor_user_id: 1439 }, { to: 'parent@example.test', user: {} });
  expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({ linkUrl: 'https://app.example.test/guardian?panel=plan&clientId=2297&serviceId=808', userId: 601, clientId: 2297, to: 'parent@example.test', templateType: 'treatment_goal_progress' }));
});
it('binds recipient access to the plan provider counseling service and rejects ambiguity', async () => {
  listClientServices.mockResolvedValue([{ id: 808, service_kind: 'counseling', is_active: 1, provider_user_id: 1439 }, { id: 909, service_kind: 'counseling', is_active: 1, provider_user_id: 1433 }]);
  await createTreatmentGoalProgressService({ ...deps, serviceContext: undefined }).update(req(), input());
  expect(deps.recipients).toHaveBeenCalledWith({ agencyId: 450, clientId: 2297, serviceId: 808 });
  expect(state.events[0].service_id).toBe(808);
  listClientServices.mockResolvedValue([{ id: 808, service_kind: 'counseling', is_active: 1, provider_user_id: 1433 }]);
  await expect(createTreatmentGoalProgressService({ ...deps, serviceContext: undefined }).update(req(), input('achieved'))).rejects.toMatchObject({ status: 409 });
});
it('does not call pending approval or unreviewed redirects accepted delivery', async () => {
  deps.send.mockResolvedValue({ id: 'not-proof', pendingApproval: true });
  expect((await service.update(req(), input())).notifications).toEqual({ needs_review: 2 });
  state.goal.status = 'active'; deps.send.mockResolvedValue({ id: 'redirected', redirected: true });
  expect((await service.update(req(), input('achieved'))).notifications).toEqual({ needs_review: 2 });
});
it('makes persistent delivery follow-up available without disclosing recipients or note contents', async () => {
  const database = { execute: vi.fn().mockResolvedValueOnce([[{ id: 51, agency_id: 450, client_id: 2297, created_by_user_id: 1439 }]])
    .mockResolvedValueOnce([[{ id: 1, goal_id: 61, progress_status: 'improved', delivery_status: 'sent', recipient_count: 1 }, { id: 1, goal_id: 61, progress_status: 'improved', delivery_status: 'needs_review', recipient_count: 1 }]]) };
  const result = await createTreatmentGoalProgressService({ ...deps, database }).history(req(), input());
  expect(result.events).toEqual([{ id: 1, goalId: 61, status: 'improved', createdAt: undefined, delivery: { sent: 1, needs_review: 1 } }]);
  expect(deps.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'clinical_treatment_goal_progress_viewed', metadata: { treatmentPlanId: 51 } }));
  await expect(service.history({ user: { id: 601, role: 'client_guardian' } }, input())).rejects.toMatchObject({ status: 403 });
});
