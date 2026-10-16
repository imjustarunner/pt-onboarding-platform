import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Join from '../AdaptiveJoinView.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }));
const config = { agency: { id: 2, name: 'ITSCO' }, activeService: { serviceType: 'counseling' }, intakeServices: [{ serviceType: 'counseling' }], pathways: { full: { enabled: true, publicKey: 'office-full' }, quick: { enabled: true } }, copy: {} };
let wrapper;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.resetAllMocks(); });
afterEach(() => wrapper?.unmount());
async function render({ status = { inPerson: { status: 'waitlist' }, virtual: { status: 'accepting' } }, full = config, path = '/join/itsco/counseling?enrollmentSource=provider&providerId=9&format=VIRTUAL', fail = false } = {}) {
  api.get.mockImplementation(async url => {
    if (url.includes('/schedule-summary')) {
      if (fail) throw new Error('Availability unavailable');
      return { data: status };
    }
    return { data: full };
  });
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/join/:agencySlug/:serviceType', component: { template: '<div />' } },
    { path: '/intake/:publicKey', component: { template: '<div />' } }
  ] });
  await router.push(path); await router.isReady();
  wrapper = shallowMount(Join, { global: { plugins: [router] } });
  await flushPromises();
  return router;
}

describe('provider profile entry redirects', () => {
  it.each(['VIRTUAL', 'IN_PERSON'])('opens only full enrollment for %s and preserves desired provider and care setting', async format => {
    const router = await render({ path: `/join/itsco/counseling?enrollmentSource=provider&providerId=9&format=${format}` });
    expect(router.currentRoute.value.path).toBe('/intake/office-full');
    expect(router.currentRoute.value.query).toMatchObject({ enrollmentSource: 'provider', providerId: '9', serviceType: 'counseling', format });
    expect(wrapper.findComponent({ name: 'AdaptiveJoinLanding' }).exists()).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/public/agency-services/itsco/providers/9/schedule-summary', expect.objectContaining({ params: { serviceType: 'counseling' } }));
  });

  it('asks for a format before starting a legacy provider link with mixed statuses', async () => {
    const router = await render({ path: '/join/itsco/counseling?providerId=9' });
    expect(router.currentRoute.value.path).toBe('/join/itsco/counseling');
    expect(wrapper.text()).toContain('How would you like to meet?');
    const options = wrapper.findAll('.provider-enrollment-entry .df-btn-primary');
    expect(options.map(item => item.text())).toEqual(['Virtual · Request this provider', 'In person · Join this provider’s waitlist']);
    await options[1].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/intake/office-full');
    expect(router.currentRoute.value.query.format).toBe('IN_PERSON');
  });

  it('blocks a newly closed format and never silently substitutes another open setting', async () => {
    const router = await render({ status: { inPerson: { status: 'accepting' }, virtual: { status: 'unavailable', hasPublishedOpenings: true } } });
    expect(router.currentRoute.value.path).toBe('/join/itsco/counseling');
    expect(wrapper.find('[role=alert]').text()).toContain('closed to new clients in this setting');
    expect(wrapper.findComponent({ name: 'AdaptiveJoinLanding' }).exists()).toBe(false);
  });

  it('fails safely when availability cannot be checked or a full packet is not configured', async () => {
    const router = await render({ fail: true });
    expect(router.currentRoute.value.path).toBe('/join/itsco/counseling');
    expect(wrapper.find('[role=alert]').exists()).toBe(true);
    wrapper.unmount();
    const disabled = await render({ full: { ...config, pathways: { quick: { enabled: true }, full: { enabled: false } } } });
    expect(disabled.currentRoute.value.path).toBe('/join/itsco/counseling');
    expect(wrapper.find('[role=alert]').text()).toContain('Full enrollment is not available');
    expect(wrapper.findComponent({ name: 'AdaptiveJoinLanding' }).exists()).toBe(false);
  });

  it('keeps both pathways for general enrollment with no provider preselection', async () => {
    const router = await render({ path: '/join/itsco/counseling' });
    expect(router.currentRoute.value.path).toBe('/join/itsco/counseling');
    expect(wrapper.findComponent({ name: 'AdaptiveJoinLanding' }).exists()).toBe(true);
    expect(api.get.mock.calls.some(([url]) => url.includes('schedule-summary'))).toBe(false);
  });

  it('releases a selected hold before returning to general enrollment without a provider', async () => {
    sessionStorage.setItem('provider-hold:itsco', JSON.stringify({ providerId: 9, token: 'opaque-hold' }));
    api.post.mockResolvedValue({ data: { ok: true } });
    const router = await render({ status: { inPerson: { status: 'unavailable' }, virtual: { status: 'unavailable' } } });
    await wrapper.find('.provider-enrollment-entry .df-btn-secondary').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/public/agency-services/itsco/release-hold', { token: 'opaque-hold' }, expect.any(Object));
    expect(sessionStorage.getItem('provider-hold:itsco')).toBeNull();
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.findComponent({ name: 'AdaptiveJoinLanding' }).exists()).toBe(true);
  });

  it('preserves a matching selected time for full enrollment without exposing its token in the URL', async () => {
    const selected = { providerId: 9, serviceType: 'counseling', modality: 'VIRTUAL', token: 'opaque-hold' };
    sessionStorage.setItem('provider-hold:itsco', JSON.stringify(selected));
    const router = await render();
    expect(JSON.parse(sessionStorage.getItem('provider-hold:itsco'))).toEqual(selected);
    expect(router.currentRoute.value.fullPath).not.toContain('opaque-hold');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('releases an old time when starting a different-format waitlist enrollment', async () => {
    sessionStorage.setItem('provider-hold:itsco', JSON.stringify({ providerId: 9, serviceType: 'counseling', modality: 'VIRTUAL', token: 'opaque-hold' }));
    api.post.mockResolvedValue({ data: { ok: true } });
    const router = await render({ path: '/join/itsco/counseling?enrollmentSource=provider&providerId=9&format=IN_PERSON' });
    expect(router.currentRoute.value.path).toBe('/intake/office-full');
    expect(api.post).toHaveBeenCalledWith('/public/agency-services/itsco/release-hold', { token: 'opaque-hold' }, expect.any(Object));
    expect(sessionStorage.getItem('provider-hold:itsco')).toBeNull();
  });

  it('keeps a non-reserving preference if availability changes to a waitlist before enrollment loads', async () => {
    const selected={providerId:9,serviceType:'counseling',modality:'VIRTUAL',preferenceOnly:true,startAt:'2030-01-07T17:00:00Z',endAt:'2030-01-07T18:00:00Z',timeZone:'America/Denver'};
    sessionStorage.setItem('provider-hold:itsco',JSON.stringify(selected));
    const router=await render({status:{virtual:{status:'waitlist'}}});
    expect(router.currentRoute.value.path).toBe('/intake/office-full');
    expect(JSON.parse(sessionStorage.getItem('provider-hold:itsco'))).toEqual(selected);expect(api.post).not.toHaveBeenCalled();
  });

  it('does not transfer a preference for another provider into this enrollment', async () => {
    sessionStorage.setItem('provider-hold:itsco',JSON.stringify({providerId:10,serviceType:'counseling',modality:'VIRTUAL',preferenceOnly:true}));
    const router=await render();expect(router.currentRoute.value.path).toBe('/intake/office-full');
    expect(sessionStorage.getItem('provider-hold:itsco')).toBeNull();expect(api.post).not.toHaveBeenCalled();
  });
});
