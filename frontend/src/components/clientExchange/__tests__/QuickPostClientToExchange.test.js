import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import PostListingModal from '../PostListingModal.vue';
const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), user: { role: 'support' }, route: { params: { organizationSlug: 'auricwell-qa-demo' } } }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.user }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
import Button from '../QuickPostClientToExchange.vue';
const options = { global: { stubs: { Teleport: true, RouterLink: RouterLinkStub, PostListingModal: true } } };
beforeEach(() => { vi.clearAllMocks(); mocks.user.role = 'support'; });
it('opens the ordinary locked-client review without posting and allows canceling it', async () => {
  const wrapper = mount(Button, { ...options, props: { client: { id: 12, agencyId: 450, initials: 'DEMO', status: 'ACTIVE' } } });
  await wrapper.find('button').trigger('click'); await flushPromises();
  const review = wrapper.findComponent(PostListingModal);
  expect(review.props()).toMatchObject({ agencyId: 450, presetClientId: 12, presetClientLabel: 'DEMO', lockClient: true, isBackoffice: true });
  expect(mocks.post).not.toHaveBeenCalled();
  review.vm.$emit('close'); await flushPromises();
  expect(wrapper.findComponent(PostListingModal).exists()).toBe(false);
  expect(wrapper.text()).toContain('Refer through Client Exchange');
});
it('hides the quick action for assigned clients and providers', () => {
  for (const extra of [{ provider_id: 9 }, { providers: [{ providerId: 9 }] }, { status: 'ARCHIVED' }]) {
    const wrapper = mount(Button, { ...options, props: { client: { id: 12, agency_id: 450, ...extra } } }); expect(wrapper.find('button').exists()).toBe(false);
  }
  mocks.user.role = 'provider';
  const wrapper = mount(Button, { ...options, props: { client: { id: 12, agency_id: 450 } } }); expect(wrapper.find('button').exists()).toBe(false);
});
it.each([false, true])('links to the saved referral while preserving agency context (already exists: %s)', async alreadyPosted => {
  const wrapper = mount(Button, { ...options, props: { client: { id: 12, agency_id: 450 } } });
  await wrapper.find('button').trigger('click');
  const listing = { id: 5, alreadyPosted, notifications: { failed: alreadyPosted ? 0 : 1 } };
  wrapper.findComponent(PostListingModal).vm.$emit('posted', listing); await flushPromises();
  expect(wrapper.findComponent(PostListingModal).exists()).toBe(false);
  expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({ path: '/auricwell-qa-demo/client-exchange', query: { listingId: 5 } });
  expect(wrapper.find('button').exists()).toBe(false);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(wrapper.emitted('posted')).toEqual([[listing]]);
  if (!alreadyPosted) expect(wrapper.text()).toContain('some notification emails could not be sent');
});
