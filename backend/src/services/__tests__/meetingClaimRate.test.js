import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), tx: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), context: vi.fn(), rate: vi.fn(), card: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => ({ execute: m.tx, beginTransaction: m.begin, commit: m.commit, rollback: m.rollback, release: m.release }) } }));
vi.mock('../paySystem.service.js', () => ({ loadUserPaySystemContext: m.context }));
vi.mock('../../models/PayrollRate.model.js', () => ({ default: { findBestRate: m.rate } }));
vi.mock('../../models/PayrollRateCard.model.js', () => ({ default: { findForUser: m.card } }));
import { meetingClaimHourlyRate, meetingClaimCompensation, saveMeetingClaimRate } from '../meetingClaimRate.service.js';
const claim = { id: 611, agency_id: 2, user_id: 465, claim_type: 'meeting_training', claim_date: '2026-10-06', status: 'submitted', payload: { source: 'meeting_compensation_auto', scheduleEventId: 339, serviceCode: 'MEETING', totalMinutes: 30 } };
const edit = { actor: { id: 501, role: 'super_admin' }, event: { id: 339, agency_id: 2 }, claimId: 611, rateType: 'custom', hourlyRate: 32, reason: 'Agreed office duties' };
beforeEach(() => {
  vi.clearAllMocks();
  m.execute.mockResolvedValue([[]]);
  m.context.mockResolvedValue({ enabled: false });
  m.rate.mockResolvedValue({ rate_amount: 20 });
  m.tx.mockImplementation(async sql => sql.includes('FOR UPDATE') ? [[{ ...claim, payload_json: claim.payload }]] : [[]]);
});
it('uses the legacy rate on the service date before pay-system activation', async () => {
  expect(await meetingClaimHourlyRate(claim)).toBe(20);
  expect(m.rate).toHaveBeenCalledWith({ agencyId: 2, userId: 465, serviceCode: 'MEETING', asOf: '2026-10-06' });
});
it('uses new Support Activity and minimum-workload rates after activation', async () => {
  m.context.mockResolvedValue({ enabled: true, status: { useReducedRates: true }, rateProfile: { supportActivityRate: 22, supportActivityRateProbation: 18 } });
  expect(await meetingClaimHourlyRate(claim)).toBe(18);
  expect(m.rate).not.toHaveBeenCalled();
});
it('resolves assigned administrative pay and holds missing assigned rates for review', async () => {
  m.context.mockResolvedValue({ enabled: true, rateProfile: { roleCompensation: { cpa: { adminRate: 25 } } } });
  expect(await meetingClaimHourlyRate(claim, { rate_type: 'admin_time' })).toBe(25);
  m.context.mockResolvedValue({ enabled: true, rateProfile: {} });
  expect(await meetingClaimHourlyRate(claim, { rate_type: 'admin_time' })).toBeNull();
  expect(m.rate).not.toHaveBeenCalled();
});
it('uses only the stored server override, ignoring a custom rate in employee payload', async () => {
  expect(await meetingClaimHourlyRate({ ...claim, payload: { ...claim.payload, hourlyRate: 999 } })).toBe(20);
  m.execute.mockResolvedValue([[{ rate_type: 'custom', hourly_rate: '35.50', reason: 'Special duties' }]]);
  expect(await meetingClaimCompensation(claim)).toMatchObject({ hourlyRate: 35.5, estimatedAmount: 17.75, rateLabel: 'Custom hourly rate', reason: 'Special duties' });
});
it.each(['provider', 'staff', 'payroll'])('does not let %s change compensation', async role => {
  await expect(saveMeetingClaimRate({ ...edit, actor: { id: 1, role } })).rejects.toMatchObject({ status: 403 });
  expect(m.begin).not.toHaveBeenCalled();
});
it.each(['approved', 'paid'])('locks %s claims without changing money or status', async status => {
  m.tx.mockResolvedValue([[{ ...claim, status, payload_json: claim.payload }]]);
  await expect(saveMeetingClaimRate(edit)).rejects.toMatchObject({ status: 409 });
  expect(m.commit).not.toHaveBeenCalled(); expect(m.rollback).toHaveBeenCalled();
  expect(m.tx.mock.calls.some(([sql]) => sql.startsWith('UPDATE') || sql.startsWith('INSERT'))).toBe(false);
});
it('rejects a claim belonging to another meeting', async () => {
  m.tx.mockResolvedValue([[{ ...claim, payload_json: { ...claim.payload, scheduleEventId: 340 } }]]);
  await expect(saveMeetingClaimRate(edit)).rejects.toMatchObject({ status: 400 });
});
it.each([0, -5, Infinity, 'nonsense', 10001])('rejects invalid custom rate %s', async hourlyRate => {
  await expect(saveMeetingClaimRate({ ...edit, hourlyRate })).rejects.toMatchObject({ status: 400 });
});
it('requires an adjustment reason', async () => {
  await expect(saveMeetingClaimRate({ ...edit, reason: ' ' })).rejects.toMatchObject({ status: 400 });
});
it('saves an auditable claim-only override and resubmits it for payroll review', async () => {
  await saveMeetingClaimRate(edit);
  const insert = m.tx.mock.calls.find(([sql]) => sql.includes('INSERT INTO meeting_claim_rate_overrides'));
  expect(insert[1].slice(0, 7)).toEqual([611, 2, 465, 'custom', 32, 'Agreed office duties', 501]);
  expect(JSON.parse(insert[1][7])).toEqual([expect.objectContaining({ actorUserId: 501, hourlyRate: 32, rateType: 'custom' })]);
  expect(m.tx.mock.calls.some(([sql]) => sql.includes("SET status='submitted'"))).toBe(true);
  expect(m.commit).toHaveBeenCalled(); expect(m.release).toHaveBeenCalled();
});
it('preserves the change history when resetting to the meeting default', async () => {
  m.tx.mockImplementation(async sql => sql.includes('FOR UPDATE') ? [[{ ...claim, payload_json: claim.payload }]] : sql.includes('SELECT history_json') ? [[{ history_json: [{ rateType: 'custom', hourlyRate: 32 }] }]] : [[]]);
  await saveMeetingClaimRate({ ...edit, rateType: 'default' });
  const insert = m.tx.mock.calls.find(([sql]) => sql.includes('INSERT INTO meeting_claim_rate_overrides'));
  expect(insert[1][3]).toBe('default'); expect(JSON.parse(insert[1][7])).toHaveLength(2);
});
it('uses the assigned Administrative time rate and exposes the training override reason',async()=>{
 const adjusted={...claim,payload:{...claim.payload,serviceCode:'Admin Time',trainingCompensationOverride:{rateType:'admin_time',reason:'Leadership meeting',authorizedByUserId:501}}};
 m.context.mockResolvedValue({enabled:true,rateProfile:{roleCompensation:{cpa:{adminRate:28}}}});
 expect(await meetingClaimCompensation(adjusted)).toMatchObject({rateType:'default',rateLabel:'Administrative time (training override)',hourlyRate:28,estimatedAmount:14,reason:'Leadership meeting'});
 m.execute.mockResolvedValue([[{rate_type:'custom',hourly_rate:30,reason:'Payroll correction'}]]);
 expect(await meetingClaimCompensation(adjusted)).toMatchObject({rateType:'custom',hourlyRate:30,estimatedAmount:15,reason:'Payroll correction'});
});
