import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import Panel from '../BankFeedPanel.vue';
import api from '../../../services/api';
import { loadStripe } from '@stripe/stripe-js';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }));
const data = { enabled: true, stripeConfigured: true, accounts: [{ id: 4, institution: 'Test Bank', name: 'Checking', status: 'active', syncEnabled: true }], verifications: [], nextAfter: null };
const props = { agencyId: 1, agencyName: 'Agency One' };
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data }); api.post.mockResolvedValue({ data: { sessionKey: 'server-session', clientSecret: 'synthetic-secret', publishableKey: 'pk_test_fake' } }); loadStripe.mockResolvedValue({ collectFinancialConnectionsAccounts: vi.fn().mockResolvedValue({ financialConnectionsSession: { accounts: [{ id: 'client-supplied-account' }] } }) }); });
describe('agency deposit verification', () => {
  it('requires owner consent and sends only the server-bound session on completion', async () => {
    const w = mount(Panel, { props }); await flushPromises();
    expect(button(w, 'Connect agency bank through Stripe').element.disabled).toBe(true);
    await w.find('input[type=checkbox]').setValue(true); await w.find('form').trigger('submit'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ agencyId: 1, ownerAuthorized: true });
    expect(api.post.mock.calls[1]).toEqual(['/medical-billing/bank-feeds/sessions/complete', { agencyId: 1, sessionKey: 'server-session' }]);
    expect(w.text()).not.toContain('synthetic-secret'); expect(w.text()).not.toContain('Imported bank transactions'); w.unmount();
  });
  it('does not complete a connection after the user switches agencies', async () => {
    let resolve; loadStripe.mockResolvedValue({ collectFinancialConnectionsAccounts: () => new Promise(r => { resolve = r; }) });
    const w = mount(Panel, { props }); await flushPromises(); await w.find('input[type=checkbox]').setValue(true); await w.find('form').trigger('submit'); await flushPromises();
    await w.setProps({ agencyId: 2, agencyName: 'Agency Two' }); await flushPromises();
    resolve({ financialConnectionsSession: { accounts: [{ id: 'other' }] } }); await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1); expect(w.text()).toContain('Agency Two'); w.unmount();
  });
  it('binds verification to the selected agency and account without supplying payer financial details', async () => {
    const w = mount(Panel, { props }); await flushPromises(); await button(w, 'View deposit checks').trigger('click'); await flushPromises();
    await w.find('input[maxlength="128"]').setValue('900'); await w.findAll('form')[1].trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/bank-feeds/4/verify-era', { agencyId: 1, eraId: '900', page: 1 }); w.unmount();
  });
});
