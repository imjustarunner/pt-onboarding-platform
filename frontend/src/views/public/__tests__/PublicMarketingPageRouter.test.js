import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PageRouter from '../PublicMarketingPageRouter.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
it.each([
  ['tisi', {}, 'landing'],
  ['another-page', { landingTemplate: 'tisi' }, 'landing'],
  ['another-page', {}, 'hub']
])('selects the explicit template without overriding unrelated pages: %s %j', async (slug, branding, expected) => {
  api.get.mockResolvedValue({ data: { page: { pageType: 'marketing_landing', branding } } });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/p/:hubSlug', component: PageRouter }] });
  await router.push(`/p/${slug}`);
  const wrapper = mount(PageRouter, { global: { plugins: [router], stubs: { PublicMarketingLandingTisiView: { template: '<div class="landing" />' }, PublicMarketingHubView: { template: '<div class="hub" />' } } } });
  await flushPromises();
  expect(wrapper.find(`.${expected}`).exists()).toBe(true);
  wrapper.unmount();
});
