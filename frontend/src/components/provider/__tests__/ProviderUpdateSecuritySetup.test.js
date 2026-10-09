import {it,expect,vi,beforeEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),defaults:{baseURL:'/api'}}}));
import api from '../../../services/api';import Setup from '../ProviderUpdateSecuritySetup.vue';
const render=props=>mount(Setup,{props:{userId:465,agencySlug:'itsco',...props},global:{stubs:{SignInPasswordSetup:{template:'<div class="password-setup" />'},PasskeysPanel:{template:'<div class="passkey-setup" />'}}}});
beforeEach(()=>vi.clearAllMocks());
it('never reads or changes account security in preview',async()=>{const w=render({preview:true});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('fieldset').element.disabled).toBe(true);expect(w.find('.password-setup').exists()).toBe(false);w.unmount();});
it('only mounts credential controls for the server-verified recipient',async()=>{api.get.mockResolvedValue({data:{id:501}});const w=render();await flushPromises();expect(w.find('.password-setup').exists()).toBe(false);api.get.mockResolvedValue({data:{id:465}});await w.findAll('button')[2].trigger('click');await flushPromises();expect(w.find('.password-setup').exists()).toBe(true);expect(w.find('.passkey-setup').exists()).toBe(true);w.unmount();});
