import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Claim from '../SecureMessageClaimView.vue';
const m = vi.hoisted(() => ({ get: vi.fn(), auth: { isAuthenticated: true, user: { id: 1728 } } }));
vi.mock('axios', () => ({ default: { get: m.get } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'fictional-link' } }) }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => m.auth }));
vi.mock('../../components/conversa/ConversaBrand.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../components/conversa/SecureMessageBanner.vue', () => ({ default: { template: '<div />' } }));
beforeEach(() => vi.clearAllMocks());
it('uses the owner button while preserving the verified recipient redirect', async () => {
  m.get.mockResolvedValue({ data: { userId: 1728, targetPath: '/qa/guardian?panel=messages', loginUrl: '/qa/login' } });
  const wrapper = mount(Claim); await flushPromises();
  const button = wrapper.get('a[aria-label="Read secure message"]');
  expect(button.attributes('href')).toBe('/qa/guardian?panel=messages');
  expect(button.get('img').attributes('src')).toBe('/auricwell/session-comments/read-secure-message-button.png');
  wrapper.unmount();
});
it('keeps another signed-in account on the normal login path', async () => {
  m.get.mockResolvedValue({ data: { userId: 1729, targetPath: '/qa/guardian?panel=messages', loginUrl: '/qa/login' } });
  const wrapper = mount(Claim); await flushPromises();
  expect(wrapper.get('a[aria-label="Read secure message"]').attributes('href')).toBe('/qa/login');
  wrapper.unmount();
});
