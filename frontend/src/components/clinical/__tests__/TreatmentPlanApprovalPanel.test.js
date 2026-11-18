import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api';
import Panel from '../TreatmentPlanApprovalPanel.vue';
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { approval: { contentHash: 'current-hash', providerApproved: false, supervisorApproved: false, ready: false }, canProviderSign: true } });
  api.post.mockResolvedValue({ data: { approval: { contentHash: 'current-hash', providerApproved: true, supervisorApproved: false, ready: false } } });
});
it('requires an explicit provider attestation and preserves the supervisor review step', async () => {
  const wrapper = mount(Panel, { props: { agencyId: 4, clientId: 50, planId: 10 } });
  await flushPromises();
  const button = wrapper.findAll('button').find(item => item.text().includes('Sign plan'));
  expect(button.attributes('disabled')).toBeDefined();
  expect(wrapper.text()).toContain('Quick sign does not apply');
  await wrapper.find('input[type=checkbox]').setValue(true);
  await button.trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/10/provider-review', { agencyId: 4, clientId: 50, contentHash: 'current-hash', reviewedAndAccurate: true });
  expect(wrapper.text()).toContain('Supervisor: Review required');
  expect(wrapper.emitted('updated')).toHaveLength(1);
  wrapper.unmount();
});
it('never offers another user a provider signing button', async () => {
  api.get.mockResolvedValue({ data: { approval: { providerApproved: false, supervisorApproved: false }, canProviderSign: false } });
  const wrapper = mount(Panel, { props: { agencyId: 4, clientId: 50, planId: 10 } });
  await flushPromises();
  expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
  expect(wrapper.text()).toContain('assigned supervisor');
  wrapper.unmount();
});

it('discards an approval response when the authorized client or plan changes', async () => {
  let finishOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  const wrapper = mount(Panel, { props: { agencyId: 4, clientId: 50, planId: 10 } });
  await wrapper.setProps({ clientId: 51, planId: 11 }); await flushPromises();
  finishOld({ data: { approval: { contentHash: 'old-client-hash', providerApproved: true, supervisorApproved: true, ready: true }, canProviderSign: false } }); await flushPromises();
  expect(wrapper.text()).toContain('Provider: Review required');
  await wrapper.find('input[type=checkbox]').setValue(true);
  await wrapper.findAll('button').find(item => item.text().includes('Sign plan')).trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/11/provider-review', { agencyId: 4, clientId: 51, contentHash: 'current-hash', reviewedAndAccurate: true });
  wrapper.unmount();
});
