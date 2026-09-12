import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), listBillingAgencyIds: vi.fn() } }));
import User from '../../models/User.model.js';
import { hasSchedulingBillingAccess, stripSchedulingFinancials } from '../schedulingBillingAccess.service.js';
describe('agency billing permission', () => {
  beforeEach(() => { User.getAgencies.mockResolvedValue([{ id: 1 }, { id: 2 }]); User.listBillingAgencyIds.mockResolvedValue([1]); });
  it('supports delegated providers only in their billing agencies', async () => {
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'provider' }, 1)).toBe(true);
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'provider' }, 2)).toBe(false);
  });
  it('does not grant support blanket financial access', async () => {
    expect(await hasSchedulingBillingAccess({ id: 9, role: 'support' }, 2)).toBe(false);
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
      billing: { paymentStatus: 'none' }, raterKind: 'provider', generatedAt: '2026-09-11', preview: { lines: [{ units: 1 }] } });
  });
});
