import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api.js';
import Feedback from '../GuardianServiceExitFeedback.vue';
const props={clientId:8,operationId:'11111111-1111-4111-8111-111111111111'};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{submitted:false}});api.post.mockResolvedValue({data:{submitted:true}});});
it('lets a client skip the optional form without sending anything',async()=>{
 const w=mount(Feedback,{props});await flushPromises();expect(w.get('button[type=submit]').attributes('disabled')).toBeDefined();expect(w.get('input[type=checkbox]').element.checked).toBe(false);
 await w.findAll('button').find(b=>b.text()==='Skip feedback').trigger('click');expect(w.emitted('close')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('submits a rating and suggestion with explicit contact permission, without restarting notifications',async()=>{
 const w=mount(Feedback,{props});await flushPromises();await w.get('select').setValue(4);await w.get('textarea').setValue('More evening hours.');await w.get('input[type=checkbox]').setValue(true);await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith(`/guardian-portal/clients/8/cancellations/${props.operationId}/feedback`,{rating:4,comments:'More evening hours.',contactRequested:true});
 expect(w.text()).toContain('This service and its notifications remain off');expect(w.find('form').exists()).toBe(false);w.unmount();
});
it('shows an already-submitted response without requesting another one',async()=>{
 api.get.mockResolvedValue({data:{submitted:true}});const w=mount(Feedback,{props});await flushPromises();expect(w.find('form').exists()).toBe(false);expect(w.text()).toContain('Thank you');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('recovers from an email-link visit while cancellation is still processing',async()=>{
 api.get.mockRejectedValueOnce({response:{data:{error:{message:'Your cancellation is still finishing.'}}}});const w=mount(Feedback,{props});await flushPromises();expect(w.get('[role=alert]').text()).toContain('still finishing');
 await w.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();expect(w.find('form').exists()).toBe(true);w.unmount();
});
it('closes a duplicate response form without overwriting feedback after a lost response',async()=>{
 api.post.mockRejectedValueOnce({response:{data:{error:{code:'EXIT_FEEDBACK_ALREADY_RECEIVED'}}}});
 const w=mount(Feedback,{props});await flushPromises();await w.get('select').setValue(3);await w.get('form').trigger('submit');await flushPromises();
 expect(w.find('form').exists()).toBe(false);expect(w.text()).toContain('Thank you');w.unmount();
});
