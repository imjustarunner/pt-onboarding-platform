import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingRulesSettings from '../BillingRulesSettings.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, agencies: [] }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/admin/settings', query: { agencyId: '2' } }) }));

const rules = {
  tiers: [
    { id: 'qbha', label: 'QBHA', detail: 'Community codes.' },
    { id: 'bachelors', label: "Bachelor's", detail: 'No codes that start with 9.' },
    { id: 'intern_plus', label: 'Intern, prelicensed, and fully licensed', detail: 'Catalog except opt-in codes.' }
  ],
  codes: [
    {
      code: 'H0002',
      description: 'Behavioral health screening',
      optIn: true,
      tiers: { qbha: false, bachelors: false, intern_plus: false },
      sources: { qbha: 'colorado_default', bachelors: 'colorado_default', intern_plus: 'colorado_default' }
    },
    {
      code: '90837',
      description: 'Psychotherapy, 60 minutes',
      optIn: false,
      tiers: { qbha: false, bachelors: false, intern_plus: true },
      sources: { qbha: 'colorado_default', bachelors: 'colorado_default', intern_plus: 'colorado_default' }
    }
  ],
  providers: [
    { id: 8, name: 'Aneta Czepiel', credential: 'MSW, LSW', tier: 'intern_plus', grants: ['H0002'] },
    { id: 20, name: 'Other Clinician', credential: 'LPC', tier: 'intern_plus', grants: [] }
  ]
};

describe('billing rules settings', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.get.mockResolvedValue({ data: rules });
  });

  it('lists Colorado defaults and leaves H0002 on only for the granted provider', async () => {
    const wrapper = mount(BillingRulesSettings, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(wrapper.text()).toContain('Colorado defaults');
    expect(wrapper.text()).toContain('90837');
    expect(wrapper.text()).toContain('Aneta Czepiel');
    const aneta = wrapper.findAll('tbody tr').find((row) => row.text().includes('Aneta Czepiel'));
    const other = wrapper.findAll('tbody tr').find((row) => row.text().includes('Other Clinician'));
    expect(aneta.find('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(other.find('[role="switch"]').attributes('aria-checked')).toBe('false');
    wrapper.unmount();
  });

  it('saves a provider exception for H0002', async () => {
    api.put.mockResolvedValue({ data: rules });
    const wrapper = mount(BillingRulesSettings, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    const other = wrapper.findAll('tbody tr').find((row) => row.text().includes('Other Clinician'));
    await other.find('[role="switch"]').trigger('click');
    expect(api.put).toHaveBeenCalledWith('/medical-billing/billing-rules/provider-grant', {
      agencyId: 2,
      userId: 20,
      serviceCode: 'H0002',
      enabled: true
    });
    wrapper.unmount();
  });
});
