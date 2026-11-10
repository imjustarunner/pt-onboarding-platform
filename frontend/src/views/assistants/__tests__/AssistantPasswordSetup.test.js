import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { routeLocationKey } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Teams from '../AssistantTeamsView.vue';
import PasswordSetup from '../../../components/assistants/AssistantPasswordSetup.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
const accounts = [
  { id: 4, agencyName: 'ITSCO', email: 'billing-assistant@itsco.health' },
  { id: 5, agencyName: 'Next Level Up', email: 'billing-assistant@nextleveluplcc.com' },
  { id: 6, agencyName: 'Inner Strength', email: 'billing-assistant@innerstrengthin.com' }
].map((a, i) => ({ ...a, agencyId: [2, 6, 377][i], displayName: `${a.agencyName} Billing Assistant`, subrole: 'billing', status: 'active', privacyPolicy: {}, capabilities: ['billing.submit_ready'] }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { accounts, agencies: [], catalog: [], proposals: [], changes: [] } });
  api.patch.mockResolvedValue({ data: { ok: true } });
});

describe('owner password links', () => {
  it.each(accounts)('opens the requested $agencyName account directly', async account => {
    const wrapper = mount(Teams, { global: { provide: { [routeLocationKey]: { query: { passwordAccount: String(account.id) } } }, stubs: { RouterLink: true, AssistantBillingRules: true } } });
    await flushPromises();
    const panel = wrapper.find('.password-panel');
    expect(panel.text()).toContain(account.email);
    expect(panel.findAll('input[type="password"]')).toHaveLength(2);
    expect(api.patch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('changes only the password through the owner endpoint, then clears both fields', async () => {
    const wrapper = mount(PasswordSetup, { props: { account: accounts[0] } });
    const fields = wrapper.findAll('input');
    await fields[0].setValue('UniquePasswordForOwner9!');
    await fields[1].setValue('UniquePasswordForOwner9!');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/assistant-accounts/4', { newPassword: 'UniquePasswordForOwner9!', reason: 'Owner set the assistant account password.' });
    expect(fields.every(f => f.element.value === '')).toBe(true);
    expect(wrapper.text()).toContain('Password saved.');
    expect(wrapper.emitted('saved')).toHaveLength(1);
    wrapper.unmount();
  });

  it('blocks mismatched passwords and clears secrets when the selected account changes', async () => {
    const route = reactive({ query: { passwordAccount: '4' } });
    const wrapper = mount(Teams, { global: { provide: { [routeLocationKey]: route }, stubs: { RouterLink: true, AssistantBillingRules: true } } });
    await flushPromises();
    const fields = wrapper.find('.password-panel').findAll('input');
    await fields[0].setValue('UniquePasswordForOwner9!');
    await fields[1].setValue('AnotherUniquePassword9!');
    await wrapper.find('.password-panel form').trigger('submit.prevent');
    expect(wrapper.find('.password-panel [role="alert"]').text()).toContain('do not match');
    expect(api.patch).not.toHaveBeenCalled();
    route.query.passwordAccount = '5';
    await flushPromises();
    expect(wrapper.find('.password-panel').text()).toContain(accounts[1].email);
    expect(wrapper.find('.password-panel input').element.value).toBe('');
    wrapper.unmount();
  });
});
