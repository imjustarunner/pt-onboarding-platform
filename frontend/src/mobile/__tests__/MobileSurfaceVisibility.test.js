import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
import QuickView from '../../views/QuickViewAccessView.vue';
vi.mock('axios',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
import axios from 'axios';
let wrapper,router;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.resetAllMocks();axios.get.mockImplementation(async url=>({data:url.endsWith('/tools')?{tools:{applicants:[{id:2,name:'Synthetic agency'}]}}:url.endsWith('/applicants')?{candidates:[{id:8,name:'Synthetic applicant',agencyId:2,stageLabel:'Applied'}]}:{}}));});
afterEach(()=>{wrapper?.unmount();router?.options.history.destroy();});
it('hides the real fragment-root applicant page on every other mobile destination and preserves it on return',async()=>{
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile/workspace?view=applicants');
 wrapper=shallowMount(QuickView,{attachTo:document.body,props:{mobileSession:{sessionToken:'synthetic',userId:5,agencyId:2,expiresAt:'2099-01-01T00:00:00Z',profile:{workspace:{name:'Synthetic agency'}}}},global:{plugins:[router],stubs:{MobileApplicants:false}}});await flushPromises();
 expect(wrapper.get('.mobile-applicants').isVisible()).toBe(true);
 for(const view of ['mywork','tasks','calendar','home']){await router.push({path:'/mobile/workspace',query:{view}});await flushPromises();expect(wrapper.get('.mobile-applicants').isVisible(),view).toBe(false);}
 await router.push('/mobile/workspace?view=applicants');await flushPromises();expect(wrapper.get('.mobile-applicants').isVisible()).toBe(true);expect(wrapper.text()).toContain('Synthetic applicant');
});
