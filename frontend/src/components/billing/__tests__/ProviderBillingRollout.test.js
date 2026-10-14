import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import ProviderBillingRollout from '../ProviderBillingRollout.vue';
const policy = { revision: 2, entries: [{ providerUserId: 12, payerId: 'COCHA', status: 'active', startDate: '2026-10-15', routingVerified: true, requiresSupervision: true, supervisorUserId: 30, reference: 'Reviewed setup' }] };
const props = canManage => ({ fetchPolicy: vi.fn(async () => ({ policy, canManage, providers: [{ id: 12, name: 'Example Intern' }, { id: 30, name: 'Example Supervisor' }] })), saveEntry: vi.fn(async () => ({ policy: { ...policy, revision: 3 } })) });
describe('optional provider billing transitions', () => {
  it('loads report and credentialing setup without inventing a cutover or verifying routing', async () => {
    const p = props(true);
    p.fetchPolicy.mockResolvedValue({ policy, canManage: true, providers: [{ id: 12, name: 'Example Intern' }], evidence: { pairs: [
      { providerUserId: 12, payerName: 'Colorado Access', payerId: null, requiresSupervision: true, supervisorUserId: 30,
        reportLines: 3, paidReportLines: 2, lastServiceDate: '2026-10-01', credentials: [], billingGroups: [] }
    ] } });
    const w = mount(ProviderBillingRollout, { props: p }); await w.vm.load(); await flushPromises();
    expect(w.text()).toContain('3 report lines'); expect(w.text()).toContain('Electronic payer ID needs verification');
    await w.findAll('button').find(b => b.text() === 'Use existing setup').trigger('click');
    expect(w.vm.form).toMatchObject({ providerUserId: 12, payerName: 'Colorado Access', supervisorUserId: 30, payerId: '', startDate: '', routingVerified: false, cutoverReviewed: false, status: 'draft' });
    expect(p.saveEntry).not.toHaveBeenCalled(); w.unmount();
  });
  it('lets billers inspect transitions without granting administrative activation', async () => {
    const p = props(false), w = mount(ProviderBillingRollout, { props: p });
    await w.vm.load(); await flushPromises();
    expect(w.text()).toContain('Example Intern'); expect(w.find('form').exists()).toBe(false);
    expect(p.saveEntry).not.toHaveBeenCalled(); w.unmount();
  });
  it('requires a fresh cutover acknowledgement when an administrator reviews an existing entry', async () => {
    const p = props(true), w = mount(ProviderBillingRollout, { props: p });
    await w.vm.load(); await flushPromises(); w.vm.edit(policy.entries[0]); await flushPromises();
    expect(w.vm.form.cutoverReviewed).toBe(false);
    w.vm.form.cutoverReviewed = true; await w.vm.save(); await flushPromises();
    expect(p.saveEntry).toHaveBeenCalledWith(expect.objectContaining({ providerUserId: 12, payerId: 'COCHA', revision: 2, supervisorUserId: 30, cutoverReviewed: true }));
    expect(w.vm.form.cutoverReviewed).toBe(false); w.unmount();
  });
  it('shows a stale-edit error without claiming the policy was saved', async () => {
    const p = props(true); p.saveEntry.mockRejectedValue(new Error('The rollout changed. Reload before saving.'));
    const w = mount(ProviderBillingRollout, { props: p }); await w.vm.load(); w.vm.edit(policy.entries[0]); await w.vm.save(); await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('Reload'); expect(w.find('[role="status"]').exists()).toBe(false); w.unmount();
  });
});
