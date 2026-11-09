import { beforeEach, describe, expect, it, vi } from 'vitest';
const effects = vi.hoisted(() => ({ send: vi.fn(), lock: vi.fn(), live: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: effects.send }));
vi.mock('../messagingJobLock.service.js', () => ({ withMessagingJobLock: effects.lock }));
vi.mock('../schedulingWorkerGate.js', () => ({ canRunSchedulingMaintenance: effects.live }));
import { schoolScheduleTrainingForUser, processSchoolScheduleTraining, schoolScheduleTrainingEmail, runSchoolScheduleTrainingTick } from '../schoolScheduleTraining.service.js';

const provider = { id: 12, role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1, membership_active: 1, is_archived: 0, is_demo: 0, is_assistant_account: 0, has_school_assignments: 1 };
beforeEach(() => { vi.clearAllMocks(); effects.live.mockResolvedValue(true); });

describe('School provider training audience', () => {
  it('returns the video and UTC expiry only for current, affiliated school providers in ITSCO', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[provider]]).mockResolvedValueOnce([[{ expires_at: '2026-12-09T18:00:00Z' }]]);
    const result = await schoolScheduleTrainingForUser({ userId: 12, agencyId: 2 }, { execute });
    expect(result).toEqual([expect.objectContaining({ id: 'school-my-schedule-update', agencyIds: [2], url: 'https://youtu.be/qfVy1Czud2w', expiresAt: '2026-12-09T18:00:00Z' })]);
    expect(execute.mock.calls[0][0]).toContain("a.slug='itsco'");
    expect(execute.mock.calls[0][0]).toContain('psa.is_active=1');
    expect(execute.mock.calls[0][0]).toContain('oa.is_active=1');
    expect(execute.mock.calls[0][1]).toEqual([12, 2]);
    expect(execute.mock.calls[1][0]).toContain('expires_at>UTC_TIMESTAMP()');
  });
  it.each([null, { role: 'school_staff' }, { is_active: 0 }, { membership_active: 0 }, { is_archived: 1 }, { is_demo: 1 }, { is_assistant_account: 1 }, { has_school_assignments: 0 }, { status: 'TERMINATED' }])('hides from ineligible membership %j', async patch => {
    const execute = vi.fn().mockResolvedValueOnce([[patch === null ? null : { ...provider, ...patch }]]);
    expect(await schoolScheduleTrainingForUser({ userId: 12, agencyId: 2 }, { execute })).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('hides an expired campaign and ignores missing context', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[provider]]).mockResolvedValueOnce([[]]);
    expect(await schoolScheduleTrainingForUser({ userId: 12, agencyId: 2 }, { execute })).toEqual([]);
    execute.mockClear();
    expect(await schoolScheduleTrainingForUser({ userId: 12, agencyId: null }, { execute })).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});

