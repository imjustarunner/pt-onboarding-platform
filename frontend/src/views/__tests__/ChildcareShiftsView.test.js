import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const state = vi.hoisted(() => ({ agency: { currentAgency: { id: 453, timezone: 'America/Denver' } }, auth: { user: { id: 1496 } }, route: { query: {}, params: {} }, replace: vi.fn() }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => state.agency }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('vue-router', () => ({ useRoute: () => state.route, useRouter: () => ({ replace: state.replace }) }));
vi.mock('../../services/api', () => ({ default: {} }));
import View from '../ChildcareShiftsView.vue';
const shift = { id: 7, plannedChildren: 5, startsAt: '2026-11-19T23:00:00Z', endsAt: '2026-11-20T02:00:00Z', timezone: 'America/Denver', title: 'QA childcare', status: 'scheduled', providers: [{ userId: 1496, firstName: 'Finley', lastName: 'QA', clockedIn: false }] };
function client({ denied = false, punchFails = false } = {}) {
  return { get: vi.fn(async path => {
    if (path.endsWith('/context')) return { data: { enabled: true, canWork: !denied, canManage: false, canSchedule: !denied } };
    if (path.endsWith('/pay-preview')) return { data: { totalMinutes: 0, totalAmount: 0, segments: [], reviewRequired: true, reasons: ['Record attendance and actual work time.'] } };
    if (path.endsWith('/shifts')) return { data: { shifts: [shift] } };
    return { data: { shift } };
  }), post: vi.fn(async () => { if (punchFails) throw new Error('Connection lost; retry.'); return { data: { shift } }; }), patch: vi.fn() };
}
beforeEach(() => { state.route.query = {}; state.replace.mockClear(); });
describe('childcare app clocking', () => {
  it('renders the exact planned count and records missing attendance without inventing a count', async () => {
    const http = client(); const wrapper = mount(View, { props: { agencyId: 453, http, shiftId: 7 } }); await flushPromises();
    expect(wrapper.text()).toContain('Were the scheduled 5 children present?');
    await wrapper.get('input[value=later]').setValue();
    await wrapper.findAll('button').find(b => b.text() === 'Clock in').trigger('click'); await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/childcare/shifts/7/clock-in', expect.objectContaining({ agencyId: 453, idempotencyKey: expect.any(String) }), { skipGlobalLoading: true });
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('actualChildren');
    expect(wrapper.text()).toContain('Clock-in recorded.');
  });
  it('requires an explicit count choice and retains the request key after an uncertain failure', async () => {
    const http = client({ punchFails: true }); const wrapper = mount(View, { props: { agencyId: 453, http, shiftId: 7 } }); await flushPromises();
    const click = () => wrapper.findAll('button').find(b => b.text() === 'Clock in').trigger('click');
    await click(); expect(http.post).not.toHaveBeenCalled();
    await wrapper.get('input[value=planned]').setValue(); await click(); await flushPromises();
    expect(wrapper.text()).toContain('Connection lost; retry.');
    await click(); await flushPromises();
    expect(http.post.mock.calls[0][1]).toEqual(http.post.mock.calls[1][1]);
    expect(http.post.mock.calls[0][1].actualChildren).toBe(5);
    expect(wrapper.text()).not.toContain('Clock-in recorded.');
  });
  it('does not load private shift details for an account without childcare permission', async () => {
    const http = client({ denied: true }); const wrapper = mount(View, { props: { agencyId: 453, http, shiftId: 7 } }); await flushPromises();
    expect(wrapper.text()).toContain('Childcare is not assigned to your account');
    expect(http.get).toHaveBeenCalledTimes(1); expect(http.post).not.toHaveBeenCalled();
  });
});
it('lets a childcare-only reviewer inspect work and sign off without viewing another employee’s pay',async()=>{
 const reviewed={...shift,status:'completed',workReviews:[{user_id:1496,status:'submitted',snapshot_hash:'current-hash',intervals:[{startedAt:shift.startsAt,endedAt:shift.endsAt}]}],attendanceHistory:[{actualChildren:5,effectiveAt:shift.startsAt}]};
 const http={get:vi.fn(async path=>({data:path.endsWith('/context')?{enabled:true,canWork:false,canManage:false,canApprove:true}:path.endsWith('/shifts')?{shifts:[reviewed]}:{shift:reviewed}})),post:vi.fn(async()=>({data:{}}))};
 const w=mount(View,{props:{agencyId:453,userId:1,http,shiftId:7}});await flushPromises();
 expect(w.text()).toContain('Finley QA · submitted');expect(http.get.mock.calls.some(([url])=>url.includes('pay-preview'))).toBe(false);
 const approve=w.findAll('button').find(b=>b.text()==='Sign off on childcare work');expect(approve.attributes('disabled')).toBeDefined();
 await w.find('textarea').setValue('Reviewed the recorded work and child-count timeline.');await w.get('.work-review input[type=checkbox]').setValue(true);await approve.trigger('click');await flushPromises();
 expect(http.post).toHaveBeenCalledWith('/childcare/shifts/7/review-work',expect.objectContaining({agencyId:453,targetUserId:1496,decision:'approved',snapshotHash:'current-hash',confirmed:true}), { skipGlobalLoading: true });w.unmount();
});

it('offers a review-only queue without loading peer pay or scheduling controls',async()=>{
 const review={...shift,status:'completed',workReviews:[{user_id:1496,status:'submitted',snapshot_hash:'h',intervals:[]}],timeCorrections:[{id:1,user_id:1771,status:'pending'}]};
 const http={get:vi.fn(async path=>({data:path.endsWith('/context')?{enabled:true,canApprove:true,canWork:false}:path.endsWith('/shifts')?{shifts:[review]}:{shift:review}}))};
 const w=mount(View,{props:{agencyId:453,userId:1807,http}});await flushPromises();expect(w.find('.work-review-queue').text()).toContain('2 items awaiting review');await w.find('.work-review-queue button').trigger('click');await flushPromises();expect(w.find('.shift-detail').text()).toContain('Recorded work and childcare sign-off');expect(http.get.mock.calls.some(([url])=>url.includes('pay-preview'))).toBe(false);expect(w.text()).not.toContain('Schedule childcare');w.unmount();
});
it('retains seconds in the correction form and makes a deferred pay hold visible',async()=>{
 const own={...shift,status:'completed',workReviews:[{user_id:1496,status:'draft',intervals:[{startedAt:'2026-11-19T23:00:12Z',endedAt:'2026-11-20T00:00:48Z'}]}]};
 const http={get:vi.fn(async path=>({data:path.endsWith('/context')?{enabled:true,canWork:true}:path.endsWith('/shifts')?{shifts:[own]}:path.endsWith('/pay-preview')?{totalAmount:22,claimStatus:'deferred',segments:[]}:{shift:own}}))};
 const w=mount(View,{props:{agencyId:453,userId:1496,http,shiftId:7}});await flushPromises();const inputs=w.findAll('input[step="1"][type="datetime-local"]');expect(inputs).toHaveLength(2);expect(inputs[0].element.value).toMatch(/^2026-11-19T16:00:12(?:\.000)?$/);expect(inputs[1].element.value).toMatch(/^2026-11-19T17:00:48(?:\.000)?$/);expect(w.text()).toContain('Pay held for review');w.unmount();
});


it('restores a recorded count on reload and makes it available for clock-out', async () => {
  const active = { ...shift, actualChildren: 3, providers: [{ ...shift.providers[0], clockedIn: true }] };
  const http = client();
  http.get.mockImplementation(async path => ({ data: path.endsWith('/context') ? { enabled: true, canWork: true } :
    path.endsWith('/shifts') ? { shifts: [active] } : { shift: active } }));
  const wrapper = mount(View, { props: { agencyId: 453, http, shiftId: 7 } });
  try {
    await flushPromises();
    expect(wrapper.get('input[value=actual]').element.checked).toBe(true);
    expect(wrapper.get('.child-count-choices input[type=number]').element.value).toBe('3');
    await wrapper.findAll('button').find(button => button.text() === 'Clock out').trigger('click');
    expect(http.post).toHaveBeenCalledWith('/childcare/shifts/7/clock-out',
      expect.objectContaining({ actualChildren: 3, confirmPlannedCount: false }), { skipGlobalLoading: true });
  } finally { wrapper.unmount(); }
});
