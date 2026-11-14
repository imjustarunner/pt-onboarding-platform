import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Booking from '../GuardianClinicalBooking.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../composables/usePortalCareApi',()=>({usePortalCareApi:()=>m}));
vi.mock('../../../composables/useFamilyLocale',()=>({useFamilyLocale:()=>({ft:t=>t,locale:{value:'en-US'}})}));
const terms={sessionFeeCents:5000,noticeHours:24,lateFeeCents:0,noShowFeeCents:0};
const choice={providerId:1496,providerName:'Finley',serviceId:320,serviceName:'Tutoring',modality:'TELEHEALTH',terms,packages:[{id:180,name:'Saved four visits',sessionsAvailable:4,freeMissesRemaining:0}]};
const slot={startAt:'2030-01-08T17:00:00.000Z',endAt:'2030-01-08T18:00:00.000Z',modality:'VIRTUAL',roomId:null};
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
beforeEach(()=>{vi.resetAllMocks();m.get.mockImplementation(async url=>({data:url.endsWith('/slots')?{choice,slots:[slot],timeZone:'America/Denver'}:{choices:[choice]}}));m.post.mockResolvedValue({data:{appointmentId:300,startAt:slot.startAt}});});
it('sends the chosen existing entitlement with booking, without purchasing or collecting a card',async()=>{
 const w=mount(Booking,{props:{learning:true,agencyId:453,clientId:2545,serviceId:2}});await flushPromises();
 await button(w,'Book a session').trigger('click');await flushPromises();
 await w.findAll('select')[1].setValue('180');await w.get('input[type=radio]').setValue();await w.get('input[type=checkbox]').setValue(true);
 expect(w.text()).toContain('One session from your selected package');
 await w.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledTimes(1);expect(m.post).toHaveBeenCalledWith('/guardian-portal/clients/2545/session-booking',expect.objectContaining({packageEntitlementId:180,providerId:1496,confirmed:true}));w.unmount();
});
it('clears the package when the selected family/service changes',async()=>{
 const w=mount(Booking,{props:{learning:true,agencyId:453,clientId:2545,serviceId:2}});await flushPromises();await button(w,'Book a session').trigger('click');await flushPromises();
 await w.findAll('select')[1].setValue('180');await w.setProps({clientId:2547,serviceId:3});await flushPromises();await button(w,'Book a session').trigger('click');await flushPromises();
 expect(w.findAll('select')[1].element.selectedOptions[0]._value).toBeNull();expect(m.post).not.toHaveBeenCalled();w.unmount();
});
