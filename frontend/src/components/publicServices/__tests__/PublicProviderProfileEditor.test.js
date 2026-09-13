import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Editor from '../PublicProviderProfileEditor.vue';
import api from '../../../services/api';
const actor=vi.hoisted(()=>({user:{role:'admin'}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>actor}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
const props={provider:{id:9,firstName:'Test',lastName:'Provider',title:'Counselor'},agencyId:1};
const render=()=>mount(Editor,{props,global:{stubs:{RouterLink:true}}});
beforeEach(()=>{actor.user={role:'admin'};vi.clearAllMocks();api.get.mockResolvedValue({data:{profile:{publicBlurb:'Existing biography',details:{languages:['English']},insurances:['Existing insurer'],acceptingNewClientsOverride:null}}});api.put.mockResolvedValue({data:{profile:{}}});});
describe('public profile editing',()=>{
 it('does not expose editing to visitors or a manager denied by the agency-scoped API',async()=>{actor.user=null;let w=render();await flushPromises();expect(w.find('button').exists()).toBe(false);expect(api.get).not.toHaveBeenCalled();w.unmount();actor.user={role:'admin'};api.get.mockRejectedValue({response:{status:403}});w=render();await flushPromises();expect(w.find('button').exists()).toBe(false);w.unmount();});
 it('saves actual profile data through the protected API and refreshes the public view',async()=>{const w=render();await flushPromises();await w.find('button').trigger('click');await w.find('textarea').setValue('Updated public biography');await w.find('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/users/9/provider-public-profile',expect.objectContaining({agencyId:1,publicBlurb:'Updated public biography',identity:{firstName:'Test',lastName:'Provider',title:'Counselor'},insurances:['Existing insurer'],details:expect.objectContaining({languages:['English']}),acceptingNewClientsOverride:null}));expect(w.emitted('saved')).toHaveLength(1);w.unmount();});
 it('keeps edits open on a server failure instead of showing a false success',async()=>{api.put.mockRejectedValue({response:{data:{error:{message:'Save unavailable'}}}});const w=render();await flushPromises();await w.find('button').trigger('click');await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role=alert]').text()).toBe('Save unavailable');expect(w.find('textarea').element.value).toBe('Existing biography');expect(w.emitted('saved')).toBeUndefined();w.unmount();});
});
