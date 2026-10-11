import {it,expect,vi,beforeEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),defaults:{baseURL:'/api'}}}));
import api from '../../../services/api';import Setup from '../ProviderUpdateSecuritySetup.vue';
const render=props=>mount(Setup,{props:{userId:465,agencySlug:'itsco',signIn:{method:'google',transitionPlanned:true,showCredentialSetup:true,passkeyEligible:true},...props},global:{stubs:{SignInPasswordSetup:{template:'<div class="password-setup" />'},PasskeysPanel:{template:'<div class="passkey-setup" />'}}}});
beforeEach(()=>vi.clearAllMocks());
it('never reads or changes account security in preview',async()=>{const w=render({preview:true});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('fieldset').element.disabled).toBe(true);expect(w.find('.password-setup').exists()).toBe(false);w.unmount();});
it('only mounts credential controls for the server-verified recipient',async()=>{api.get.mockResolvedValue({data:{id:501}});const w=render();await flushPromises();expect(w.find('.password-setup').exists()).toBe(false);api.get.mockResolvedValue({data:{id:465}});await w.get('[data-testid=refresh-verification]').trigger('click');await flushPromises();expect(w.find('.password-setup').exists()).toBe(true);expect(w.find('.passkey-setup').exists()).toBe(true);w.unmount();});
it('uses the Google cookie rather than a stale stored token and loads controls when returning',async()=>{
 api.get.mockRejectedValueOnce({response:{status:401}});const popup={};vi.spyOn(window,'open').mockReturnValue(popup);
 const w=render();await flushPromises();expect(w.text()).toContain('checking again alone will not sign you in');
 await w.get('[data-testid=verify-account]').trigger('click');api.get.mockResolvedValue({data:{id:465}});window.dispatchEvent(new Event('focus'));await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/users/me',expect.objectContaining({cookieAuthOnly:true}));expect(w.find('.passkey-setup').exists()).toBe(true);
 const calls=api.get.mock.calls.length;window.dispatchEvent(new Event('focus'));await flushPromises();expect(api.get).toHaveBeenCalledTimes(calls);w.unmount();vi.restoreAllMocks();
});

it('keeps retained Google users on the code step without credential controls or verification requests',async()=>{const w=render({signIn:{method:'google',retainsGoogle:true,showCredentialSetup:false}});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.text()).toContain('will keep its Google account and Gmail access');expect(w.find('button').exists()).toBe(false);expect(w.find('.password-setup').exists()).toBe(false);expect(w.text()).not.toContain('SSO');w.unmount();});
it('shows only app sign-in for password accounts',async()=>{api.get.mockRejectedValue({response:{status:401}});const w=render({signIn:{method:'password',showCredentialSetup:true,passkeyEligible:true}});await flushPromises();expect(w.get('[data-testid=verify-account]').text()).toBe('Sign in to the app');expect(w.text()).not.toContain('Sign in with Google');expect(w.text()).not.toContain('changeover');w.unmount();});
it('does not offer credential setup when account policy is unavailable',async()=>{const w=render({signIn:undefined});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('button').exists()).toBe(false);expect(w.text()).toContain('can still save your progress');w.unmount();});
