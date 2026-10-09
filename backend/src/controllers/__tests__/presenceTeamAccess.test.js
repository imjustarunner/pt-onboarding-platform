import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ agencies: vi.fn(), roster: vi.fn(), clear: vi.fn(), execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.agencies } }));
vi.mock('../../models/Notification.model.js', () => ({ default: {} }));
vi.mock('../../models/UserPresenceStatus.model.js', () => ({ default: {
  clearExpiredTimedAwayStatuses: mocks.clear,
  findAllWithUsersForAgency: mocks.roster
} }));
vi.mock('../../utils/uploads.js', () => ({ publicUploadsUrlFromStoredPath: () => null }));
vi.mock('../../services/calendarPresence.service.js', () => ({
  attachCalendarBusyToPresenceRows: vi.fn(async rows => rows), getCurrentCalendarBusyForUser: vi.fn()
}));
vi.mock('../../models/PlannedOut.model.js', () => ({ default: {}, isPlannedOutActiveNow: vi.fn() }));
vi.mock('../../services/plannedOutPresence.service.js', () => ({
  attachPlannedOutsToPresenceRows: vi.fn(async rows => rows), plannedOutStatusLabel: vi.fn(),
  availabilityBandFromPlannedOut: vi.fn(), applyPlannedOutPresenceForUser: vi.fn()
}));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: {} }));
import { listPresenceForAgency } from '../presence.controller.js';

const request = role => ({ user: { id: 1, role }, params: { agencyId: '7' } });
const response = () => { const res = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.agencies.mockResolvedValue([{ id: 7 }]);
  mocks.roster.mockResolvedValue([]);
  mocks.clear.mockResolvedValue();
  mocks.execute.mockRejectedValue(new Error('Team Board must not depend on the legacy feature flag'));
});

describe('admin team presence access', () => {
  it.each(['admin', 'support'])('allows assigned %s without a presence feature flag', async role => {
    const res = response(), next = vi.fn();
    await listPresenceForAgency(request(role), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
    expect(mocks.roster).toHaveBeenCalledWith(7);
  });
  it.each(['admin', 'support'])('denies %s access to another tenant', async role => {
    mocks.agencies.mockResolvedValue([{ id: 8 }]);
    const res = response();
    await listPresenceForAgency(request(role), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.roster).not.toHaveBeenCalled();
  });
  it.each(['provider', 'staff', 'school_staff', 'client_guardian'])('does not grant %s board access', async role => {
    const res = response();
    await listPresenceForAgency(request(role), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.roster).not.toHaveBeenCalled();
  });
  it('preserves superadmin access across tenants', async () => {
    const res = response();
    await listPresenceForAgency(request('super_admin'), res, vi.fn());
    expect(mocks.agencies).not.toHaveBeenCalled();
    expect(mocks.roster).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith([]);
  });
});
