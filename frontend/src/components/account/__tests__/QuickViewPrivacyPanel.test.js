import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Panel from '../QuickViewPrivacyPanel.vue';
const reset=w=>w.findAll('button').find(b=>b.text()==='Reset 6-digit passcode');
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{requiresPassword:false,hasPasscode:true,agencyName:'ITSCO',homeUrl:'https://qv.app.itsco.health'}});api.post.mockResolvedValue({data:{passcode:'004123'}});});
it('lets signed-in SSO users reset with CONFIRM, without an app-password field',async()=>{
 const w=mount(Panel);await flushPromises();await reset(w).trigger('click');expect(w.find('input[type=password]').exists()).toBe(false);await w.get('input').setValue('CONFIRM');await w.findAll('button').find(b=>b.text()==='Confirm').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/quick-view/me/reset-passcode',{confirmPhrase:'CONFIRM'},expect.anything());expect(w.get('.pin').text()).toBe('004123');w.unmount();
});
it('keeps the password confirmation for password accounts',async()=>{
 api.get.mockResolvedValue({data:{requiresPassword:true,hasPasscode:true}});const w=mount(Panel);await flushPromises();await reset(w).trigger('click');await w.get('input[type=password]').setValue('my-password');await w.findAll('button').find(b=>b.text()==='Confirm').trigger('click');await flushPromises();expect(api.post.mock.calls[0][1]).toEqual({password:'my-password'});w.unmount();
});
it('keeps credential actions unavailable until account policy is loaded and offers retry on failure',async()=>{
 api.get.mockRejectedValueOnce(new Error('Unavailable'));const w=mount(Panel);await flushPromises();expect(w.get('[role=alert]').text()).toContain('Could not load');expect(w.findAll('.qv-actions button').every(b=>b.element.disabled)).toBe(true);
 await w.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();expect(reset(w).element.disabled).toBe(false);w.unmount();
});

it('rejects a different signed-in account and recovers after the invited person signs in',async()=>{
 api.get.mockResolvedValueOnce({data:{userId:99,requiresPassword:false,hasPasscode:true}});
 const w=mount(Panel,{props:{expectedUserId:7,agencyId:2,passcodeOnly:true}});await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('account named on this update');expect(w.get('.qv-actions button').element.disabled).toBe(true);
 api.get.mockResolvedValue({data:{userId:7,requiresPassword:false,hasPasscode:true}});
 await w.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();
 expect(reset(w).element.disabled).toBe(false);expect(w.text()).not.toContain('setup link');expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('keeps an unauthenticated invitation open and explains how to sign in for a reset',async()=>{
 api.get.mockRejectedValueOnce({response:{status:401}});
 const w=mount(Panel,{props:{expectedUserId:7,agencyId:2,passcodeOnly:true}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/quick-view/me/status',expect.objectContaining({cookieAuthOnly:true,skipAuthRedirect:true,headers:{'X-Agency-Id':2}}));
 expect(w.get('[role=alert]').text()).toContain('return here');expect(w.get('.qv-actions button').element.disabled).toBe(true);w.unmount();
});

it('does not report a successful reset without receiving the new six-digit code',async()=>{
 api.post.mockResolvedValueOnce({data:{}});const w=mount(Panel);await flushPromises();await reset(w).trigger('click');await w.get('input').setValue('CONFIRM');await w.findAll('button').find(b=>b.text()==='Confirm').trigger('click');await flushPromises();
 expect(w.emitted('passcode-changed')).toBeUndefined();expect(w.get('[role=alert]').text()).toContain('Reset again');expect(w.find('.pin').exists()).toBe(false);w.unmount();
});
