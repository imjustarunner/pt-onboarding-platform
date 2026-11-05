import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingPracticeSettings from '../BillingPracticeSettings.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, agencies: [] }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/admin/settings', query: { agencyId: '2' } }) }));

describe('billing practice settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.patch.mockResolvedValue({ data: {} });
    api.get.mockReset();
    api.get.mockResolvedValue({
      data: {
        billingOffices: [{
          id: 1, agency_id: 2, name: 'Windchime', practice_name: 'ITSCO, LLC', claim_facility_name: 'ITSCO, LLC',
          street_address: '437 Windchime Place', city: 'Colorado Springs', state: 'CO', postal_code: '80919',
          practice_npi: '1972246940', taxonomy_code: '101YP2500X'
        }],
        items: [
          { id: 27, name: 'Telehealth — patient home', place_of_service: '10', location_kind: 'office_pos', billing_office_location_id: 1 },
          { id: 80, name: 'Example School', place_of_service: '03', location_kind: 'school', billing_office_location_id: 1, street_address: '100 School Road', city: 'Denver', state: 'CO' }
        ],
        groupNpis: [
          { id: 1, npi_number: '1972246940', office_location_id: 1, label: 'Primary practice NPI' },
          { id: 2, npi_number: '1215615711', office_location_id: 1, notes: 'Payer override: Medicaid claims bill under this NPI' }
        ]
      }
    });
  });

  it('loads the seeded facility name and saves an override through the billing settings route', async () => {
    const wrapper = mount(BillingPracticeSettings, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    const field = wrapper.find('input[maxlength="35"]');
    expect(field.element.value).toBe('ITSCO, LLC');
    await field.setValue('Verified Facility LLC');
    await wrapper.findAll('button').find(button => button.text() === 'Save office').trigger('click');
    await flushPromises();
    expect(api.patch).toHaveBeenLastCalledWith('/medical-billing/billing-offices/1', expect.objectContaining({ agencyId:2, claimFacilityName:'Verified Facility LLC', practiceName:'ITSCO, LLC' }));
    await field.setValue('');
    await wrapper.findAll('button').find(button => button.text() === 'Save office').trigger('click');
    await flushPromises();
    expect(api.patch).toHaveBeenLastCalledWith('/medical-billing/billing-offices/1', expect.objectContaining({ claimFacilityName:'' }));
    expect(wrapper.text()).toContain('Leave blank to use the practice name');
    wrapper.unmount();
  });

  it('shows the billing office and keeps a school as a place of service', async () => {
    const wrapper = mount(BillingPracticeSettings, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(wrapper.findAll('input').map((input) => input.element.value)).toContain('437 Windchime Place');
    expect(wrapper.text()).toContain('1972246940');
    expect(wrapper.text()).toContain('Payer override');
    expect(wrapper.text()).toContain('Example School');
    expect(wrapper.text()).toContain('This street is not the billing address.');
    expect(wrapper.text()).toContain('Place of service');
    wrapper.unmount();
  });
});
