import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), set: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../clientLifecycleStatus.service.js', () => ({ setClientLifecycleStatus: mocks.set }));
import Promotion from '../clientCompliancePromotion.service.js';
const now = new Date('2026-10-05T12:00:00Z');
describe('school service reconciliation', () => {
  let client;
  beforeEach(() => {
    vi.resetAllMocks();
    client = { id: 1, agency_id: 2, client_type: 'school', client_status_key: 'ready_to_schedule', created_at: '2025-01-01', services_started_at: '2026-09-15' };
    mocks.execute.mockImplementation(async () => [[client]]);
    mocks.set.mockResolvedValue({ changed: true });
  });
  it('audits a confirmed returner without intake or weekday without writes', async () => {
    const result = await Promotion.run({ now, dryRun: true });
    expect(result.candidates).toHaveLength(1); expect(mocks.set).not.toHaveBeenCalled();
  });
  it('repairs status through the history and task-sync engine without replacing dates', async () => {
    expect((await Promotion.run({ now })).promoted).toBe(1);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ clientId: 1, statusKey: 'being_seen' }));
    expect(mocks.set.mock.calls[0][0]).not.toHaveProperty('extraPatch');
  });
  it('does not promote last-year service evidence', async () => {
    client.services_started_at = '2026-02-01'; client.first_service_at = '2026-02-01';
    expect((await Promotion.run({ now })).promoted).toBe(0); expect(mocks.set).not.toHaveBeenCalled();
  });
  it('does not reopen a client archived during reconciliation', async () => {
    mocks.execute.mockResolvedValueOnce([[client]]).mockResolvedValueOnce([[{ ...client, status: 'ARCHIVED' }]]);
    expect((await Promotion.run({ now })).promoted).toBe(0); expect(mocks.set).not.toHaveBeenCalled();
  });
});
