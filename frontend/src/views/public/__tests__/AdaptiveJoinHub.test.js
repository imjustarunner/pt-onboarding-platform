import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Hub from '../AdaptiveJoinHubView.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
async function render(services, path = '/join/nlu?source=kimi') {
 api.get.mockResolvedValue({ data: { agency: { name: 'Next Level Up' }, intakeServices: services } });
 const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/join/:agencySlug', component: Hub },
  { path: '/:organizationSlug/join', component: Hub },
  { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
 ] });
 await router.push(path); await router.isReady();
 wrapper = mount(Hub, { global: { plugins: [router], stubs: { AdaptiveIntakeShell: { template: '<div><slot /></div>' } } } });
 await flushPromises(); return router;
}
describe('Join service selection', () => {
 it('shows enabled services and carries referral context into the selected flow', async () => {
  const router = await render([{ serviceType: 'counseling', displayName: 'Counseling' }, { serviceType: 'tutoring', displayName: 'Learning services' }]);
  expect(wrapper.findAll('.ai-pathway-card')).toHaveLength(2);
  await wrapper.findAll('.ai-pathway-card')[1].trigger('click'); await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/join/nlu/tutoring?source=kimi');
 });
 it('takes a single-service agency directly to its configured intake', async () => {
  const router = await render([{ serviceType: 'counseling', displayName: 'Counseling' }], '/itsco/join?source=school');
  expect(router.currentRoute.value.fullPath).toBe('/itsco/join/counseling?source=school');
 });
 it('offers help when no registration service is configured', async () => {
  const router = await render([]);
  expect(router.currentRoute.value.path).toBe('/join/nlu');
  expect(wrapper.text()).toContain('No online registration options');
  expect(wrapper.find('a[href="/nlu/support"]').exists()).toBe(true);
 });
});
