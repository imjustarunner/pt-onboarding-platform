import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Appointments from '../GuardianAppointmentsPanel.vue';
import Preference from '../GuardianPaymentPreference.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const appointment=()=>({id:40,startAt:'2030-01-01T16:00:00Z',timeZone:'America/Denver',status:'scheduled',providerName:'Provider',modality:'VIDEO',requests:[]});
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[appointment()]}:{channels:{email:true,sms:false}}}));});
it('requires a reason and requests provider approval for rescheduling',async()=>{
 api.post.mockResolvedValue({data:{pending:true}});
 const w=mount(Appointments,{props:{clientId:8},global:{stubs:{GuardianClinicalBooking:true}}});await flushPromises();await w.findAll('.appointment-actions button')[0].trigger('click');const form=w.find('article form');expect(form.find('button:not([type=button])').attributes('disabled')).toBeDefined();await form.find('textarea').setValue('School activity');await form.trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/40/requests',expect.objectContaining({type:'reschedule',reason:'School activity'}));expect(w.text()).toContain('provider approval');w.unmount();
});
it('shows the other guardian’s request and prevents duplicate requests',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[{...appointment(),requests:[{id:1,type:'reschedule',status:'pending',requestedBy:'Parent Two',reason:'School activity'}]}]}:{channels:{email:true,sms:false}}}));
 const w=mount(Appointments,{props:{clientId:8}});await flushPromises();expect(w.text()).toContain('Parent Two requested rescheduling');expect(w.text()).toContain('School activity');expect(w.find('form').exists()).toBe(false);w.unmount();
});
it('clears another child’s appointment data while the new child loads',async()=>{
 let resolve;api.get.mockImplementation(url=>url.includes('/clients/9/appointments')?new Promise(r=>resolve=r):Promise.resolve({data:url.endsWith('/appointments')?{appointments:[appointment()]}:{channels:{email:true,sms:false}}}));const w=mount(Appointments,{props:{clientId:8}});await flushPromises();await w.setProps({clientId:9});expect(w.find('article').exists()).toBe(false);resolve({data:{appointments:[]}});await flushPromises();expect(w.find('article').exists()).toBe(false);w.unmount();
});
it('preview never exposes live appointments or offers a change',async()=>{const w=mount(Appointments,{props:{clientId:8,preview:true}});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('form').exists()).toBe(false);w.unmount();});
it('saves a payment proposal without creating a payment or changing allocation',async()=>{
 api.get.mockResolvedValue({data:{preference:null}});api.put.mockResolvedValue({data:{success:true}});const w=mount(Preference,{props:{clientId:8,agencyId:2}});await flushPromises();await w.find('select').setValue('alternate');await w.find('textarea').setValue('Please review');await w.find('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/family-billing/payment-preference',expect.objectContaining({clientId:8,agencyId:2,arrangement:'alternate',notes:'Please review'}));expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('current payment agreement is unchanged');w.unmount();
});
