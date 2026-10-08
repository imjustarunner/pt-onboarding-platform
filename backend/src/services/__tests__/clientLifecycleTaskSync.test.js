import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), update: vi.fn(), history: vi.fn(), statusId: vi.fn(), sync: vi.fn(), queue: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Client.model.js', () => ({ default: { update: mocks.update } }));
vi.mock('../../models/ClientStatusHistory.model.js', () => ({ default: { create: mocks.history } }));
vi.mock('../../utils/clientStatusCatalog.js', () => ({ getClientStatusIdByKey: mocks.statusId }));
vi.mock('../clientOnboardingTask.service.js', () => ({ syncClientProviderLifecycleTasks: mocks.sync }));
vi.mock('../schoolClientStatusEmail.service.js', () => ({ queueSchoolClientStatusEmails: mocks.queue }));

import { markClientBeingSeen, setClientLifecycleStatus } from '../clientLifecycleStatus.service.js';

describe('service confirmation reconciles existing provider tasks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValue([[{ id: 101, agency_id: 2, client_status_id: 8, client_status_key: 'being_seen' }]]);
    mocks.statusId.mockResolvedValue(8);
    mocks.update.mockResolvedValue({});mocks.history.mockResolvedValue({});mocks.sync.mockResolvedValue({});mocks.queue.mockResolvedValue({});
  });

  it('clears a returning-service task after reconfirmation without requiring a status change', async () => {
    const result = await markClientBeingSeen({ clientId: 101, actorUserId: 9, serviceDate: '2026-09-25' });
    expect(result.changed).toBe(false);
    expect(mocks.update).toHaveBeenCalledWith(101, expect.objectContaining({ services_started_at: '2026-09-25' }), 9);
    expect(mocks.sync).toHaveBeenCalledWith({ clientId: 101, actorUserId: 9 });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), {clientId:101});
  });

  it('reconciles tasks on an idempotent retry without rewriting service dates', async () => {
    await setClientLifecycleStatus({ clientId: 101, statusKey: 'being_seen', actorUserId: 9 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('still syncs after a real status transition and records that transition once', async () => {
    mocks.execute.mockResolvedValue([[{ id: 101, agency_id: 2, client_status_id: 7, client_status_key: 'scheduled' }]]);
    const result = await markClientBeingSeen({ clientId: 101, actorUserId: 9, serviceDate: '2026-09-25' });
    expect(result.changed).toBe(true);
    expect(mocks.history).toHaveBeenCalledOnce();expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({assignmentChanged:true}));
  });

  it('does not sync or reopen a terminal client when service confirmation is rejected', async () => {
    mocks.execute.mockResolvedValue([[{ id: 101, client_status_key: 'archived' }]]);
    const result = await markClientBeingSeen({ clientId: 101, actorUserId: 9 });
    expect(result.skipped).toBe('terminal');expect(mocks.update).not.toHaveBeenCalled();expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('prevents a later readiness write from undoing confirmed services', async () => {
    mocks.execute.mockResolvedValue([[{ id: 101, agency_id: 2, client_status_id: 8, client_status_key: 'being_seen', client_type: 'school', services_started_at: new Date().toISOString().slice(0, 10) }]]);
    const result = await setClientLifecycleStatus({ clientId: 101, statusKey: 'ready_to_schedule', actorUserId: 9 });
    expect(result.statusKey).toBe('being_seen');
    expect(mocks.statusId).toHaveBeenCalledWith({ agencyId: 2, statusKey: 'being_seen' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires agency review before reopening a waitlisted client', async () => {
    mocks.execute.mockResolvedValue([[{ id: 101, client_status_key: 'waitlist' }]]);
    const result = await markClientBeingSeen({ clientId: 101, actorUserId: 9 });
    expect(result.skipped).toBe('agency_review_required');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
