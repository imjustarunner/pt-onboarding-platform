import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Component from '../ClientReminderTextConsent.vue';
const person={id:55,name:'Guardian QA',relationship:'guardian',phone:'+13035550100',stopped:false,enabled:false};
const context={agencyId:2,version:'2026-11-01.1',disclosure:'The current optional-text disclosure.',recipients:[person],activationBlocked:null};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:structuredClone(context)});api.post.mockResolvedValue({data:{recorded:true,activated:true,confirmation:'accepted'}});});
async function selected(){const w=mount(Component,{props:{clientId:101}});await flushPromises();await w.find('select').setValue('55');return w;}
it('requires all attestations and sends the exact saved recipient and disclosure',async()=>{
 const w=await selected();expect(w.find('button').attributes('disabled')).toBeDefined();
 for(const c of w.findAll('input[type="checkbox"]'))await c.setValue(true);
 await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/101/reminder-text-consent',expect.objectContaining({recipientId:55,phone:person.phone,disclosure:context.disclosure,version:context.version,attested:true,authorityConfirmed:true,phoneConfirmed:true,method:'phone'}));
 expect(w.text()).toContain('Confirmation accepted for sending');w.unmount();
});
it('shows a STOP boundary without an activation form',async()=>{
 api.get.mockResolvedValue({data:{...context,recipients:[{...person,stopped:true}]}});const w=await selected();expect(w.text()).toContain('Staff cannot turn texts back on');expect(w.find('button').exists()).toBe(false);expect(w.findAll('input[type="checkbox"]')).toHaveLength(0);w.unmount();
});
it('labels a saved but unconfigured program as pending, never enabled',async()=>{
 api.get.mockResolvedValue({data:{...context,activationBlocked:'Carrier setup pending.'}});api.post.mockResolvedValue({data:{recorded:true,activated:false,pendingReason:'Carrier setup pending.'}});
 const w=await selected();for(const c of w.findAll('input[type="checkbox"]'))await c.setValue(true);expect(w.find('button').text()).toBe('Record verbal consent');await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Texts remain off');w.unmount();
});
it('clears consent and stale contacts when navigating to another client',async()=>{
 const w=await selected();for(const c of w.findAll('input[type="checkbox"]'))await c.setValue(true);
 let finish;api.get.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await w.setProps({clientId:102});expect(w.text()).not.toContain(person.phone);finish({data:{...context,recipients:[]}});await flushPromises();expect(w.text()).toContain('Save an eligible guardian');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('preserves the retry identifier after an uncertain request and shows the server error',async()=>{
 api.post.mockRejectedValue({response:{data:{error:{message:'Consent is being updated. Please retry.'}}}});const w=await selected();for(const c of w.findAll('input[type="checkbox"]'))await c.setValue(true);await w.find('form').trigger('submit');await flushPromises();await w.find('form').trigger('submit');await flushPromises();expect(api.post.mock.calls[0][1].requestKey).toBe(api.post.mock.calls[1][1].requestKey);expect(w.text()).toContain('Consent is being updated');w.unmount();
});
