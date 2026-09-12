import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/BookingPackage.model.js', () => ({ default: { findEntitlementById: vi.fn(), findById: vi.fn() } }));
vi.mock('../../models/BookingCancellationPolicy.model.js', () => ({ default: { listForAgency: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../../models/TenantService.model.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
import BookingPackage from '../../models/BookingPackage.model.js';
import Policy from '../../models/BookingCancellationPolicy.model.js';
import { resolvePolicyForAppointmentContext } from '../bookingCancellationPolicy.service.js';
const resolve = (extras = {}) => resolvePolicyForAppointmentContext({ agencyId: 1, packageEntitlementId: 2, ...extras });
beforeEach(() => {
  vi.clearAllMocks(); BookingPackage.findEntitlementById.mockResolvedValue({ packageId: 3, businessType: 'tutoring' });
  BookingPackage.findById.mockResolvedValue({ name: 'Tutoring', policies: { cancellationNoticeHours: 12, lateCancelPolicy: 'forfeit', noShowPolicy: 'forfeit' } });
  Policy.listForAgency.mockResolvedValue([{ id: 5, scopeLevel: 'tenant', latePackageAction: 'release' }]);
});
describe('package cancellation policy configuration', () => {
  it('uses package terms before a less-specific agency default', async () => {
    expect((await resolve()).policy).toMatchObject({ noticeHours: 12, latePackageAction: 'forfeit', noShowPackageAction: 'forfeit' });
  });
  it('preserves an explicit appointment override', async () => {
    Policy.listForAgency.mockResolvedValue([{ id: 9, scopeLevel: 'appointment', latePackageAction: 'release' }]);
    expect((await resolve({ cancellationPolicyId: 9 })).policy.id).toBe(9);
  });
  it('retains the session credit for a free-rebook policy', async () => {
    BookingPackage.findById.mockResolvedValue({ policies: { lateCancelPolicy: 'free_rebook', noShowPolicy: 'free_rebook' } });
    expect((await resolve()).policy).toMatchObject({ latePackageAction: 'release', noShowPackageAction: 'release' });
  });
  it('charges the configured fee while retaining package credit', async () => {
    BookingPackage.findById.mockResolvedValue({ policies: { lateCancelPolicy: 'fee', noShowPolicy: 'fee', missedFeeCents: 2500 } });
    expect((await resolve()).policy).toMatchObject({ latePackageAction: 'release', lateFeeCents: 2500, noShowFeeCents: 2500 });
  });
});
