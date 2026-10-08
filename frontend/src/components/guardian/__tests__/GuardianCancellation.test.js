import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api.js';
import Panel from '../GuardianAppointmentsPanel.vue';
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[{id:1,startAt:'2099-10-10 16:00:00',status:'scheduled',requests:[]}]}:{channels:{email:true,sms:false}}}));api.post.mockResolvedValue({data:{cancelledCount:2}});});
it('requires confirmation and sends the selected series scope to immediate cancellation',async()=>{
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();
 const form=w.find('article form');await form.find('textarea').setValue('Changing our schedule');
 await form.findAll('select')[1].setValue('future');
 expect(form.find('button').attributes('disabled')).toBeDefined();
 await form.find('input[type=checkbox]').setValue(true);await form.trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/1/cancel',expect.objectContaining({scope:'future',confirmed:true}));expect(w.text()).toContain('Cancellation confirmed');w.unmount();
});
it('keeps provider approval for rescheduling and disables preview mutations',async()=>{
 const w=mount(Panel,{props:{clientId:8}});await flushPromises();
 const form=w.find('article form');await form.find('select').setValue('reschedule');await form.find('textarea').setValue('Request another day');await form.trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/1/requests',expect.objectContaining({type:'reschedule'}));w.unmount();
 const preview=mount(Panel,{props:{clientId:8,preview:true}});await flushPromises();expect(preview.find('form').exists()).toBe(false);preview.unmount();
});
