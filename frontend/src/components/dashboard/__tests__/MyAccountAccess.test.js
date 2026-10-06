import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MyAccountAccess from '../MyAccountAccess.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
beforeEach(() => { vi.clearAllMocks(); });
it('shows retained login information and repeatable password access without onboarding acknowledgements', async () => {
  api.get.mockResolvedValue({ data: { credentialPacket: { systems: [{ key: 'grasshopper', label: 'Grasshopper', username: 'devon', extension: '102', pin: '1234' }, { key: 'therapynotes', label: 'TherapyNotes', username: 'devon.tn', tempPasswordAvailable: true }] } } });
  const w = mount(MyAccountAccess); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/users/me/account-access');
  expect(w.text()).toContain('devon.tn'); expect(w.text()).toContain('1234');
  expect(w.text()).not.toContain('I have saved');
  api.post.mockResolvedValue({ data: { revealed: true, password: 'temporary-example' } });
  await w.findAll('button').find(b => b.text() === 'Show saved password').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/users/me/account-access/systems/therapynotes/reveal-temp-password');
  expect(w.text()).toContain('temporary-example'); w.unmount();
  const returned = mount(MyAccountAccess); await flushPromises();
  expect(returned.text()).not.toContain('temporary-example');
  await returned.findAll('button').find(b => b.text() === 'Show saved password').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(returned.text()).toContain('temporary-example'); returned.unmount();
});
it('shows a recoverable load error instead of claiming no accounts exist', async () => {
  api.get.mockRejectedValue(new Error('offline'));
  const w = mount(MyAccountAccess); await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('Could not load'); w.unmount();
});
