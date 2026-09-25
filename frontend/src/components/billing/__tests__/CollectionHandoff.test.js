import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Handoff from '../CollectionHandoff.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const workspace = () => ({ enabled: true, canEscalate: true, agreements: [{ id: 1, managingAgencyName: 'Management Company', feeBasisPoints: 2500, eligibilityDays: 60 }], cases: [] });
const balances = [1,2].map(allocationId => ({ allocationId, clientId: 10, payerUserId: 20, payerName: 'Synthetic Payer', status: 'open', balanceCents: 5000, dueDate: '2026-01-01', serviceDate: '2026-01-01' }));
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: workspace() }); });
describe('management collection handoff', () => {
  it('does not expose a transfer form without collections permission', async () => {
    api.get.mockResolvedValue({ data: { enabled: false } });
    const wrapper = mount(Handoff, { props: { agencyId: 1, balances } });
    await flushPromises(); expect(wrapper.find('form').exists()).toBe(false); wrapper.unmount();
  });
  it('groups only eligible outstanding items for one client and payer', async () => {
    const wrapper = mount(Handoff, { props: { agencyId: 1, balances: [...balances,
      { ...balances[0], allocationId: 3, externallyManaged: true },
      { ...balances[0], allocationId: 4, plan: { status: 'active' } },
      { ...balances[0], allocationId: 5, dueDate: '2099-01-01' },
      { ...balances[0], allocationId: 6, pendingPaymentId: 7 }] } });
    await flushPromises(); await wrapper.findAll('select')[0].setValue(1);
    await wrapper.findAll('select')[1].setValue('10:20');
    expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(2);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined(); wrapper.unmount();
  });
  it('keeps the retry reference after a network failure and sends the reviewed amount', async () => {
    api.post.mockRejectedValue(new Error('Network failure'));
    const wrapper = mount(Handoff, { props: { agencyId: 1, balances } });
    await flushPromises(); await wrapper.findAll('select')[0].setValue(1);
    await wrapper.findAll('select')[1].setValue('10:20');
    for (const checkbox of wrapper.findAll('input[type=checkbox]')) await checkbox.setValue(true);
    await wrapper.find('textarea').setValue('123 Synthetic Street');
    await wrapper.find('form').trigger('submit'); await flushPromises();
    const first = api.post.mock.calls[0][1];
    expect(first).toEqual(expect.objectContaining({ agencyId: 1, allocationIds: [1,2], expectedAmountCents: 10000 }));
    await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(api.post.mock.calls[1][1].idempotencyKey).toBe(first.idempotencyKey);
    expect(wrapper.emitted('transferred')).toBeUndefined(); wrapper.unmount();
  });
  it('shows the transfer snapshot separately from the current outstanding amount', async () => {
    api.get.mockResolvedValueOnce({ data: { ...workspace(), canEscalate: false, cases: [{ id: 4, agencyName: 'Origin Agency', managingAgencyName: 'Management Company', transferredAmountCents: 10000, status: 'active' }] } });
    api.get.mockResolvedValueOnce({ data: { caseId: 4, outstandingCents: 6000, transferredAmountCents: 10000,
      transferredAt: '2026-09-25', collectionBlocked: true, currentItems: [], currentHistory: { payments: [], refunds: [], communications: [] },
      packet: { responsibleParty: { name: 'Synthetic Payer', mailingAddress: '123 Test Street' }, clientName: 'Synthetic Client', serviceItems: [] } } });
    const wrapper = mount(Handoff, { props: { agencyId: 2, balances: [] } });
    await flushPromises(); await wrapper.find('button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('$60.00 outstanding'); expect(wrapper.text()).toContain('$100.00 transferred');
    expect(wrapper.text()).toContain('Collection is paused'); wrapper.unmount();
  });
});
