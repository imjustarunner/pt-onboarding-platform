import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MyAccountAccess from '../MyAccountAccess.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
const quickViewStatus = { hasPasscode: true, requiresPassword: true, agencyName: 'Test Agency' };
beforeEach(() => { vi.resetAllMocks(); });
it('shows retained login information and repeatable password access without onboarding acknowledgements', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/quick-view/me/status' ? quickViewStatus : { credentialPacket: { systems: [{ key: 'grasshopper', label: 'Grasshopper', username: 'devon', extension: '102', pin: '1234' }, { key: 'therapynotes', label: 'TherapyNotes', username: 'devon.tn', tempPasswordAvailable: true }] } } }));
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

it.each([true, false])('resets the six-digit code directly from Accounts & access (password required: %s)', async requiresPassword => {
  api.get.mockImplementation(async url => ({ data: url === '/quick-view/me/status' ? { ...quickViewStatus, requiresPassword } : { credentialPacket: null } }));
  api.post.mockResolvedValue({ data: { passcode: '654321' } });
  const w = mount(MyAccountAccess); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Reset 6-digit passcode').trigger('click');
  expect(api.post).not.toHaveBeenCalled();
  expect(w.findAll('button').find(b => b.text() === 'Confirm').attributes('disabled')).toBeDefined();
  await w.get('.qv-input').setValue(requiresPassword ? 'example-password' : 'CONFIRM');
  await w.findAll('button').find(b => b.text() === 'Confirm').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/quick-view/me/reset-passcode', requiresPassword ? { password: 'example-password' } : { confirmPhrase: 'CONFIRM' }, { skipGlobalLoading: true, timeout: 30000 });
  expect(w.get('.pin').text()).toBe('654321');
  expect(w.find('.qv-confirm').exists()).toBe(false);
  w.unmount();
  const returned = mount(MyAccountAccess); await flushPromises();
  expect(returned.text()).not.toContain('654321'); returned.unmount();
});

it('keeps code creation available when work login details fail to load', async () => {
  api.get.mockImplementation(async url => {
    if (url === '/quick-view/me/status') return { data: { ...quickViewStatus, hasPasscode: false } };
    throw new Error('offline');
  });
  const w = mount(MyAccountAccess); await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('Could not load');
  await w.findAll('button').find(b => b.text() === 'Create 6-digit passcode').trigger('click');
  expect(w.find('.qv-input').exists()).toBe(true); w.unmount();
});

it('keeps a rejected reset recoverable without showing a new code', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/quick-view/me/status' ? quickViewStatus : { credentialPacket: null } }));
  api.post.mockRejectedValue({ response: { data: { error: { message: 'Incorrect account password' } } } });
  const w = mount(MyAccountAccess); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Reset 6-digit passcode').trigger('click');
  await w.get('.qv-input').setValue('wrong-password');
  await w.findAll('button').find(b => b.text() === 'Confirm').trigger('click'); await flushPromises();
  expect(w.text()).toContain('Incorrect account password');
  expect(w.find('.pin').exists()).toBe(false);
  expect(w.find('.qv-confirm').exists()).toBe(true); w.unmount();
});
