import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PaymentOptions from '../PublicIntakeSchoolPaymentOptions.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const mountOptions = () => mount(PaymentOptions, { props: { publicKey: 'school', submissionId: 10 }, global: { stubs: { PublicIntakePaymentStep: true } } });
it('offers card now and card later when collection is available, without a setup or charge on mount', async () => {
  api.get.mockResolvedValue({ data: { publishableKey: 'pk_test_synthetic', connectedAccountId: 'acct_synthetic' } });
  const wrapper = mountOptions(); await flushPromises();
  expect(wrapper.text()).toContain('Add card now');
  await wrapper.findAll('button').find(button => button.text() === 'Add card later').trigger('click');
  expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({ paymentChoice: 'later', skipAcknowledged: true, requiresPaymentFollowup: true });
  expect(api.get).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
it('offers follow-up and hides Add card now when collection is disabled', async () => {
  api.get.mockResolvedValue({ data: { stripeEnabled: false } });
  const wrapper = mountOptions(); await flushPromises();
  expect(wrapper.text()).not.toContain('Add card now');
  expect(wrapper.text()).toContain('Add card later');
  expect(wrapper.text()).toContain('Card collection is unavailable');
  wrapper.unmount();
});
