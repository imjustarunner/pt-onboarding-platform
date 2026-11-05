import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
const state = vi.hoisted(() => ({ user: { role: 'admin' } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ get user() { return state.user; } }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: null }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'test' } }) }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import api from '../../services/api';
import Billing from '../../components/admin/ProviderBillingSettings.vue';
const data = () => ({ selfPayOnly: false, services: [{ serviceId: 10, name: 'Individual Counseling', businessType: 'mental_health', durationMinutes: 50, agencyRate: { rateCents: 12000, rateUnit: 'hour' }, providerRate: null, catalogRateCents: 10000 }] });
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
async function open(props = {}) {
  const wrapper = mount(Billing, { props: { providerId: 9, agencyId: 1, ...props }, global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises(); return wrapper;
}
beforeEach(() => { vi.clearAllMocks(); state.user = { role: 'admin' }; api.get.mockResolvedValue({ data: data() }); api.put.mockResolvedValue({ data: data() }); });
describe('provider billing rates', () => {
  it('shows missing-code guidance once and keeps unavailable clinical services out of the legacy rate editor', async () => {
    const notice = 'Link this service to an active practice service code in Settings → Service codes, then manage its rate in Billing → Fee schedules → Self-pay.';
    api.get.mockResolvedValue({ data: { selfPayOnly: false, services: [
      { serviceId: 32, canonicalFeeSchedule: true, canonicalServiceAvailable: false, canonicalServiceNotice: notice },
      { serviceId: 34, canonicalFeeSchedule: true, canonicalServiceAvailable: false, canonicalServiceNotice: ` ${notice} ` },
      { serviceId: 37, canonicalFeeSchedule: true, canonicalServiceAvailable: true, canonicalServiceNotice: null }
    ] } });
    const w = await open();
    expect(w.findAll('.clinical-service-notice')).toHaveLength(1);
    expect(w.find('.clinical-service-notice').text()).toBe(notice);
    expect(w.find('tbody').exists()).toBe(false);
    expect(button(w, 'Save Changes')).toBeUndefined();
    api.get.mockResolvedValue({ data: { selfPayOnly: false, services: [{ serviceId: 32, canonicalFeeSchedule: true, canonicalServiceAvailable: true }] } });
    await w.setProps({ agencyId: 2 }); await flushPromises();
    expect(w.find('.clinical-service-notice').exists()).toBe(false);
    w.unmount();
  });
  it('routes clinical rates to the canonical fee schedule and keeps the legacy editor limited to nonclinical services',async()=>{
    api.get.mockResolvedValue({data:{...data(),services:[...data().services,{serviceId:32,serviceCode:'90832',name:'Clinical service',businessType:'clinical',canonicalFeeSchedule:true}]}});
    const w=await open();
    const clinicalLink=w.findAllComponents(RouterLinkStub).find(item=>item.props('to')?.query?.billingSection==='fee-schedules');
    expect(clinicalLink.props('to')).toEqual({path:'/test/admin/medical-billing',query:{agencyId:'1',billingScope:'1',billingSection:'fee-schedules',feeMode:'self_pay',feeScope:'provider',feeProviderId:'9'}});
    expect(w.findAll('tbody tr')).toHaveLength(1);expect(w.find('tbody').text()).not.toContain('90832');expect(w.find('tbody').text()).toContain('Individual Counseling');
    await button(w,'Save Changes').trigger('click');await flushPromises();expect(api.put.mock.calls[0][1].rates.map(rate=>rate.serviceId)).toEqual([10]);w.unmount();
  });
  it('deep-links agency clinical defaults without attaching a provider override',async()=>{
    api.get.mockResolvedValue({data:{selfPayOnly:true,services:[{serviceId:32,serviceCode:'90832',canonicalFeeSchedule:true}]}});const w=await open({providerId:0,agencyId:3});
    const link=w.findAllComponents(RouterLinkStub).find(item=>item.props('to')?.query?.billingSection==='fee-schedules');expect(link.props('to').query).toMatchObject({agencyId:'3',billingScope:'3',feeScope:'practice',feeProviderId:undefined});expect(w.find('tbody').exists()).toBe(false);w.unmount();
  });
  it('keeps self-pay-only practice controls usable when every clinical rate moved to the canonical schedule',async()=>{
    const clinical={selfPayOnly:false,services:[{serviceId:32,serviceCode:'90832',canonicalFeeSchedule:true}]};api.get.mockResolvedValue({data:clinical});api.put.mockResolvedValue({data:{...clinical,selfPayOnly:true}});
    const w=await open({providerId:0,agencyId:3});expect(button(w,'Save Changes').attributes('disabled')).toBeUndefined();
    await w.find('input[type=checkbox]').setValue(true);await button(w,'Save Changes').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/tenant-booking/agencies/3/self-pay-rates',{selfPayOnly:true,rates:[]});expect(w.find('input[type=checkbox]').element.checked).toBe(true);w.unmount();
  });
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
    expect(w.text()).toContain('Unable to load'); expect(button(w, 'Save Changes')).toBeUndefined(); expect(api.put).not.toHaveBeenCalled(); w.unmount();
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
