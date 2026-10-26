import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), mileageList: vi.fn(), timeList: vi.fn(), findClaim: vi.fn(), update: vi.fn(), period: vi.fn(), parent: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: m.parent } }));
vi.mock('../../models/PayrollMileageClaim.model.js', () => ({ default: { listForAgency: m.mileageList } }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { listForAgency: m.timeList, findById: m.findClaim, updateApproved: m.update } }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: m.period } }));
import { listMileageClaims, listTimeClaims, patchTimeClaim, getPendingSubmissionsSummary } from '../payroll.controller.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const req = () => ({ query: { agencyId: '9', status: 'approved', unpostedOnly: 'true', limit: '200', offset: '200' }, user: { id: 1, role: 'admin' } });
beforeEach(() => {
  vi.clearAllMocks();
  m.execute.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id, organization_type')) return [[{ id: 9, organization_type: 'program' }]];
    if (sql.includes('SELECT has_payroll_access')) return [[{ has_payroll_access: 1 }]];
    return [[]];
  });
  m.parent.mockResolvedValue(2);
  m.mileageList.mockResolvedValue([]); m.timeList.mockResolvedValue([]);
  m.findClaim.mockResolvedValue({ id: 11, agency_id: 2, user_id: 7, status: 'approved', target_payroll_period_id: 8, applied_amount: 20, credits_hours: 1, payload: {} });
  m.period.mockResolvedValue({ id: 8, agency_id: 2, status: 'draft' });
  m.update.mockResolvedValue({ id: 11 });
});
describe('approved submission API', () => {
  it.each([[listMileageClaims, m.mileageList], [listTimeClaims, m.timeList]])('lists approved claims using the authorized parent agency and requested page', async (handler, list) => {
    const res = response(), next = vi.fn();
    await handler(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, status: 'approved', unpostedOnly: true, limit: '200', offset: '200' }));
    expect(res.json).toHaveBeenCalledWith([]);
  });
  it('keeps the payroll permission boundary when a child organization is selected', async () => {
    m.execute.mockImplementation(async sql => sql.startsWith('SELECT id, organization_type') ? [[{ id: 9, organization_type: 'program' }]] : [[]]);
    const res = response(); await listMileageClaims(req(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(m.mileageList).not.toHaveBeenCalled();
  });
  it.each(['posted', 'finalized'])('refuses changes to a claim after the period becomes %s', async status => {
    m.period.mockResolvedValue({ id: 8, agency_id: 2, status });
    const res = response(); await patchTimeClaim({ ...req(), params: { id: '11' }, body: { action: 'update', bucket: 'direct', creditsHours: 2, rateAmount: 65 } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409); expect(m.update).not.toHaveBeenCalled();
  });
  it('protects posted metadata even when a stale status says ran', async () => {
    m.period.mockResolvedValue({ id: 8, status: 'ran', posted_at: '2026-10-24' });
    const res = response(); await patchTimeClaim({ ...req(), params: { id: '11' }, body: { action: 'unapprove' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it('persists the chosen bucket, rate and recalculated dollars for an unposted period', async () => {
    const res = response(), next = vi.fn();
    await patchTimeClaim({ ...req(), params: { id: '11' }, body: { action: 'update', bucket: 'direct', creditsHours: 2, rateKey: 'comp_99415', rateAmount: 65, rateLabel: 'Individual Supervision Rate' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'direct', creditsHours: 2, appliedAmount: 130, payload: expect.objectContaining({ payRateKey: 'comp_99415', payRateAmount: 65 }) }));
  });
  it('does not include retired MedCancel submissions in pending counts', async () => {
    const res = response(); await getPendingSubmissionsSummary(req(), res, vi.fn());
    expect(m.execute.mock.calls.some(([sql]) => sql.includes('payroll_medcancel_claims'))).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 0 }));
  });
});
