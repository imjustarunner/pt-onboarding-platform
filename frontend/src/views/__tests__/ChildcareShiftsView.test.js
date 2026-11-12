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
    expect(http.post).toHaveBeenCalledWith('/childcare/shifts/7/clock-in', expect.objectContaining({ agencyId: 453, idempotencyKey: expect.any(String) }));
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
