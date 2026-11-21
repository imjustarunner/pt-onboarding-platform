import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import api from '../../../services/api.js';
import FamilyCostEstimates from '../FamilyCostEstimates.vue';
import StaffCostEstimates from '../StaffCostEstimates.vue';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn() } }));
enableAutoUnmount(afterEach);

const summary = {
  id: 12, title: 'Good Faith Estimate', clientName: 'Example Client', startDate: '2026-10-21',
  endDate: '2026-12-01', totalCents: 60000, missing: []
};
const preview = {
  id: 12, status: 'issued', acknowledgmentText: 'I acknowledge receiving this estimate.',
  presentation: {
    summaryLabel: 'Six-session expense', servicePeriod: 'Oct 21, 2026 – Dec 1, 2026',
    disclosures: ['You can keep a copy of this estimate.']
  },
  snapshot: {
    ...summary,
    agency: { name: 'Example Agency' }, patient: { name: 'Example Client' },
    provider: { name: 'Example Clinician' }, location: {},
    lines: [{ serviceCode: '90837', description: 'Extended session', quantity: 6, amountCents: 10000, totalCents: 60000 }]
  }
};

describe('formatted cost estimate', () => {
  it('lets the family see the actual rate and total before acknowledging receipt', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { estimates: [summary] } }).mockResolvedValueOnce({ data: preview });
    const wrapper = mount(FamilyCostEstimates, { props: { agencyId: 2, clientId: 8 } });
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Review estimate').trigger('click');
    await flushPromises();
    expect(wrapper.get('.estimate-total').text()).toContain('Six-session expense');
    expect(wrapper.get('.estimate-amount').text()).toBe('$600.00');
    expect(wrapper.get('tbody').get('tr').findAll('td').slice(3).map(cell => cell.text())).toEqual(['6', '$100.00', '$600.00']);
    expect(wrapper.text()).toContain('Acknowledge receipt');
  });

  it('lets billing preview an unissued draft in the same format', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { rates: [], offices: [] } })
      .mockResolvedValueOnce({ data: { estimates: [{ ...summary, status: 'draft' }] } })
      .mockResolvedValueOnce({ data: { ...preview, status: 'draft' } });
    const wrapper = mount(StaffCostEstimates, {
      props: { agencyId: 2 }, global: { directives: { addressAutocomplete: () => {} } }
    });
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Preview estimate').trigger('click');
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/family-cost-estimates/staff/12', { params: { agencyId: 2 } });
    expect(wrapper.get('.draft').text()).toBe('Draft for billing review');
    expect(wrapper.get('.estimate-amount').text()).toBe('$600.00');
  });
});
