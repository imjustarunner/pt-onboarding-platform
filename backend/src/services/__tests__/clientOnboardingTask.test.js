import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), complete: vi.fn(), update: vi.fn(), create: vi.fn(), find: vi.fn(), audit: vi.fn(), disposition: vi.fn(), weekday: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Task.model.js', () => ({ default: { markComplete: mocks.complete, updateCustomTask: mocks.update, create: mocks.create, findById: mocks.find } }));
vi.mock('../../models/TaskAuditLog.model.js', () => ({ default: { logAction: mocks.audit } }));
vi.mock('../clientYearDisposition.service.js', () => ({ getDisposition: mocks.disposition }));
vi.mock('../clientLifecycleStatus.service.js', () => ({ clientHasWeekdayAssignment: mocks.weekday }));

import { syncClientProviderLifecycleTasks } from '../clientOnboardingTask.service.js';

let client, assignments, tasks;
const legacyTask = (id, owner) => ({ id, assigned_to_user_id: owner, title: 'New client on your caseload: Synthetic', status: 'pending', metadata: { source: 'client_assignment', clientId: 101 } });

describe('provider lifecycle task reconciliation', () => {
  beforeEach(() => {
    vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    client = { id: 101, agency_id: 2, client_type: 'school', status: 'ACTIVE', client_status_key: 'scheduled',
      school_year: '2026-2027', created_at: '2026-09-01', provider_id: 20, service_day: 'Monday', initials: 'Synthetic' };
    assignments = [20];tasks = [legacyTask(1, 20)];
    mocks.disposition.mockResolvedValue(null);mocks.weekday.mockResolvedValue(true);
    mocks.complete.mockResolvedValue({});mocks.update.mockResolvedValue({});mocks.create.mockResolvedValue({ id: 50 });mocks.find.mockResolvedValue({ id: 1 });mocks.audit.mockResolvedValue({});
    mocks.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM clients c')) {
        expect(sql).toContain('c.status');expect(sql).toContain('c.staff_onboarding_completed_at');
        return [[client]];
      }
      if (sql.includes('SELECT DISTINCT provider_user_id')) return [assignments.map(id => ({ provider_user_id: id }))];
      if (sql.includes('SELECT DISTINCT assigned_to_user_id')) return [tasks.map(t => ({ assigned_to_user_id: t.assigned_to_user_id }))];
      if (sql.includes('SELECT id, title, metadata, status')) return [tasks.filter(t => t.assigned_to_user_id === params[0])];
      if (sql.includes('SELECT service_day')) return [[{ service_day: 'Monday' }]];
      throw new Error(`Unexpected query: ${sql}`);
    });
  });
  afterEach(() => vi.useRealTimers());

  it('retires a legacy task for a provider who no longer has the assignment', async () => {
    tasks = [legacyTask(1, 10)];
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [10], actorUserId: 9 });
    expect(mocks.complete).toHaveBeenCalledWith(1, 9);
    expect(mocks.update).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
  });

  it('retains a required new-client task for the current provider', async () => {
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [20] });
    expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({ metadata: expect.objectContaining({ actionKey: 'provider_intake' }) }));
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each([{ status: 'ARCHIVED' }, { client_status_key: 'archived' }, { client_status_key: 'terminated' }])('retires tasks for a closed client: %j', async (fields) => {
    Object.assign(client, fields);
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [20] });
    expect(mocks.complete).toHaveBeenCalledWith(1, 20);expect(mocks.update).not.toHaveBeenCalled();
  });

  it('retires old-assignee tasks and preserves current-assignee work in the same sync', async () => {
    tasks = [legacyTask(1, 10), legacyTask(2, 20)];
    client.provider_id = 10; // stale legacy column must not override the active assignment
    await syncClientProviderLifecycleTasks({ clientId: 101, actorUserId: 9 });
    expect(mocks.complete).toHaveBeenCalledWith(1, 9);
    expect(mocks.complete).not.toHaveBeenCalledWith(2, expect.anything());
    expect(mocks.update).toHaveBeenCalledWith(2, expect.anything());
  });

  it('does not auto-complete unrelated custom work carrying a client ID', async () => {
    tasks = [{ id: 3, assigned_to_user_id: 10, title: 'Prepare school meeting', metadata: { clientId: 101, source: 'momentum_user_request', actionKey: 'custom_followup' } }];
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [10] });
    expect(mocks.complete).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
  });

  it('closes a service-confirmation task when this year has already been confirmed', async () => {
    Object.assign(client, { client_status_key: 'being_seen', staff_onboarding_completed_at: '2026-04-01', services_started_at: '2026-09-24' });
    tasks[0].metadata = { source: 'client_lifecycle', clientId: 101, actionKey: 'confirm_services_started' };
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [20] });
    expect(mocks.complete).toHaveBeenCalledWith(1, 20);expect(mocks.update).not.toHaveBeenCalled();
  });

  it('preserves legacy-only provider assignments when no assignment rows exist', async () => {
    assignments = [];
    await syncClientProviderLifecycleTasks({ clientId: 101, providerUserIds: [20] });
    expect(mocks.update).toHaveBeenCalledWith(1, expect.anything());expect(mocks.complete).not.toHaveBeenCalled();
  });
});
