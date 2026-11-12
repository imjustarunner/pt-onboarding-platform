import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../GuardianLearningInvitations.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let w;
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{canInvite:true,invitations:[]}});api.post.mockResolvedValue({data:{invitation:{id:40,email:'qa.nlu.coparent@example.com',firstName:'Rene',status:'pending',deliveryStatus:'sent'},emailSent:true}});});
afterEach(()=>w?.unmount());
const setup=async()=>{w=mount(View,{props:{clientId:2545,agencyId:453,clientName:'Parker'}});await flushPromises();};
async function fill(){const inputs=w.findAll('input');await inputs[0].setValue('Rene');await inputs[1].setValue('QA');await inputs[2].setValue('qa.nlu.coparent@example.com');}
it('requires current server eligibility and an affirmative authority choice before sending',async()=>{
 await setup();await fill();expect(w.get('input[type=checkbox]').element.checked).toBe(false);expect(w.get('button[type=submit]').attributes('disabled')).toBeDefined();
 await w.get('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();
 await w.get('input[type=checkbox]').setValue(true);await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/2545/guardian-invitations',expect.objectContaining({agencyId:453,email:'qa.nlu.coparent@example.com',authorityConfirmed:true,requestKey:expect.any(String)}));
 expect(w.text()).toContain('Invitation sent; waiting for acceptance');expect(w.text()).not.toContain('inbox receipt');
});
it('does not offer a form when current relationship authority is denied',async()=>{
 api.get.mockResolvedValue({data:{canInvite:false,reason:'Guardian access requires review.',invitations:[]}});await setup();
 expect(w.text()).toContain('Guardian access requires review');expect(w.find('form').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});
it('keeps the same request identity after an uncertain response and never sends on reload',async()=>{
 api.post.mockRejectedValueOnce(new Error('connection lost'));await setup();await fill();await w.get('input[type=checkbox]').setValue(true);
 await w.get('form').trigger('submit');await flushPromises();const first=api.post.mock.calls[0][1];expect(w.text()).toContain('uncertain');
 api.post.mockResolvedValueOnce({data:{reused:true,emailSent:false,invitation:{id:40,status:'pending'}}});await w.get('form').trigger('submit');await flushPromises();
 expect(api.post.mock.calls[1][1].requestKey).toBe(first.requestKey);expect(w.text()).toContain('No additional email was sent');
 await w.setProps({clientId:2547});await flushPromises();expect(api.post).toHaveBeenCalledTimes(2);expect(api.get).toHaveBeenLastCalledWith('/guardian-portal/clients/2547/guardian-invitations',expect.any(Object));
});
it('ignores a prior child’s late access response after switching children',async()=>{
 let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));await setup();
 api.get.mockResolvedValueOnce({data:{canInvite:false,reason:'New child restricted',invitations:[]}});await w.setProps({clientId:2547});await flushPromises();
 finish({data:{canInvite:true,invitations:[{id:1,firstName:'Old child invitation'}]}});await flushPromises();
 expect(w.text()).toContain('New child restricted');expect(w.text()).not.toContain('Old child invitation');expect(w.find('form').exists()).toBe(false);
});
