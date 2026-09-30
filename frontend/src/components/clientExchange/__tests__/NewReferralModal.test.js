import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
import Modal from '../NewReferralModal.vue';
const make = () => shallowMount(Modal, { props: { agencyId: 2 } });
beforeEach(() => { vi.clearAllMocks(); mocks.post.mockImplementation(async url => ({ data: url === '/client-exchange/referrals' ? { clientId: 15, taskId: 30 } : { listing: { id: 20 } } })); });
it('posts a minimal client referral without requiring demographic or clinical pastes', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState;
  Object.assign(state.form, { initials: 'AB', age: '9', gender: 'female', diagnoses: 'F41.1', providerGender: 'female' });
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/referrals', expect.objectContaining({ initials: 'AB', age: '9', providerGender: 'female', requestId: expect.any(String) }));
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings', { agencyId: 2, clientId: 15 });
  expect(wrapper.emitted('posted')).toHaveLength(1); wrapper.unmount();
});
it('imports optional pasted records before posting and reuses the saved client on retry', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState;
  state.form.initials = 'AB'; state.records.intake = 'Presenting problem: Worry';
  await state.submit(); await flushPromises();
  expect(state.showImport).toBe(true); expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/listings'))).toBe(false);
  mocks.post.mockRejectedValueOnce(new Error('Temporary failure'));
  await state.onImported(); await flushPromises();
  expect(state.clientId).toBe(15); expect(wrapper.emitted('posted')).toBeUndefined();
  await state.submit(); await flushPromises();
  expect(mocks.post.mock.calls.filter(([url]) => url === '/client-exchange/referrals')).toHaveLength(1);
  expect(wrapper.emitted('posted')).toHaveLength(1); wrapper.unmount();
});
it('uses the same request key if the create response is lost', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState; state.form.initials = 'AB';
  mocks.post.mockRejectedValueOnce(new Error('Response lost')); await state.submit(); await state.submit(); await flushPromises();
  const calls = mocks.post.mock.calls.filter(([url]) => url === '/client-exchange/referrals');
  expect(calls[0][1].requestId).toBe(calls[1][1].requestId); wrapper.unmount();
});
