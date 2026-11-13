import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api.js';
import Panel from '../GuardianAppointmentsPanel.vue';
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async url=>({data:url.includes('/cancellations/')?{cancellation:{id:'operation-1',status:'completed',count:2,completed:2,endsService:false}}:url.endsWith('/appointments')?{appointments:[{id:1,startAt:'2099-10-10 16:00:00',status:'scheduled',isRecurring:true,requests:[]}]}:{channels:{email:true,sms:false}}}));api.post.mockImplementation(async url=>({data:url.endsWith('cancel-preview')?{scope:'future',count:2,endsService:false,reviewToken:'review-1',fees:[{appointmentId:1,policyId:3,feeCents:8000,startAt:'2099-10-10T16:00:00Z',noticeHours:24,policyName:'Service policy'}],totalFeeCents:8000}:{cancellation:{id:'operation-1',status:'queued',count:2,endsService:false}}}));});
it('requires confirmation of the complete series through the client cancellation dialog',async()=>{
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();await w.findAll('.appointment-actions button')[1].trigger('click');
 const dialog=w.get('dialog');await dialog.get('input[value=future]').setValue(true);await dialog.findAll('button').find(b=>b.text()==='Continue').trigger('click');
 await dialog.get('select').setValue('Scheduling conflict');await dialog.findAll('button').find(b=>b.text()==='Review dates and fees').trigger('click');await flushPromises();
 expect(w.text()).toContain('$80.00');expect(api.post.mock.calls).toHaveLength(1);await dialog.get('input[type=checkbox]').setValue(true);
 await dialog.findAll('button').find(b=>b.text()==='Confirm cancellation').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/1/cancel',expect.objectContaining({scope:'future',confirmed:true,requestVersion:2,reviewToken:'review-1'}));
 expect(w.text()).toContain('2 appointment(s) canceled');w.unmount();
});
it('keeps provider approval for rescheduling and disables preview mutations',async()=>{
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();
 await w.findAll('.appointment-actions button')[0].trigger('click');const form=w.find('article form');await form.find('select').setValue('reschedule');await form.find('textarea').setValue('Request another day');await form.trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/1/requests',expect.objectContaining({type:'reschedule'}));w.unmount();
 const preview=mount(Panel,{props:{clientId:8,preview:true}});await flushPromises();expect(preview.find('form').exists()).toBe(false);preview.unmount();
});

it('offers ending the service after two cancellations without doing it automatically',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[{id:1,startAt:'2099-10-10T16:00:00Z',status:'scheduled',isRecurring:true,providerName:'Michael',requests:[],cancellationHint:{showEndServices:true,cancelledCount:2}}]}:{channels:{email:true,sms:false}}}));
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();expect(w.get('.cancellation-suggestion').text()).toContain('two appointments');expect(api.post).not.toHaveBeenCalled();
 await w.get('.cancellation-suggestion button').trigger('click');expect(w.get('input[value=end_services]').element.checked).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('keeps the service-ending option available from canceled history after all visible dates were canceled',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[{id:1,startAt:'2026-01-01T16:00:00Z',status:'canceled_by_client',isRecurring:true,canEndServices:true,providerName:'Michael',requests:[],cancellationHint:{showEndServices:true,cancelledCount:6}}]}:{channels:{email:true,sms:false}}}));
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();expect(w.find('.appointment-actions').exists()).toBe(false);
 await w.get('.cancellation-suggestion button').trigger('click');expect(w.get('input[value=end_services]').element.checked).toBe(true);w.unmount();
});
