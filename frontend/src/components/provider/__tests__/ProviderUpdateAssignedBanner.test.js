// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Banner from '../ProviderUpdateAssignedBanner.vue';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{available:true,title:'October Provider Update'}});});
function render(id=2){return mount(Banner,{props:{agencyId:id},global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to.path"> <slot/> </a>'}}}});}
it('shows the assigned update after login and links to the editable signed-in flow',async()=>{const w=render();await flushPromises();expect(w.text()).toContain('October Provider Update');expect(w.get('a').attributes('href')).toBe('/itsco/provider/update');expect(m.get.mock.calls[0][0]).toBe('/provider-update/me/status');expect(m.get.mock.calls[0][1].params).toEqual({agencyId:2});w.unmount();});
it('does not show a misleading card when no open update exists',async()=>{m.get.mockResolvedValue({data:{available:false}});const w=render();await flushPromises();expect(w.find('aside').exists()).toBe(false);w.unmount();});
it('checks the new agency when dashboard context changes',async()=>{const w=render();await flushPromises();m.get.mockResolvedValue({data:{available:false}});await w.setProps({agencyId:4});await flushPromises();expect(m.get.mock.calls.at(-1)[1].params).toEqual({agencyId:4});expect(w.find('aside').exists()).toBe(false);w.unmount();});
