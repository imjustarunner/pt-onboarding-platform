import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Invite from '../ClientPersonalPortalInvite.vue';
const props={clientId:7,agencyId:2};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{invitation:null}});api.post.mockResolvedValue({data:{sent:true}});});
it('requires staff confirmation and sends the client email through the scoped personal invitation endpoint',async()=>{
 const w=mount(Invite,{props});await flushPromises();expect(w.get('button').attributes('disabled')).toBeDefined();
 await w.get('input[type=email]').setValue('teen@example.com');await w.get('input[type=checkbox]').setValue(true);
 await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/dependent-portal/staff/7/invitation/invite',{agencyId:2,email:'teen@example.com',confirmed:true});
 expect(w.emitted('updated')).toHaveLength(1);expect(w.text()).toContain('Guardian access stays in place');w.unmount();
});
it('does not invite a second login when a personal account already exists',async()=>{
 api.get.mockResolvedValue({data:{invitation:{email:'teen@example.com',active:true,passwordSet:false}}});const w=mount(Invite,{props});await flushPromises();
 expect(w.find('form').exists()).toBe(false);expect(w.text()).toContain('Waiting for password setup');
 await w.get('button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/dependent-portal/staff/7/invitation/resend',{agencyId:2});w.unmount();
});
it('retains delivery failures and reloads the saved account so staff can recover without a duplicate',async()=>{
 const w=mount(Invite,{props});await flushPromises();await w.get('input[type=email]').setValue('teen@example.com');await w.get('input[type=checkbox]').setValue(true);
 api.post.mockRejectedValueOnce({response:{data:{error:{message:'Invitation saved; delivery needs attention.'}}}});api.get.mockResolvedValue({data:{invitation:{email:'teen@example.com',active:true}}});
 await w.get('form').trigger('submit');await flushPromises();expect(w.text()).toContain('delivery needs attention');expect(w.text()).not.toContain('Client invitation sent.');expect(w.find('form').exists()).toBe(false);w.unmount();
});
it('clears the client email and authority confirmation on agency or client navigation',async()=>{
 const w=mount(Invite,{props});await flushPromises();await w.get('input[type=email]').setValue('teen@example.com');await w.get('input[type=checkbox]').setValue(true);
 await w.setProps({clientId:8,agencyId:3});await flushPromises();expect(w.get('input[type=email]').element.value).toBe('');expect(w.get('input[type=checkbox]').element.checked).toBe(false);w.unmount();
});
it('never claims an account was created when access is denied',async()=>{
 api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Agency access denied.'}}}});const w=mount(Invite,{props});await flushPromises();expect(w.text()).toContain('Agency access denied');expect(w.find('form').exists()).toBe(false);w.unmount();
});
