import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const state = vi.hoisted(() => ({ user: { role: 'admin' } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ get user() { return state.user; } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'test' } }) }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import api from '../../services/api';
import Billing from '../../components/admin/ProviderBillingSettings.vue';
const data = () => ({ selfPayOnly: false, services: [{ serviceId: 10, name: 'Individual Counseling', businessType: 'mental_health', durationMinutes: 50, agencyRate: { rateCents: 12000, rateUnit: 'hour' }, providerRate: null, catalogRateCents: 10000 }] });
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
async function open(props = {}) {
  const wrapper = mount(Billing, { props: { providerId: 9, agencyId: 1, ...props }, global: { stubs: { RouterLink: true } } });
  await flushPromises(); return wrapper;
}
beforeEach(() => { vi.clearAllMocks(); state.user = { role: 'admin' }; api.get.mockResolvedValue({ data: data() }); api.put.mockResolvedValue({ data: data() }); });
describe('provider billing rates', () => {
  it('hides settings and makes no requests for providers even with billing access', async () => {
    state.user = { role: 'provider', billingAgencyIds: [1] };
    const w = await open(); expect(w.find('section').exists()).toBe(false); expect(api.get).not.toHaveBeenCalled(); w.unmount();
  });
  it('saves a free hourly override as zero and clears it as null', async () => {
    const w = await open();
    expect(w.text()).toContain('Individual Counseling'); expect(w.text()).not.toContain('Tutoring');
    await w.find('tbody input[type=checkbox]').setValue(false);
    await w.find('input[type=number]').setValue('0');
    await button(w, 'Save Changes').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenLastCalledWith('/tenant-booking/agencies/1/providers/9/self-pay-rates', { rates: [{ serviceId: 10, rateCents: 0, rateUnit: 'hour' }] });
    await button(w, 'Save Changes').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenLastCalledWith('/tenant-booking/agencies/1/providers/9/self-pay-rates', { rates: [{ serviceId: 10, rateCents: null, rateUnit: 'hour' }] }); w.unmount();
  });
  it('saves agency defaults and self-pay-only mode through the agency endpoint', async () => {
    const w = await open({ providerId: 0 });
    await w.find('input[type=checkbox]').setValue(true);
    await w.find('input[type=number]').setValue('140');
    await button(w, 'Save Changes').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/tenant-booking/agencies/1/self-pay-rates', { selfPayOnly: true, rates: [{ serviceId: 10, rateCents: 14000, rateUnit: 'hour' }] }); w.unmount();
  });
  it('does not allow saving an unloaded rate sheet', async () => {
    api.get.mockRejectedValue(new Error('Offline')); const w = await open();
    expect(w.text()).toContain('Unable to load'); expect(button(w, 'Save Changes').attributes('disabled')).toBeDefined(); expect(api.put).not.toHaveBeenCalled(); w.unmount();
  });
  it('lets the agency set different self-pay prices per clinical code without changing insurance prices', async () => {
    api.get.mockResolvedValue({ data: { selfPayOnly: true, services: [
      { serviceId: 32, serviceCode: '90832', name: 'Psychotherapy, 30 minutes', businessType: 'clinical', durationMinutes: 30, catalogRateCents: 12000, agencyRate: null },
      { serviceId: 34, serviceCode: '90834', name: 'Psychotherapy, 45 minutes', businessType: 'clinical', durationMinutes: 45, catalogRateCents: 12000, agencyRate: null },
      { serviceId: 37, serviceCode: '90837', name: 'Psychotherapy, 60 minutes', businessType: 'clinical', durationMinutes: 60, catalogRateCents: 12000, agencyRate: null }
    ] } });
    const w = await open({ providerId: 0 });
    expect(w.text()).toContain('90832'); expect(w.text()).toContain('90834'); expect(w.text()).toContain('90837');
    const inputs = w.findAll('input[type=number]');
    await inputs[0].setValue('60'); await inputs[1].setValue('90'); await inputs[2].setValue('120');
    await button(w, 'Save Changes').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/tenant-booking/agencies/1/self-pay-rates', { selfPayOnly: true, rates: [
      { serviceId: 32, rateCents: 6000, rateUnit: 'session' }, { serviceId: 34, rateCents: 9000, rateUnit: 'session' }, { serviceId: 37, rateCents: 12000, rateUnit: 'session' }
    ] });
    w.unmount();
  });
});
