import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ServiceBillingSupervisors from '../ServiceBillingSupervisors.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { revision: 0, entries: [], supervisors: [{ id: 501, name: 'Billing Supervisor', credential: 'LPC' }] } }); });
describe('service billing supervision settings', () => {
  it('saves the selected service, dates and cosigner with the agency revision', async () => {
    const w = mount(ServiceBillingSupervisors, { props: { agencyId: 2, providerId: 8 } }); await flushPromises();
    await w.find('input[maxlength="5"]').setValue('H0002');
    await w.find('select').setValue('501');
    await w.findAll('input[type="date"]')[0].setValue('2026-10-14');
    await w.find('textarea').setValue('H0002 oversight');
    api.put.mockResolvedValue({ data: { revision: 1, entries: [{ serviceCode: 'H0002', supervisorUserId: 501, effectiveFrom: '2026-10-14' }] } });
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/medical-billing/service-supervisors', expect.objectContaining({ agencyId: 2, providerUserId: 8, supervisorUserId: 501, serviceCode: 'H0002', effectiveFrom: '2026-10-14', revision: 0 }));
    expect(w.text()).toContain('cosign before submission');
    w.unmount();
  });
  it('hides financial settings when access is denied', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    const w = mount(ServiceBillingSupervisors, { props: { agencyId: 2, providerId: 8 } }); await flushPromises();
    expect(w.find('form').exists()).toBe(false); w.unmount();
  });
  it('discards an old agency response after switching context', async () => {
    let first;
    api.get.mockImplementationOnce(() => new Promise(resolve => { first = resolve; }));
    const w = mount(ServiceBillingSupervisors, { props: { agencyId: 2, providerId: 8 } });
    await w.setProps({ agencyId: 6 }); await flushPromises();
    first({ data: { revision: 9, entries: [{ serviceCode: 'OLD01', effectiveFrom: '2026-10-14', supervisorUserId: 1 }], supervisors: [] } });
    await flushPromises(); expect(w.text()).not.toContain('OLD01'); w.unmount();
  });
});
