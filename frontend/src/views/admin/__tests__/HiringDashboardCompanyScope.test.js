import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),agency:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,role:'support'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'juniper'}}),useRouter:()=>({push:vi.fn()})}));
import Dashboard from '../HiringDashboardView.vue';
let w;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.agency=reactive({currentAgency:{id:463},userAgencies:[{id:463,name:'Juniper'},{id:464,name:'Maple'}]});m.get.mockResolvedValue({data:{}});});
afterEach(()=>w?.unmount());
it('passes company scope to the pipeline card and never mounts it without a company',async()=>{
 w=mount(Dashboard,{global:{stubs:{RouterLink:true,HiringHubSwitcher:true,PeopleOpsPipelineCard:{props:['agencyId'],template:'<div class="test-pipeline">{{ agencyId }}</div>'}}}});await flushPromises();expect(w.get('.test-pipeline').text()).toBe('463');
 expect(m.get.mock.calls.every(([,options])=>options.params.agencyId===463)).toBe(true);
});
it('ignores a late dashboard response from the previous company',async()=>{
 const pending=[];m.get.mockImplementation((_,options)=>Number(options.params.agencyId)===463?new Promise(resolve=>pending.push(resolve)):Promise.resolve({data:{recentApplicants:[]}}));
 w=mount(Dashboard,{global:{stubs:{RouterLink:true,HiringHubSwitcher:true,PeopleOpsPipelineCard:true}}});await w.get('.hd-agency-picker select').setValue('464');await flushPromises();
 pending.forEach(resolve=>resolve({data:{recentApplicants:[{id:99,firstName:'Old company private applicant'}]}}));await flushPromises();expect(w.text()).not.toContain('Old company private applicant');
});
it('does not request an aggregate while the company context is unavailable',async()=>{
 m.agency.currentAgency=null;
 w=mount(Dashboard,{global:{stubs:{RouterLink:true,HiringHubSwitcher:true,PeopleOpsPipelineCard:{template:'<div class="test-pipeline" />'}}}});await flushPromises();
 expect(w.find('.test-pipeline').exists()).toBe(false);expect(m.get).not.toHaveBeenCalled();
});
