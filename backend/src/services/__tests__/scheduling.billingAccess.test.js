import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../managedBillingAccess.service.js', () => ({ isActiveBillingAgency: vi.fn(async () => true) }));
import { isActiveBillingAgency } from '../managedBillingAccess.service.js';
vi.mock('../../utils/independentPracticeOwner.js', () => ({ isIndependentPracticeOwner: vi.fn(async () => false) }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), listBillingAgencyIds: vi.fn() } }));
import User from '../../models/User.model.js';
import { hasSchedulingBillingAccess, stripSchedulingFinancials } from '../schedulingBillingAccess.service.js';
describe('agency billing permission', () => {
  beforeEach(() => { isActiveBillingAgency.mockResolvedValue(true); User.getAgencies.mockResolvedValue([{ id: 1 }, { id: 2 }]); User.listBillingAgencyIds.mockResolvedValue([1]); });
  it('denies providers even with a legacy delegated billing flag', async () => {
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'provider' }, 1)).toBe(false);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'provider' }, 2)).toBe(false);
  });
  it('does not grant support blanket financial access', async () => {
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 2)).toBe(false);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 1)).toBe(true);
  });
  it('requires agency membership for administrators', async () => {
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'admin' }, 3)).toBe(false);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'admin' }, 1)).toBe(true);
  });
  it('honors an explicit managed billing grant without adding clinical membership', async () => {
    User.getAgencies.mockResolvedValue([{ id: 10 }]);
    User.listBillingAgencyIds.mockResolvedValue([1, 3]);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 3)).toBe(true);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 2)).toBe(false);
    User.listBillingAgencyIds.mockResolvedValue([]);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 3)).toBe(false);
  });
  it('rejects an archived agency even for superadmin and stale explicit grants', async () => {
    isActiveBillingAgency.mockResolvedValue(false);
    for (const role of ['super_admin', 'admin', 'support']) expect(await hasSchedulingBillingAccess({ id: 9, role }, 1)).toBe(false);
  });
  it('removes nested pricing while preserving sessions, codes and package quantities', () => {
    const clean = stripSchedulingFinancials({ id: 1, serviceCode: '90834', sessionsRemaining: 2,
      billing: { amountCents: 100, paymentStatus: 'none', notes: '$100 due' }, insurance_outstanding: 400, cancellationFeeCents: 50,
      raterKind: 'provider', generatedAt: '2026-09-11', preview: { lines: [{ unit_price_cents: 75, units: 1 }], feeCents: 50 }, claim_payload: '{"charge":500}' });
    expect(clean).toEqual({ id: 1, serviceCode: '90834', sessionsRemaining: 2,
      raterKind: 'provider', generatedAt: '2026-09-11', preview: { lines: [{ units: 1 }] } });
  });
  it('removes claim links, histories and billing identifiers from clinical responses', () => {
    expect(stripSchedulingFinancials({ note: { id: 7, serviceCode: '90834', linkedClaim: { id: 11, statusLabel: 'Paid' },
      clientPayer: { memberId: 'private' }, billingNpi: '1234567893', claimmd_last_status: 'A',
      artifacts: { claims: [{ id: 11, metadata_json: { balance: 1200 } }], notes: [{ id: 7 }] } } })).toEqual({
      note: { id: 7, serviceCode: '90834', artifacts: { notes: [{ id: 7 }] } }
    });
  });
});

it('requires an explicit billing grant for administrators and support, while preserving superadmin',async()=>{isActiveBillingAgency.mockResolvedValue(true);User.listBillingAgencyIds.mockResolvedValue([]);User.getAgencies.mockResolvedValue([{id:1}]);expect(await hasSchedulingBillingAccess({id:555,role:'admin'},1)).toBe(false);expect(await hasSchedulingBillingAccess({id:555,role:'support'},1)).toBe(false);expect(await hasSchedulingBillingAccess({id:501,role:'super_admin'},1)).toBe(true);User.listBillingAgencyIds.mockResolvedValue([1]);expect(await hasSchedulingBillingAccess({id:559,role:'admin'},1)).toBe(true);});
