import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api.js';
import Dialog from '../GuardianCancellationDialog.vue';
let w;
const appointment={id:1,startAt:'2099-10-10T16:00:00Z',timeZone:'America/Denver',providerName:'Michael Mendez',status:'scheduled',isRecurring:true};
const preview={scope:'end_services',count:26,endsService:true,serviceLabel:'counseling',reviewToken:'review-1',totalFeeCents:8000,
 fees:[{appointmentId:1,startAt:appointment.startAt,timeZone:'America/Denver',policyName:'Counseling policy',noticeHours:48,cancelDeadlineAt:'2099-10-08T16:00:00Z',feeCents:8000,isLate:true}]};
beforeEach(()=>{vi.resetAllMocks();api.post.mockImplementation(async url=>({data:url.endsWith('cancel-preview')?preview:{cancellation:{id:'operation-1',status:'queued',count:26,completed:0,endsService:true}}}));api.get.mockResolvedValue({data:{cancellation:{id:'operation-1',status:'completed',count:26,completed:26,endsService:true}}});});
afterEach(()=>w?.unmount());
const button=text=>w.findAll('button').find(b=>b.text()===text);
async function review(){await button('Continue').trigger('click');await w.get('select').setValue('Changing provider or service');await w.get('textarea').setValue('Thank you for your care.');await button('Review dates and fees').trigger('click');await flushPromises();}
it('requires a reason, a full fee review, and explicit confirmation before ending the service',async()=>{
 w=mount(Dialog,{props:{clientId:8,appointment,initialScope:'end_services'}});
 await button('Continue').trigger('click');expect(button('Review dates and fees').attributes('disabled')).toBeDefined();
 await w.get('select').setValue('Changing provider or service');await w.get('textarea').setValue('Thank you for your care.');
 await button('Review dates and fees').trigger('click');await flushPromises();expect(w.text()).toContain('26 appointments');expect(w.text()).toContain('$80.00');expect(w.text()).toContain('48 hours');
 expect(w.get('blockquote em').text()).toBe('Thank you for your care.');
 expect(button('Cancel all future sessions and end services').attributes('disabled')).toBeDefined();expect(api.post.mock.calls).toHaveLength(1);
 await w.get('input[type=checkbox]').setValue(true);await button('Cancel all future sessions and end services').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/8/appointments/1/cancel',expect.objectContaining({requestVersion:2,scope:'end_services',reason:'Changing provider or service',personalNote:'Thank you for your care.',confirmed:true,reviewToken:'review-1',requestId:expect.any(String)}));
 expect(w.emitted('completed')[0][0]).toMatchObject({count:26,endsService:true});
});
it('lets the client choose only this appointment and keeps Other reasons required',async()=>{
 w=mount(Dialog,{props:{clientId:8,appointment}});expect(w.get('input[value=single]').element.checked).toBe(true);
 await button('Continue').trigger('click');await w.get('select').setValue('other');expect(button('Review dates and fees').attributes('disabled')).toBeDefined();
 await w.findAll('textarea')[0].setValue('My working hours changed');await button('Review dates and fees').trigger('click');await flushPromises();
 expect(api.post.mock.calls[0][1]).toMatchObject({scope:'single',reason:'My working hours changed'});
});
it('shows an escaped italic preview and clears consent when the client goes back to edit',async()=>{
 w=mount(Dialog,{props:{clientId:8,appointment}});await review();await w.get('input[type=checkbox]').setValue(true);await button('Back').trigger('click');
 await w.get('textarea').setValue('<script>alert(1)</script>');await button('Review dates and fees').trigger('click');await flushPromises();
 expect(w.get('input[type=checkbox]').element.checked).toBe(false);expect(w.find('script').exists()).toBe(false);expect(w.get('blockquote em').text()).toBe('<script>alert(1)</script>');
});
it('retries a lost confirmation response with the same request identity',async()=>{
 w=mount(Dialog,{props:{clientId:8,appointment,initialScope:'end_services'}});await review();await w.get('input[type=checkbox]').setValue(true);
 api.post.mockRejectedValueOnce(new Error('network lost'));await button('Cancel all future sessions and end services').trigger('click');await flushPromises();
 const first=api.post.mock.calls.at(-1)[1].requestId;await button('Cancel all future sessions and end services').trigger('click');await flushPromises();
 expect(api.post.mock.calls.at(-1)[1].requestId).toBe(first);
});
