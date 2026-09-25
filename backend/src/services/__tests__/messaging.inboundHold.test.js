import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[{ id: 9, role: 'staff', first_name: 'Staff' }]]) } }));
vi.mock('../../models/UserCommunicationContact.model.js', () => ({ default: { isBlocked: vi.fn(async () => false) } }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: async () => ({ holdStaffSchoolOutsideAvailability: true }) }));
vi.mock('../afterHoursEmailPolicy.service.js', () => ({ verifiedAppOnlyProvider: vi.fn() }));
vi.mock('../availabilityWindow.service.js', () => ({ isUserAvailable: vi.fn(async () => ({ available: false, schedule: { enabled: true } })), nextAvailableAt: () => new Date('2026-09-28T13:00:00Z') }));
import pool from '../../config/database.js';
import { verifiedAppOnlyProvider } from '../afterHoursEmailPolicy.service.js';
import { isUserAvailable } from '../availabilityWindow.service.js';
import { classifyInboundSender } from '../senderTrust.service.js';
beforeEach(() => vi.clearAllMocks());
it('keeps SSO inbox delivery immediate outside availability', async () => {
 verifiedAppOnlyProvider.mockResolvedValue(null);
 expect(await classifyInboundSender({ agencyId: 2, ownerUserId: 5, fromEmail: 'staff@itsco.health' })).toMatchObject({ trust: 'staff', holdForAvailability: false, visibleAfter: null });
 expect(isUserAvailable).not.toHaveBeenCalled();
});
it('quietly holds app-only staff mail for the next opening', async () => {
 verifiedAppOnlyProvider.mockResolvedValue({ id: 5 });
 expect(await classifyInboundSender({ agencyId: 2, ownerUserId: 5, fromEmail: 'staff@itsco.health' })).toMatchObject({ trust: 'staff', holdForAvailability: true, visibleAfter: new Date('2026-09-28T13:00:00Z') });
});

it('still holds app-only mail when a sender has a guardian test record', async () => {
 pool.execute.mockResolvedValueOnce([[{ id: 9, role: 'client_guardian', first_name: 'Sender' }]]);
 verifiedAppOnlyProvider.mockResolvedValue({ id: 5 });
 expect(await classifyInboundSender({ agencyId: 2, ownerUserId: 5, fromEmail: 'staff@itsco.health' })).toMatchObject({ trust: 'guardian', holdForAvailability: true });
});
