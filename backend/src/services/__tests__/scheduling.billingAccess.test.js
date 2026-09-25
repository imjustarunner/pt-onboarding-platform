import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/independentPracticeOwner.js', () => ({ isIndependentPracticeOwner: vi.fn(async () => false) }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), listBillingAgencyIds: vi.fn() } }));
import User from '../../models/User.model.js';
import { hasSchedulingBillingAccess, stripSchedulingFinancials } from '../schedulingBillingAccess.service.js';
describe('agency billing permission', () => {
  beforeEach(() => { User.getAgencies.mockResolvedValue([{ id: 1 }, { id: 2 }]); User.listBillingAgencyIds.mockResolvedValue([1]); });
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
