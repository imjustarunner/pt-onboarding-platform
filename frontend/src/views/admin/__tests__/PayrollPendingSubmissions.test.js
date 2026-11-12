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
let rows, times, posted, failReimbursement, failPeriods, wrappers, periodRows, ptoRows, eventRows, reimbRows, annualReports;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  vi.clearAllMocks(); wrappers = []; periodRows = [period]; ptoRows = []; eventRows = []; reimbRows = []; annualReports = {}; mock.route.query = { tab: 'mileage' };
  rows = [structuredClone(mileage)]; times = [structuredClone(time)]; posted = false; failReimbursement = false; failPeriods = false;
  mock.post.mockResolvedValue({ data: {} });
  mock.get.mockImplementation(async (url, { params } = {}) => {
    if (url === '/payroll/periods' && failPeriods) throw { response: { status: 403, data: { error: { message: 'Payroll access required' } } } };
    if (url === '/payroll/periods') return { data: periodRows.map(p => ({ ...p, status: posted ? 'posted' : p.status })) };
    if (url === '/payroll/agency-users') return { data: [{ id: 7, first_name: 'Test', last_name: 'Provider' }] };
    if (url === '/payroll/mileage-rates') return { data: { rates: [{ tierLevel: 1, ratePerMile: 0.6 }, { tierLevel: 2, ratePerMile: 0.35 }, { tierLevel: 3, ratePerMile: 0.2 }], settings: {} } };
    if (url === '/payroll/event-time-submissions') return { data: { submissions: eventRows } };
    if (url === '/payroll/pto-requests') return { data: ptoRows };
    if (url === '/payroll/mileage-annual-summary') return { data: annualReports[params.year] || { year: params.year, limitDollars: 2000, people: [{ userId: 7, paidDollars: 500, approvedDollars: 100, committedDollars: 600, overLimitDollars: 0 }] } };
    if (url === '/payroll/mileage-claims' || url === '/payroll/time-claims') {
      const source = url.includes('mileage') ? rows : times;
      return { data: source.filter(c => c.status === params.status && !(params.unpostedOnly && posted)).slice(params.offset, params.offset + params.limit) };
    }
    if (url === '/payroll/reimbursement-claims' && failReimbursement) throw { response: { status: 403, data: { error: { message: 'Payroll access required' } } } };
    if (url === '/payroll/reimbursement-claims') return { data: reimbRows };
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
afterEach(() => { wrappers.forEach(w => w.unmount()); vi.useRealTimers(); });
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
it('approves without reloading every claims queue and lays out actions in one row', async () => {
  times[0].status = 'submitted'; const w = await page('time');
  const gets = mock.get.mock.calls.length;
  expect(w.find('.pps-row-actions').exists()).toBe(true);
  await button(w,'Approve').trigger('click'); await flushPromises();
  expect(mock.get.mock.calls.length).toBe(gets);
  expect(w.text()).toContain('No pending time claims.'); expect(w.text()).toContain('Approved Test Provider');
});
it('labels mentorship at its Individual Meeting rate without changing its pay or Indirect bucket', async () => {
  times=[{...structuredClone(time),status:'submitted',claim_type:'meeting_training',credits_hours:null,applied_amount:null,target_payroll_period_id:null,
    payload:{source:'meeting_compensation_auto',serviceCode:'Individual Meeting',meetingType:'Mentorship Meeting',totalMinutes:56.38},
    payEstimate:{amount:26.31,hourlyRate:28,rateBucket:'indirect',rateLabel:'Individual Meeting rate',serviceCode:'Individual Meeting',indirectRate:22}}];
  const w=await page('time');
  expect(w.text()).toContain('$26.32');expect(w.text()).toContain('Individual Meeting rate');expect(w.text()).not.toContain('Support Activity rate');
  expect(w.get('.ft-rate-hint').attributes('aria-label')).toContain('$28.00 per hour');
  await button(w,'Approve').trigger('click');await flushPromises();
  expect(mock.patch).toHaveBeenCalledWith('/payroll/time-claims/11',expect.objectContaining({bucket:'indirect',creditsHours:0.94}));
});
it('bulk approves selected claims in one request and retains a failed row with its reason', async () => {
  vi.spyOn(window,'confirm').mockReturnValueOnce(true);
  times = [11,12].map(id => ({ ...structuredClone(time), id, status:'submitted',target_payroll_period_id:null }));
  const w = await page('time'); const gets=mock.get.mock.calls.length; mock.post.mockClear();
  await w.get('[aria-label="Select all time claims"]').setValue(true);
  mock.post.mockResolvedValue({data:{results:[{kind:'time',id:11,ok:true,claim:{...times[0],status:'approved',applied_amount:20,target_payroll_period_id:8}},{kind:'time',id:12,ok:false,error:{message:'Review the travel report first'}}]}});
  await button(w,'Approve selected').trigger('click');await flushPromises();
  expect(mock.post).toHaveBeenCalledOnce();expect(mock.post).toHaveBeenCalledWith('/payroll/claims/batch',expect.objectContaining({action:'approve',items:expect.arrayContaining([expect.objectContaining({id:11,targetPayrollPeriodId:8,creditsHours:1,bucket:'indirect'})])}));
  expect(mock.get.mock.calls.length).toBe(gets);expect(w.text()).toContain('1 of 2 decisions saved');expect(w.text()).toContain('Review the travel report first');
  expect(w.get('[aria-label="Select time claim 12 for Test Provider"]').element.checked).toBe(true);
  expect(w.find('[aria-label="Select time claim 11 for Test Provider"]').exists()).toBe(false);
});
it('does not announce success on a 409 or a declined override',async()=>{
  times=[11,12].map(id=>({...structuredClone(time),id,status:'submitted'}));const w=await page('time');
  await button(w,'Approve').trigger('click');await flushPromises();expect(w.text()).toContain('Approved Test Provider');
  vi.spyOn(window,'confirm').mockReturnValueOnce(false);
  mock.patch.mockRejectedValue({response:{status:409,data:{error:{message:'Submitted after cutoff'}}}});
  await button(w,'Approve').trigger('click');await flushPromises();
  expect(w.text()).toContain('Submitted after cutoff');expect(w.text()).not.toContain('Approved Test Provider');expect(w.find('[aria-label="Select time claim 12 for Test Provider"]').exists()).toBe(true);
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

it('keeps the saved worker name and readable service date when that worker is absent from the directory', async () => {
  Object.assign(rows[0], { user_id:596, provider_first_name:'Piper', provider_last_name:'Finch', drive_date:'2026-10-30T00:00:00.000Z' });
  const w=await page();expect(w.text()).toContain('Piper Finch');expect(w.text()).toContain('Oct 30, 2026');
  expect(w.text()).not.toContain('User #596');expect(w.text()).not.toContain('T00:00:00.000Z');
});

it('changes inherited destinations, preserves row overrides, and explicitly applies across all pending queues without approving', async () => {
  periodRows.push({ ...period, id: 9, period_start: '2026-10-24', period_end: '2026-11-06' }, { ...period, id: 10, period_start: '2026-11-07', period_end: '2026-11-20' });
  times[0].status = 'submitted';
  ptoRows = [{ id: 21, user_id: 7, status: 'submitted', dates: ['2026-10-16'], total_hours: 1 }];
  reimbRows = [{ id: 31, user_id: 7, status: 'submitted', amount: 15 }];
  eventRows = [{ punchInId: 41, indirectClaim: { id: 42, status: 'submitted' }, directHoursCap: 0, indirectHours: 1 }];
  const w = await page();
  await w.get('.pps-panel tbody select').setValue('3'); // Mileage tier is independent of destinations.
  const destination = w.findAll('.pps-panel tbody select')[1];
  await destination.setValue('10');
  await w.get('#pps-default-period').setValue('9');
  expect(destination.element.value).toBe('10');
  await w.get('.pps-tab').trigger('click'); await flushPromises();
  expect(w.get('.pps-panel tbody select').element.value).toBe('9');
  await w.findAll('button').find(b => b.text().startsWith('Apply to all')).trigger('click'); await flushPromises();
  expect(mock.patch).not.toHaveBeenCalled();
  expect(w.vm.ptoTargetById[21]).toBe(9);
  expect(w.vm.claimTargetByKey).toMatchObject({ 'time-11': 9, 'mileage-10': 9, 'reimb-31': 9 });
  expect(w.vm.eventTimeTargetPeriodByPunchId[41]).toBe(9);
  await button(w, 'Refresh').trigger('click'); await flushPromises();
  expect(w.vm.claimTargetByKey['mileage-10']).toBe(9);
  expect(w.vm.eventTimeTargetPeriodByPunchId[41]).toBe(9);
  expect(rows[0].status).toBe('submitted'); expect(times[0].status).toBe('submitted');
});

it('keeps off-schedule and locked periods out of approval destinations, including the older-period view', async () => {
  periodRows.push({ ...period, id: 90, schedule_aligned: 0, period_start: '2026-10-17', period_end: '2026-10-30' },
    { ...period, id: 91, status: 'posted', period_start: '2026-09-26', period_end: '2026-10-09' },
    { ...period, id: 92, period_start: '2026-08-01', period_end: '2026-08-14' },
    { ...period, id: 93, period_start: '2026-09-12', period_end: '2026-09-25' });
  const w = await page();
  expect(w.get('#pps-default-period').findAll('option').map(o => o.element.value)).not.toContain('92');
  await w.get('.pps-period-history input').setValue(true);
  const ids = w.get('#pps-default-period').findAll('option').map(o => o.element.value);
  expect(ids).toContain('92'); expect(ids).not.toContain('90'); expect(ids).not.toContain('91');
});

it('shows the configured hourly rate, including a short claim whose rounded dollars cannot reconstruct the rate', async () => {
  mock.route.query = { tab: 'time' };
  times[0] = { ...times[0], status: 'submitted', credits_hours: 0.12, payload: { totalMinutes: 7, serviceCode: 'Admin Time' }, payEstimate: { amount: 3.9, hourlyRate: 32.5, rateBucket: 'indirect', rateLabel: 'Admin Time rate' } };
  const w = await page('time');
  expect(w.get('.ft-rate-hint').attributes('tabindex')).toBe('0');
  expect(w.get('[role="tooltip"]').text()).toContain('$32.50 per hour');
  await w.get('.pps-panel input[type="number"]').setValue('2');
  expect(w.get('[role="tooltip"]').text()).toContain('$65.00 estimated pay');
});

it('shows yearly posted and committed allowance using each claim’s year', async () => {
  rows.push({ ...mileage, id: 12, drive_date: '2025-12-20' });
  annualReports[2025] = { year: 2025, limitDollars: 2000, people: [{ userId: 7, paidDollars: 1900, approvedDollars: 150, committedDollars: 2050, overLimitDollars: 50 }] };
  const w = await page();
  expect(w.text()).toContain('2026 year to date · $500.00 posted'); expect(w.text()).toContain('$1400.00 uncommitted');
  expect(w.text()).toContain('2025 year to date · $1900.00 posted'); expect(w.text()).toContain('$50.00 over maximum');
  expect(w.findAll('progress')).toHaveLength(2);
});

it('seeds current benefit Tier 2 instead of the missing or stale claim tier',async()=>{
 rows[0].tier_level=null;rows[0].current_tier_level=2;rows[0].current_tier_period_end='2026-10-09';
 const w=await page();expect(w.get('select[aria-label="Mileage tier for Test Provider"]').element.value).toBe('2');
 expect(w.text()).toContain('Benefit tier from');
 await button(w,'Approve').trigger('click');await flushPromises();expect(mock.patch).toHaveBeenCalledWith('/payroll/mileage-claims/10',expect.objectContaining({tierLevel:2}));
});
it('does not default a completely unknown tier to Tier 1',async()=>{
 rows[0].tier_level=null;const w=await page();expect(w.get('select[aria-label="Mileage tier for Test Provider"]').element.value).toBe('0');
});
it('edits approved mileage and lets payroll choose a different open period or unapprove',async()=>{
 rows[0].status='approved';rows[0].target_payroll_period_id=8;rows[0].applied_amount=2.94;
 periodRows.push({...period,id:9,period_start:'2026-10-24',period_end:'2026-11-06'});
 const w=await page();await w.get('input[aria-label="Approved eligible miles for Test Provider"]').setValue('10');
 await button(w,'Save').trigger('click');await flushPromises();expect(mock.patch).toHaveBeenCalledWith('/payroll/mileage-claims/10',{action:'update',eligibleMiles:10,tierLevel:2});
 await w.get('select[aria-label="Approved mileage pay period for Test Provider"]').setValue('9');await flushPromises();expect(mock.patch).toHaveBeenCalledWith('/payroll/mileage-claims/10',{action:'move',targetPayrollPeriodId:9});
 await button(w,'Unapprove').trigger('click');await flushPromises();expect(mock.patch).toHaveBeenCalledWith('/payroll/mileage-claims/10',{action:'unapprove'});
});
