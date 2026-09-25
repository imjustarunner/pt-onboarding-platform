import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), create: vi.fn(), derive: vi.fn(), disposition: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Task.model.js', () => ({ default: { create: m.create } }));
vi.mock('../../models/TaskAuditLog.model.js', () => ({ default: { logAction: async () => {} } }));
vi.mock('../../utils/clientLifecycleAction.js', () => ({ deriveLifecycleAction: m.derive }));
vi.mock('../clientYearDisposition.service.js', () => ({ getDisposition: m.disposition }));
vi.mock('../clientLifecycleStatus.service.js', () => ({ clientHasWeekdayAssignment: async () => false }));
import { syncClientProviderLifecycleTasks } from '../clientOnboardingTask.service.js';
beforeEach(() => {
 vi.clearAllMocks();
 m.create.mockResolvedValue({ id: 99 });
 m.derive.mockReturnValue({ actionKey: 'provider_intake', label: 'Intake' });
 m.disposition.mockResolvedValue({ agency_clearance_json: { agencyCleared: true }, fall_outcome: 'confirmed_returning' });
 m.execute.mockImplementation(async sql => {
   if (/\bc\.(first_name|last_name|agency_clearance_json)\b/.test(sql)) throw Object.assign(new Error('Unknown client column'), { code: 'ER_BAD_FIELD_ERROR' });
   if (sql.includes('FROM clients c')) return [[{ id: 1, agency_id: 2, provider_id: 5, full_name: 'Test Client', client_type: 'school', client_status_key: 'ready_to_schedule' }]];
   return [[]];
 });
});
it('creates the provider workflow using the deployed client schema and yearly clearance', async () => {
 expect(await syncClientProviderLifecycleTasks({ clientId: 1, providerUserIds: [5] })).toEqual({ synced: 1, clientLabel: 'Test Client' });
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ assignedToUserId: 5, title: 'New client on your caseload: Test Client' }));
 expect(m.derive).toHaveBeenCalledWith(expect.objectContaining({ disposition: expect.objectContaining({ agency_clearance_json: { agencyCleared: true } }) }));
});
it('does not create a workflow when the client no longer exists', async () => {
 m.execute.mockResolvedValue([[]]);
 expect(await syncClientProviderLifecycleTasks({ clientId: 1, providerUserIds: [5] })).toEqual({ synced: 0 });
 expect(m.create).not.toHaveBeenCalled();
});
