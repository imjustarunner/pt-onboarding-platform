import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PayrollPendingSubmissions from '../PayrollPendingSubmissionsView.vue';
import { mileageEstimate, mileageBillableMiles, approvedTimeDraft } from '../../../utils/payrollSubmissionReview';
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), route: { query: { tab: 'mileage' }, params: {}, path: '/admin/payroll/pending' }, agency: { currentAgency: { id: 2, name: 'Test Agency' } } }));
vi.mock('../../../services/api', () => ({ default: mock }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mock.agency }));
vi.mock('vue-router', () => ({ useRoute: () => mock.route, useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() }) }));
const period = { id: 8, period_start: '2026-10-10', period_end: '2026-10-23', status: 'staged', schedule_aligned: 1 };
const mileage = { id: 10, user_id: 7, claim_type: 'school_travel', drive_date: '2026-10-16', miles: 8.41, eligible_miles: 8.41, tier_level: 2, status: 'submitted' };
const time = { id: 11, user_id: 7, claim_type: 'indirect_time', claim_date: '2026-10-16', status: 'approved', bucket: 'indirect', credits_hours: 1, applied_amount: 20, target_payroll_period_id: 8, payload: { supervisionSessionId: 99, sessionType: 'individual', totalMinutes: 60 }, payEstimate: { rateLabel: 'Support Activity Rate', availableRates: [{ key: 'direct', label: 'Direct Rate', amount: 65, unit: 'hour' }, { key: 'support', label: 'Support Activity Rate', amount: 20, unit: 'hour' }] } };
let rows, times, posted, failReimbursement, failPeriods, wrappers;
beforeEach(() => {
  vi.clearAllMocks(); wrappers = []; mock.route.query = { tab: 'mileage' };
  rows = [structuredClone(mileage)]; times = [structuredClone(time)]; posted = false; failReimbursement = false; failPeriods = false;
  mock.post.mockResolvedValue({ data: {} });
  mock.get.mockImplementation(async (url, { params } = {}) => {
    if (url === '/payroll/periods' && failPeriods) throw { response: { status: 403, data: { error: { message: 'Payroll access required' } } } };
    if (url === '/payroll/periods') return { data: [{ ...period, status: posted ? 'posted' : 'staged' }] };
    if (url === '/payroll/agency-users') return { data: [{ id: 7, first_name: 'Test', last_name: 'Provider' }] };
    if (url === '/payroll/mileage-rates') return { data: { rates: [{ tierLevel: 1, ratePerMile: 0.6 }, { tierLevel: 2, ratePerMile: 0.35 }, { tierLevel: 3, ratePerMile: 0.2 }], settings: {} } };
    if (url === '/payroll/event-time-submissions') return { data: { submissions: [] } };
    if (url === '/payroll/mileage-claims' || url === '/payroll/time-claims') {
      const source = url.includes('mileage') ? rows : times;
      return { data: source.filter(c => c.status === params.status && !(params.unpostedOnly && posted)).slice(params.offset, params.offset + params.limit) };
    }
    if (url === '/payroll/reimbursement-claims' && failReimbursement) throw { response: { status: 403, data: { error: { message: 'Payroll access required' } } } };
    return { data: [] };
  });
  mock.patch.mockImplementation(async (url, body) => {
    const source = url.includes('mileage') ? rows : times;
    const c = source.find(c => url.endsWith(`/${c.id}`));
    if (body.action === 'approve') Object.assign(c, { status: 'approved', target_payroll_period_id: body.targetPayrollPeriodId, tier_level: body.tierLevel, applied_amount: 2.94, approved_by_first_name: 'Payroll', approved_by_last_name: 'Admin' });
    if (body.action === 'update') Object.assign(c, { bucket: body.bucket, credits_hours: body.creditsHours, applied_amount: body.appliedAmount, payload: { ...c.payload, payRateKey: body.rateKey, payRateAmount: body.rateAmount, payRateLabel: body.rateLabel } });
    if (body.action === 'unapprove') c.status = 'submitted';
    return { data: { claim: c } };
  });
});
afterEach(() => wrappers.forEach(w => w.unmount()));
async function page(tab = 'mileage') {
  mock.route.query = { tab };
  const w = mount(PayrollPendingSubmissions, { global: { stubs: { MeetingClaimDetails: true, IndirectTimeClaimDetailFields: true } } }); wrappers.push(w); await flushPromises(); return w;
}
function button(w, text) { return w.findAll('button').find(b => b.text() === text); }
it('shows tier and estimate, retains only View/Approve/Reject, and moves mileage below after approval', async () => {
  const w = await page();
  expect(w.text()).toContain('Rate / Tier'); expect(w.text()).toContain('$2.94');
  expect(w.findAll('tbody')[0].findAll('button').map(b => b.text())).toEqual(['View', 'Approve', 'Reject']);
  await button(w, 'Approve').trigger('click'); await flushPromises();
  expect(mock.patch).toHaveBeenCalledWith('/payroll/mileage-claims/10', expect.objectContaining({ action: 'approve', tierLevel: 2, targetPayrollPeriodId: 8 }));
  expect(w.text()).toContain('No pending mileage claims.');
  expect(w.text()).toContain('Payroll Admin'); expect(w.text()).toContain('Approved Mileage Claims');
});
it('hides approved claims on posting and restores them after unposting and refresh', async () => {
  rows[0].status = 'approved'; rows[0].target_payroll_period_id = 8;
  const w = await page(); expect(w.findAll('tbody tr')).toHaveLength(1);
  posted = true; await button(w, 'Refresh').trigger('click'); await flushPromises(); expect(w.findAll('tbody tr')).toHaveLength(0);
  posted = false; await button(w, 'Refresh').trigger('click'); await flushPromises(); expect(w.findAll('tbody tr')).toHaveLength(1);
  expect(mock.get).toHaveBeenCalledWith('/payroll/mileage-claims', expect.objectContaining({ params: expect.objectContaining({ status: 'approved', unpostedOnly: true }) }));
});
it('edits approved time bucket and rate, recalculates pay, persists, and unapproves', async () => {
  const w = await page('time'); expect(w.text()).toContain('Individual supervision');
  await w.get('[aria-label="Pay bucket for Test Provider"]').setValue('direct');
  await w.get('[aria-label="Pay rate for Test Provider"]').setValue('direct');
  await w.get('[aria-label="Approved hours for Test Provider"]').setValue('2');
  expect(w.text()).toContain('$130.00');
  await button(w, 'Save').trigger('click'); await flushPromises();
  expect(mock.patch).toHaveBeenCalledWith('/payroll/time-claims/11', expect.objectContaining({ action: 'update', bucket: 'direct', creditsHours: 2, rateAmount: 65, appliedAmount: 130 }));
  await button(w, 'Unapprove').trigger('click'); await flushPromises();
  expect(w.text()).toContain('No approved time claims in unposted pay periods.'); expect(button(w, 'Approve')).toBeDefined();
});
it('preserves approved dollars for bucket-only changes and can restore the approved rate', async () => {
  times[0].credits_hours = 2; times[0].applied_amount = 40;
  const w = await page('time'); const select = w.get('[aria-label="Pay rate for Test Provider"]');
  await select.setValue('direct'); await select.setValue('approved_rate');
  expect(w.text()).toContain('$40.00');
  await w.get('[aria-label="Pay bucket for Test Provider"]').setValue('direct');
  await button(w, 'Save').trigger('click'); await flushPromises();
  expect(mock.patch).toHaveBeenCalledWith('/payroll/time-claims/11', expect.objectContaining({ rateAmount: 20, appliedAmount: 40 }));
});
it('keeps successful queues visible and identifies a denied queue', async () => {
  failReimbursement = true; const w = await page();
  expect(w.text()).toContain('Reimbursements: Payroll access required'); expect(w.text()).toContain('$2.94');
  expect(mock.get.mock.calls.some(([url]) => url.includes('medcancel'))).toBe(false); expect(w.text()).not.toContain('MedCancel');
});
it('uses round-trip mileage and preserves approved payment when rates change', () => {
  const claim = { claim_type: 'other', miles: 10, round_trip: 1 };
  expect(mileageBillableMiles(claim)).toBe(20);
  expect(mileageEstimate(claim, { settings: { standardMileageRatePerMile: .7 } })).toBe(14);
  expect(mileageEstimate({ ...claim, status: 'approved', applied_amount: 12 }, { settings: { standardMileageRatePerMile: .7 } })).toBe(12);
  expect(approvedTimeDraft({ ...time, applied_amount: 0 }).amount).toBe(0);
});

it('keeps another approved row’s unsaved changes when saving one claim', async () => {
  times.push({ ...structuredClone(time), id: 12 });
  const w = await page('time');
  const hours = w.findAll('[aria-label="Approved hours for Test Provider"]');
  await hours[0].setValue('2'); await hours[1].setValue('3');
  const save = w.findAll('button').filter(b => b.text() === 'Save');
  await save[0].trigger('click'); await flushPromises();
  expect(w.findAll('[aria-label="Approved hours for Test Provider"]')[1].element.value).toBe('3');
});

it('still loads submissions when pay period loading is denied and names the failed request', async () => {
  failPeriods = true; const w = await page();
  expect(w.text()).toContain('Pay periods: Payroll access required');
  expect(w.text()).toContain('$2.94');
  expect(button(w, 'Approve').element.disabled).toBe(true);
});
