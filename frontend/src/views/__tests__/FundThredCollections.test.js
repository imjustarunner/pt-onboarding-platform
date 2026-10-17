import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import View from '../FundThredCollectionsView.vue';
import api from '../../services/api';
const state=vi.hoisted(()=>({auth:null,route:null}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
const global={stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'},CollectionHandoff:{props:['agencyId'],template:'<div data-testid="cases">Cases for {{agencyId}}</div>'}}};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();state.auth=reactive({isAuthenticated:true,user:{id:1}});state.route={query:{agencyId:'999'}};});
afterEach(()=>wrapper?.unmount());
it('does not select a forged agency and keeps unconfigured collections in setup',async()=>{
 api.get.mockResolvedValue({data:{organizations:[{id:2,slug:'practice',name:'Practice',ready:false}]}});
 wrapper=mount(View,{global});await flushPromises();expect(wrapper.text()).toContain('Collections setup is pending');expect(wrapper.find('[data-testid=cases]').exists()).toBe(false);expect(wrapper.find('select').exists()).toBe(false);
});
it('loads cases for the authorized selection only',async()=>{
 api.get.mockResolvedValue({data:{organizations:[{id:1,slug:'plottwistco',name:'PlotTwistCo',ready:true},{id:2,slug:'practice',name:'Practice',ready:true}]}});
 wrapper=mount(View,{global});await flushPromises();expect(wrapper.find('[data-testid=cases]').text()).toContain('1');await wrapper.find('select').setValue(2);expect(wrapper.find('[data-testid=cases]').text()).toContain('2');
});
it('clears organization data on sign-out and ignores late account responses',async()=>{
 let resolve;api.get.mockReturnValue(new Promise(r=>{resolve=r;}));wrapper=mount(View,{global});state.auth.isAuthenticated=false;state.auth.user=null;await flushPromises();resolve({data:{organizations:[{id:1,name:'Private practice',ready:true}]}});await flushPromises();expect(wrapper.text()).not.toContain('Private practice');expect(wrapper.find('[data-testid=cases]').exists()).toBe(false);
});
