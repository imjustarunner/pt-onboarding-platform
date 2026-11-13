import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,shallowMount} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import {reactive} from 'vue';
const m=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),user:null,agency:null,route:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get,put:vi.fn(),post:vi.fn()},isApiRateLimited:()=>false}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:m.push,replace:vi.fn(),resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({get user(){return m.user;},isAuthenticated:true})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({get currentAgency(){return m.agency;},agencies:[],userAgencies:[],hydrateAgencyById:vi.fn()})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
import {clearScheduleSummaryCache} from '../../../utils/scheduleSummaryCache.js';
let wrapper;
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
 setActivePinia(createPinia());localStorage.clear();clearScheduleSummaryCache();vi.clearAllMocks();
 m.user=reactive({id:1496,role:'provider',status:'ACTIVE_EMPLOYEE',workspaceServiceContext:{agencyId:453,canTutor:true,canClinical:false,learningOnly:true}});
 m.agency={id:453,name:'NLU QA'};
 m.route=reactive({path:'/nlu-qa-demo/my-schedule',params:{organizationSlug:'nlu-qa-demo'},query:{}});
 m.get.mockImplementation(async url=>({data:url.includes('/schedule-summary')?{providerId:1496,weekStart:'2026-11-09',scheduleEvents:[],scheduleAgencyIds:[453]}:url==='/appointments/booking-access'?{enabled:true}:{}}));
});
afterEach(()=>{wrapper?.unmount();clearScheduleSummaryCache();vi.useRealTimers();});
async function mountGrid(compactPageChrome){
 wrapper=shallowMount(Grid,{props:{userId:1496,agencyId:453,mode:'self',weekStartYmd:'2026-11-09',compactPageChrome},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});
 await flushPromises();const state=wrapper.vm.$.setupState;await state.load({forceRefresh:true});await flushPromises();return state;
}
it.each([true,false])('keeps tutoring booking available and omits clinical note entry in calendar chrome %s',async compact=>{
 const state=await mountGrid(compact);
 expect(wrapper.find('button[title="Open Note Workspace"]').exists()).toBe(false);
 expect(wrapper.text()).toContain('Book session');
 expect(m.get).toHaveBeenCalledWith('/appointments/booking-access',expect.objectContaining({params:expect.objectContaining({businessType:'tutoring',agencyId:453})}));
 state.openScheduleNoteAid();expect(m.push).not.toHaveBeenCalled();
});
it('restores the note control only when the same agency grants clinical work',async()=>{
 await mountGrid(true);
 m.user.workspaceServiceContext={agencyId:453,canTutor:true,canClinical:true,learningOnly:false};await flushPromises();
 expect(wrapper.find('button[title="Open Note Workspace"]').exists()).toBe(true);
});
