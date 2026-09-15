import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { reactive } from 'vue';
import BusinessJourney from '../BusinessJourney.vue';
import api from '../../../services/api';
import { BUSINESS_JOURNEY, emptyLifecycle } from '../../../../../backend/src/services/businessLifecyclePolicy.js';
const context = vi.hoisted(() => ({ role: 'super_admin', agency: { id: 1 } }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: context.agency }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: context.role } }) }));
const record = () => ({ state: emptyLifecycle(), revision: 0, agencyId: 1, stages: BUSINESS_JOURNEY });
const button = (w, text) => w.findAll('button').find(b => b.text().includes(text));
async function setup(props = {}) {
  const routeProps = reactive(props);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/settings', component: { components: { BusinessJourney }, setup: () => ({ routeProps }), template: '<BusinessJourney v-bind="routeProps" />' } }, { path: '/other', component: { template: '<p>Other</p>' } }] });
  await router.push('/admin/settings?item=business-journey');
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } }); await flushPromises();
  return { wrapper, router, routeProps };
}
beforeEach(() => {
  vi.clearAllMocks(); context.role = 'super_admin';
  api.get.mockImplementation(async url => ({ data: url.startsWith('/billing/') ? { totals: { totalCents: 50000 } } : record() }));
  api.put.mockImplementation(async (_url, body) => ({ data: { ...record(), state: structuredClone(body.state), revision: body.revision + 1 } }));
});
describe('business journey', () => {
  it('saves checklist progress with its revision and reopens persisted work', async () => {
    const { wrapper: w } = await setup();
    expect(w.text()).toContain('Interview & discovery');
    await w.find('input[type=checkbox]').setValue(true);
    await w.find('input[placeholder="Name or role"]').setValue('Business owner');
    await button(w, 'Save changes').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/business-lifecycle/companies/1', expect.objectContaining({ revision: 0, state: expect.objectContaining({ stages: expect.objectContaining({ interview: expect.objectContaining({ owner: 'Business owner', completed: ['discovery'] }) }) }) }));
    expect(w.text()).toContain('All changes saved');
    const data = { ...record(), state: structuredClone(api.put.mock.calls[0][1].state), revision: 1 };
    api.get.mockImplementation(async url => ({ data: url.startsWith('/billing/') ? { totals: { totalCents: 50000 } } : data }));
    await button(w, 'Reload saved journey').trigger('click'); await flushPromises();
    expect(w.find('input[type=checkbox]').element.checked).toBe(true); w.unmount();
  });
  it('preserves edits and cancels navigation when a conflicting save fails', async () => {
    const { wrapper: w, router } = await setup(); await w.find('textarea').setValue('Unfinished decisions');
    api.put.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Someone else updated this journey. Reload it before saving your changes.' } } } });
    await router.push('/admin/settings?item=billing'); await flushPromises();
    expect(router.currentRoute.value.query.item).toBe('business-journey');
    expect(w.find('textarea').element.value).toBe('Unfinished decisions'); expect(w.text()).toContain('Someone else updated'); w.unmount();
  });
  it('saves before opening the correct company setting and scopes the destination', async () => {
    const { wrapper: w, router } = await setup();
    await button(w, 'Set up the organization').trigger('click');
    await w.find('input[placeholder="Name or role"]').setValue('Setup owner');
    await button(w, 'Open settings').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.query).toMatchObject({ agencyId: '1', item: 'business-details', agencyTab: 'general' }); w.unmount();
  });
  it('requires an explicit exit plan without automatically changing company access', async () => {
    const { wrapper: w } = await setup(); expect(button(w, 'Transition & exit').attributes('disabled')).toBeDefined();
    await button(w, 'Start an exit plan').trigger('click');
    expect(w.text()).toContain('Transfer ownership and complete agreed access changes');
    await button(w, 'Save changes').trigger('click'); await flushPromises();
    expect(api.put.mock.calls[0][1].state.exitStarted).toBe(true); expect(api.put.mock.calls.every(([url]) => url.startsWith('/business-lifecycle/'))).toBe(true); w.unmount();
  });
  it('uses the request endpoint before activation and drafts the approved billing method', async () => {
    const { wrapper: w } = await setup({ requestId: 'test-request' });
    expect(api.get).toHaveBeenCalledWith('/business-lifecycle/requests/test-request');
    await button(w, 'Review agreement & pricing').trigger('click'); await button(w, 'Draft an agreement').trigger('click');
    expect(w.findAll('select').some(s => s.element.value === 'higher_of')).toBe(true);
    await button(w, 'Save changes').trigger('click'); await flushPromises();
    expect(api.put.mock.calls[0][0]).toBe('/business-lifecycle/requests/test-request');
    expect(api.put.mock.calls[0][1].state.agreements[0].revenueShareBps).toBe(1000); w.unmount();
  });
  it('allows company admins to review financial terms with editing disabled', async () => {
    context.role = 'admin'; const { wrapper: w } = await setup({ commercialOnly: true });
    expect(w.text()).toContain('PlotTwistCo maintains signed terms');
    expect(button(w, 'Draft an agreement')).toBeUndefined(); expect(button(w, 'Add a revenue month')).toBeUndefined(); w.unmount();
  });
  it('clears the prior company immediately and ignores delayed responses after switching scope', async () => {
    const { wrapper: w, routeProps } = await setup({ scopedAgencyId: 1 });
    let finishOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    routeProps.scopedAgencyId = 2; await flushPromises(); expect(w.text()).toContain('Loading the business journey'); expect(w.find('textarea').exists()).toBe(false);
    const third = record(); third.agencyId = 3; third.state.stages.interview.notes = 'Current company';
    api.get.mockImplementation(async url => ({ data: url.startsWith('/billing/') ? { totals: { totalCents: 0 } } : third }));
    routeProps.scopedAgencyId = 3; await flushPromises(); finishOld({ data: record() }); await flushPromises();
    expect(w.find('textarea').element.value).toBe('Current company'); w.unmount();
  });
});