function workerDb({ expired = false, existingId = null, existingStatus = 'sent', groupReady = true } = {}) {
  const campaign = { id: 3, agency_id: 2, expired: Number(expired) };
  const execute = vi.fn(async (sql) => {
    if (sql.includes('SELECT c.*')) return [[campaign]];
    if (sql.includes('FROM user_communications')) return [existingId ? [{ id: existingId, delivery_status: existingStatus }] : []];
    if (sql.includes('FROM managed_workspace_groups')) return [[groupReady ? { manager_user_ids: '[12]' } : undefined]];
    if (sql.includes('FROM users u')) return [[provider]];
    if (sql.includes('UPDATE school_schedule_training_campaigns')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { execute };
}
describe('Durable launch and expiration emails', () => {
  it('sends the launch to schoolproviders using its configured manager and records the receipt', async () => {
    const database = workerDb(); const send = vi.fn().mockResolvedValue({ communicationId: 33 });
    await processSchoolScheduleTraining(database, send);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'schoolproviders@itsco.health', generatedByUserId: 12, templateType: 'school_schedule_training_launch', templateId: 3, source: 'auto', text: expect.stringContaining('quick video on updates to your My Schedule') }));
    expect(database.execute).toHaveBeenLastCalledWith(expect.stringContaining('SET launch_communication_id=?'), [33, 3]);
  });
  it('sends only the admin expiry notice after the boundary and includes Michael’s request', async () => {
    const database = workerDb({ expired: true }); const send = vi.fn().mockResolvedValue({ communicationId: 34 });
    await processSchoolScheduleTraining(database, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@itsco.health', templateType: 'school_schedule_training_expiry', text: expect.stringContaining('Michael indicated that we should either renew this one or add a new one for school staff at this time.') }));
    expect(database.execute).toHaveBeenLastCalledWith(expect.stringContaining('SET expiry_communication_id=?'), [34, 3]);
  });
  it.each([false, true])('recovers a prior accepted send without duplicating it (expired=%s)', async expired => {
    const database = workerDb({ expired, existingId: 35 }); const send = vi.fn();
    await processSchoolScheduleTraining(database, send);
    expect(send).not.toHaveBeenCalled();
    expect(database.execute).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE school_schedule_training_campaigns'), [35, 3]);
  });
  it.each([{ skipped: true }, { blocked: true }, { redirected: true, communicationId: 8 }, {}])('retries unaccepted or redirected delivery %j', async result => {
    const database = workerDb(); await processSchoolScheduleTraining(database, vi.fn().mockResolvedValue(result));
    expect(database.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('retains an approval queue receipt without creating more copies', async () => {
    const database = workerDb(); await processSchoolScheduleTraining(database, vi.fn().mockResolvedValue({ queued: true, pendingApproval: true, communicationId: 36 }));
    expect(database.execute).toHaveBeenLastCalledWith(expect.stringContaining('SET launch_communication_id=?'), [36, 3]);
  });
  it('does not declare an interrupted pending delivery sent or create another copy', async () => {
    const database = workerDb({ existingId: 37, existingStatus: 'pending' }); const send = vi.fn();
    expect(await processSchoolScheduleTraining(database, send)).toEqual([{ skipped: 'existing_delivery_pending_review', communicationId: 37 }]);
    expect(send).not.toHaveBeenCalled();
    expect(database.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('records provider acceptance even if the communication logger was unavailable', async () => {
    const database = workerDb(); await processSchoolScheduleTraining(database, vi.fn().mockResolvedValue({ id: 'gmail-123' }));
    expect(database.execute).toHaveBeenLastCalledWith(expect.stringContaining('launch_accepted_at=UTC_TIMESTAMP()'), [null, 3]);
  });
  it('waits for the provider group and retries delivery failures', async () => {
    const send = vi.fn(); expect(await processSchoolScheduleTraining(workerDb({ groupReady: false }), send)).toEqual([{ skipped: 'schoolproviders_group_not_ready' }]);
    expect(send).not.toHaveBeenCalled();
    expect(await processSchoolScheduleTraining(workerDb(), vi.fn().mockRejectedValue(new Error('offline')))).toEqual([{ campaignId: 3, error: 'delivery_failed' }]);
  });
  it('serializes replicas with the existing messaging lock', async () => {
    await runSchoolScheduleTrainingTick();
    expect(effects.lock).toHaveBeenCalledWith('school-schedule-training', expect.any(Function));
  });
  it('does not send from preview or retired revisions', async () => {
    effects.live.mockResolvedValue(false);
    expect(await runSchoolScheduleTrainingTick()).toEqual({ skipped: 'not_live_revision' });
    expect(effects.lock).not.toHaveBeenCalled();
  });
  it('keeps the owner-supplied video link in both emails', () => {
    for (const kind of ['launch', 'expiry']) {
      expect(schoolScheduleTrainingEmail(kind).text).toContain('https://youtu.be/qfVy1Czud2w');
      expect(schoolScheduleTrainingEmail(kind).html).toContain('href="https://youtu.be/qfVy1Czud2w"');
    }
  });
});
