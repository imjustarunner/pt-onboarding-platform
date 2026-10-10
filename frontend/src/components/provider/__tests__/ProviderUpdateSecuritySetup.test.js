import {it,expect,vi,beforeEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),defaults:{baseURL:'/api'}}}));
import api from '../../../services/api';import Setup from '../ProviderUpdateSecuritySetup.vue';
const render=props=>mount(Setup,{props:{userId:465,agencySlug:'itsco',...props},global:{stubs:{SignInPasswordSetup:{template:'<div class="password-setup" />'},PasskeysPanel:{template:'<div class="passkey-setup" />'}}}});
beforeEach(()=>vi.clearAllMocks());
it('never reads or changes account security in preview',async()=>{const w=render({preview:true});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('fieldset').element.disabled).toBe(true);expect(w.find('.password-setup').exists()).toBe(false);w.unmount();});
it('only mounts credential controls for the server-verified recipient',async()=>{api.get.mockResolvedValue({data:{id:501}});const w=render();await flushPromises();expect(w.find('.password-setup').exists()).toBe(false);api.get.mockResolvedValue({data:{id:465}});await w.findAll('button')[2].trigger('click');await flushPromises();expect(w.find('.password-setup').exists()).toBe(true);expect(w.find('.passkey-setup').exists()).toBe(true);w.unmount();});
it('uses the Google cookie rather than a stale stored token and loads controls when returning',async()=>{
 api.get.mockRejectedValueOnce({response:{status:401}});const popup={};vi.spyOn(window,'open').mockReturnValue(popup);
 const w=render();await flushPromises();expect(w.text()).toContain('checking again alone will not sign you in');
 await w.findAll('button')[0].trigger('click');api.get.mockResolvedValue({data:{id:465}});window.dispatchEvent(new Event('focus'));await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/users/me',expect.objectContaining({cookieAuthOnly:true}));expect(w.find('.passkey-setup').exists()).toBe(true);
 const calls=api.get.mock.calls.length;window.dispatchEvent(new Event('focus'));await flushPromises();expect(api.get).toHaveBeenCalledTimes(calls);w.unmount();vi.restoreAllMocks();
});
