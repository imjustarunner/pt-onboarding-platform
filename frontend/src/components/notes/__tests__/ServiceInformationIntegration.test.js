import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import AppointmentHeaderFields from '../../schedule/AppointmentHeaderFields.vue';
import MedicalBillingView from '../../../views/admin/MedicalBillingView.vue';
import ServiceInformation from '../ServiceInformation.vue';
const api=vi.hoisted(()=>({get:vi.fn(async path=>({data:path.endsWith('/status')?{flags:{medicalBillingEnabled:true},claimMd:{configured:false}}:{items:[]}}))}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:7,slug:'practice'}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'support',billingAgencyIds:[7]}})}));
const reference={code:'H2011',title:'Crisis intervention',status:'available',serviceDescription:'Immediate crisis services.',documentation:'Describe the crisis and interventions.',source:{title:'Supplied handbook',effectiveDate:'2026-10-01',pages:[77]}};

describe('handbook service details at the point of selection',()=>{
  it('shows the selected booking service reference without changing billing values or fetching another agency',async()=>{
    const w=mount(AppointmentHeaderFields,{props:{agencyId:7,showPrimaryServiceCode:true,primaryServiceCode:'H2011',primaryServiceCodeOptions:[{code:'H2011',label:'Crisis intervention',serviceInfo:reference}]}});
    expect(w.findComponent(ServiceInformation).props()).toMatchObject({agencyId:7,serviceCode:'H2011',serviceInfo:reference});
    expect(w.text()).toContain('Immediate crisis services.');expect(w.emitted('update:primaryServiceCode')).toBeUndefined();
    await w.setProps({primaryServiceCode:'H0004',primaryServiceCodeOptions:[{code:'H0004',label:'Behavioral health',serviceInfo:{...reference,code:'H0004',serviceDescription:'Current H0004 reference.'}}]});
    expect(w.text()).toContain('Current H0004 reference.');expect(w.text()).not.toContain('Immediate crisis services.');w.unmount();
  });
  it('passes the current agency and edited service reference into billing settings without altering its rule fields',async()=>{
    const w=shallowMount(MedicalBillingView,{props:{billingAgencyId:7,serviceCodesOnly:true},global:{stubs:{RouterLink:true}}});await flushPromises();
    const state=w.vm.$.setupState;state.serviceCodes=[{id:2,service_code:'H2011',serviceInfo:reference}];state.svcForm.serviceCode='H2011';state.svcForm.unitMinutes=15;await flushPromises();
    expect(w.findComponent(ServiceInformation).props()).toMatchObject({agencyId:7,serviceCode:'H2011',serviceInfo:reference});expect(state.svcForm.unitMinutes).toBe(15);w.unmount();
  });
});
