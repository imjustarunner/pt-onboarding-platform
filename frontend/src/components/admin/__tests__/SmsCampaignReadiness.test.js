import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';
import SmsCampaignReadiness from '../SmsCampaignReadiness.vue';
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/registrations')
    ? [{ numberId: 3, phoneNumber: '+13035550100', registration: { purposes: ['care', 'reminders'] } }]
    : [{ id: 4, phone_last_four: '0101', signer_role: 'guardian', signed_at: '2026-01-01', expires_at: '2026-12-31' }] }));
  api.post.mockResolvedValue({ data: {} });
});
describe('signed consent administration', () => {
  it('requires explicit evidence review before activation', async () => {
    const wrapper = mount(SmsCampaignReadiness, { props: { agencyId: 2 } });
    await flushPromises(); await wrapper.get('select').setValue(3);
    const activate = wrapper.findAll('button').find(button => button.text() === 'Approve choices and activate');
    expect(activate.attributes('disabled')).toBeDefined();
    await wrapper.get('tbody input[type=checkbox]').setValue(true);
    await activate.trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/sms-numbers/agency/2/consent-requests/4/review', { signerVerified: true });
  });
  it('can refresh signatures without creating or sending anything', async () => {
    const wrapper = mount(SmsCampaignReadiness, { props: { agencyId: 2 } });
    await flushPromises(); await wrapper.get('select').setValue(3);
    await wrapper.findAll('button').find(button => button.text() === 'Refresh consent status').trigger('click');
    await flushPromises();
    expect(api.get.mock.calls.filter(([url]) => url.endsWith('/consent-requests'))).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();
  });
});
