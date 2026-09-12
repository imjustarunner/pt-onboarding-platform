import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/TenantService.model.js', () => ({ default: { listForAgency: vi.fn() } }));
vi.mock('../../models/StaffServiceAssignment.model.js', () => ({ default: { listServiceIdsForUser: vi.fn() } }));
vi.mock('../practiceCategories.service.js', () => ({ resolveEffectivePracticeCategories: vi.fn(), serviceBusinessTypesForCategories: categories => categories }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import TenantService from '../../models/TenantService.model.js';
import StaffServiceAssignment from '../../models/StaffServiceAssignment.model.js';
import { resolveEffectivePracticeCategories } from '../practiceCategories.service.js';
import { assertSelfPayRateAccess, eligibleSelfPayServices, validateSelfPayRate, calculateSelfPayQuote, resolveSelfPayQuote, saveSelfPayRates } from '../selfPayRates.service.js';
describe('self-pay rate configuration and quoting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.getAgencies.mockResolvedValue([{ id: 1 }]);
    TenantService.listForAgency.mockResolvedValue([{ id: 10, businessType: 'mental_health' }, { id: 11, businessType: 'tutoring' }]);
    StaffServiceAssignment.listServiceIdsForUser.mockResolvedValue([]);
    resolveEffectivePracticeCategories.mockResolvedValue({ categories: ['mental_health'], sources: { mental_health: 'grant' } });
  });
  it.each(['provider', 'provider_plus', 'support', 'staff', 'assistant_admin', 'backoffice_admin'])('rejects %s even with a billing grant', async role => {
    await expect(assertSelfPayRateAccess({ id: 9, role, billingAgencyIds: [1] }, 1, 8)).rejects.toMatchObject({ status: 403 });
    expect(User.getAgencies).not.toHaveBeenCalled();
  });
  it('checks actor and target agency independently', async () => {
    await expect(assertSelfPayRateAccess({ id: 9, role: 'admin' }, 1, 8)).resolves.toBeUndefined();
    User.getAgencies.mockResolvedValueOnce([{ id: 2 }]);
    await expect(assertSelfPayRateAccess({ id: 9, role: 'admin' }, 1, 8)).rejects.toMatchObject({ status: 403 });
    User.getAgencies.mockResolvedValueOnce([{ id: 2 }]);
    await expect(assertSelfPayRateAccess({ id: 9, role: 'super_admin' }, 1, 8)).rejects.toMatchObject({ status: 403 });
  });
  it('filters counselors to counseling and honors explicit service assignments', async () => {
    expect((await eligibleSelfPayServices(1, 8)).map(s => s.id)).toEqual([10]);
    StaffServiceAssignment.listServiceIdsForUser.mockResolvedValue([11]);
    expect(await eligibleSelfPayServices(1, 8)).toEqual([]);
    expect((await eligibleSelfPayServices(1)).map(s => s.id)).toEqual([10, 11]);
  });
  it('does not expose all categories through legacy provider fallback', async () => {
    resolveEffectivePracticeCategories.mockResolvedValue({ categories: ['mental_health', 'tutoring'], sources: { mental_health: 'none', tutoring: 'none' } });
    expect(await eligibleSelfPayServices(1, 8)).toEqual([]);
  });
  it('distinguishes free service from inheritance and rejects fractional cents', () => {
    expect(validateSelfPayRate({ serviceId: 10, rateCents: 0, rateUnit: 'hour' }).rateCents).toBe(0);
    expect(validateSelfPayRate({ serviceId: 10, rateCents: null }).rateCents).toBeNull();
    for (const rateCents of [-1, 1.5, '12000', NaN]) expect(() => validateSelfPayRate({ serviceId: 10, rateCents, rateUnit: 'hour' })).toThrow();
  });
  it('prorates hourly rates and retains flat session prices', () => {
    expect(calculateSelfPayQuote({ rateCents: 12500, rateUnit: 'hour', durationMinutes: 50 })).toBe(10417);
    expect(calculateSelfPayQuote({ rateCents: 12500, rateUnit: 'session', durationMinutes: 50 })).toBe(12500);
    expect(calculateSelfPayQuote({ rateCents: 0, durationMinutes: 50 })).toBe(0);
  });
  it('uses provider, agency, then catalog fallback without treating zero as missing', async () => {
    const args = { agencyId: 1, providerId: 8, service: { id: 10, priceCents: 7000 }, durationMinutes: 90 };
    pool.execute.mockResolvedValueOnce([[{ rate_cents: 0, rate_unit: 'hour', provider_user_id: 8 }, { rate_cents: 10000, rate_unit: 'session', provider_user_id: 0 }]]);
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 0, source: 'provider' });
    pool.execute.mockResolvedValueOnce([[{ rate_cents: 10000, rate_unit: 'hour', provider_user_id: 0 }]]);
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 15000, source: 'agency' });
    pool.execute.mockResolvedValueOnce([[]]);
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 7000, source: 'catalog' });
  });
  it('rolls back the entire rate sheet when persistence fails', async () => {
    const conn = { beginTransaction: vi.fn(), execute: vi.fn().mockRejectedValue(new Error('Storage unavailable')), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    pool.getConnection.mockResolvedValue(conn);
    await expect(saveSelfPayRates({ agencyId: 1, providerId: 8, actorUserId: 9, rows: [{ serviceId: 10, rateCents: 12000, rateUnit: 'session' }] })).rejects.toThrow('Storage unavailable');
    expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.commit).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledOnce();
  });
  it('rejects wrong-category writes before changing any rates', async () => {
    await expect(saveSelfPayRates({ agencyId: 1, providerId: 8, actorUserId: 9, rows: [{ serviceId: 11, rateCents: 10000, rateUnit: 'session' }] })).rejects.toMatchObject({ status: 403 });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
