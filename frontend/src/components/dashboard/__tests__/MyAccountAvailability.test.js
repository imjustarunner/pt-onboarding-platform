import {it,expect,vi} from 'vitest';
import {shallowMount} from '@vue/test-utils';
import MyAccountTab from '../MyAccountTab.vue';
const auth=vi.hoisted(()=>({user:{id:9,role:'provider'}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>auth}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2}})}));
const render=(props={})=>shallowMount(MyAccountTab,{props:{userId:9,agencyId:2,activeSection:'availability',...props},global:{stubs:{AccountHubPanel:{name:'AccountHubPanel',props:['sections'],template:'<div><slot/></div>'},RouterLink:true}}});
it('exposes the shared settings for the signed-in provider in the selected agency',()=>{const w=render();expect(w.findComponent({name:'ProviderAvailabilitySettings'}).props()).toMatchObject({providerId:9,agencyId:2});expect(w.findComponent({name:'AccountHubPanel'}).props('sections').some(s=>s.id==='availability')).toBe(true);w.unmount();});
it('does not render another user’s self-service controls or club availability',()=>{for(const props of [{userId:10},{isClubContext:true}]){const w=render(props);expect(w.findComponent({name:'ProviderAvailabilitySettings'}).exists()).toBe(false);expect(w.findComponent({name:'AccountHubPanel'}).props('sections').some(s=>s.id==='availability')).toBe(false);w.unmount();}});

it('provides the retained accounts and access page in My Account',()=>{const w=render({activeSection:'access'});expect(w.findComponent({name:'MyAccountAccess'}).exists()).toBe(true);expect(w.findComponent({name:'AccountHubPanel'}).props('sections').some(s=>s.id==='access')).toBe(true);w.unmount();});
