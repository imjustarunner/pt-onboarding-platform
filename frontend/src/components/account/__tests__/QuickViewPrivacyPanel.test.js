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
