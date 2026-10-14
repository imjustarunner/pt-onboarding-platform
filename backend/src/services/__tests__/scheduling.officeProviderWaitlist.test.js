import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), update: vi.fn(), lifecycle: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Client.model.js', () => ({ default: { update: mocks.update } }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: {} }));
vi.mock('../../models/TherapyEnrollmentUnit.model.js', () => ({ default: {} }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../clientLifecycleStatus.service.js', () => ({ setClientLifecycleStatus: mocks.lifecycle, LIFECYCLE_STATUS_KEYS: { WAITLIST: 'waitlist', READY_TO_SCHEDULE: 'ready_to_schedule' } }));
vi.mock('../clientExchange.service.js', () => ({ listPendingOfficeClients: vi.fn() }));
import { setOfficeClientWaitlist } from '../officeClientManagement.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('staff provider waitlist updates', () => {
  it.each([
    [{ waitlist: { active: false, providerId: 8, source: 'public_provider_selection', resolution: 'provider_assigned' } }, {}, 8],
    [{}, { preferredProviderUserId: 9 }, 9],
    [{ preferred_office_provider_ids: ['10'] }, {}, 10]
  ])('keeps the explicit desired provider when staff adds a person to the waitlist', async (prefs, meta, providerId) => {
    mocks.execute.mockResolvedValue([[{ id: 30, agency_id: 2, client_type: 'clinical', intake_preferences_json: prefs, adaptive_intake_meta_json: meta }]]);
    await setOfficeClientWaitlist({ agencyId: 2, clientId: 30, actorUserId: 4 });
    const updated = JSON.parse(mocks.update.mock.calls[0][1].intake_preferences_json);
    expect(updated.waitlist).toMatchObject({ active: true, providerId, source: prefs.waitlist?.source || 'staff' });
    expect(mocks.lifecycle).toHaveBeenCalledWith(expect.objectContaining({ clientId: 30, statusKey: 'waitlist' }));
  });
  it('keeps a general waitlist unassigned instead of inventing a provider', async () => {
    mocks.execute.mockResolvedValue([[{ id: 30, agency_id: 2, client_type: 'clinical', intake_preferences_json: {} }]]);
    await setOfficeClientWaitlist({ agencyId: 2, clientId: 30, actorUserId: 4 });
    expect(JSON.parse(mocks.update.mock.calls[0][1].intake_preferences_json).waitlist.providerId).toBeNull();
  });
});
