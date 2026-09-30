import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ post: vi.fn(), user: { role: 'support' } }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.user }) }));
import Button from '../QuickPostClientToExchange.vue';
beforeEach(() => { vi.clearAllMocks(); mocks.user.role = 'support'; mocks.post.mockResolvedValue({ data: { listing: { id: 5 } } }); });
it('posts an unassigned enrolled client in one click and disables repeats', async () => {
  const wrapper = mount(Button, { props: { client: { id: 12, agencyId: 2, status: 'ACTIVE' } } });
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings', { agencyId: 2, clientId: 12, quickPost: true });
  expect(wrapper.text()).toContain('Posted to exchange'); expect(wrapper.find('button').exists()).toBe(false);
});
it('hides the quick action for assigned clients and providers', () => {
  for (const extra of [{ provider_id: 9 }, { providers: [{ providerId: 9 }] }, { status: 'ARCHIVED' }]) {
    const wrapper = mount(Button, { props: { client: { id: 12, agency_id: 2, ...extra } } }); expect(wrapper.find('button').exists()).toBe(false);
  }
  mocks.user.role = 'provider';
  const wrapper = mount(Button, { props: { client: { id: 12, agency_id: 2 } } }); expect(wrapper.find('button').exists()).toBe(false);
});
it('keeps a posted listing visible when notification delivery fails', async () => {
  mocks.post.mockResolvedValue({ data: { listing: { id: 5, notifications: { failed: 1 } } } });
  const wrapper = mount(Button, { props: { client: { id: 12, agency_id: 2 } } });
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('some notification emails could not be sent'); expect(wrapper.find('button').exists()).toBe(false);
});
