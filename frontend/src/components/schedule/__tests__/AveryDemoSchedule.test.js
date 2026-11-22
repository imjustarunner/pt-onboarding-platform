import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mocks,isApiRateLimited:()=>false}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/itsco/dashboard',params:{organizationSlug:'itsco'},query:{}}),useRouter:()=>({push:vi.fn(),replace:vi.fn(),resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'provider'},isAuthenticated:true})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:456,name:'Previous tenant',organization_type:'agency'},agencies:[],userAgencies:[{id:2,name:'Test Agency',organization_type:'agency'}]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
let wrapper;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setActivePinia(createPinia());vi.clearAllMocks();mocks.get.mockImplementation(async url=>({data:url==='/users/me/agencies'?[{id:2,name:'Test Agency',organization_type:'agency'}]:url.includes('/agencies')?[]:{}}));});
afterEach(async()=>{wrapper?.unmount();await flushPromises();});
async function mount(){wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:true,RouterLink:true}}});await flushPromises();return wrapper.vm.$.setupState;}
it('requests waitlists only for current memberships even when saved filters include a previous tenant',async()=>{
 const s=await mount();await s.loadSelfScheduleAgencies();s.activeScheduleAgencyIds=[2,456];
 expect(s.effectiveAgencyIds).toEqual([2]);
 expect(s.selfScheduleAgencyOptions.map(row=>row.id)).toEqual([2]);
});
it('immediately projects a saved clinical appointment with its client and location context',async()=>{
 const s=await mount();s.weekStart='2026-11-16';
 s.patchScheduleSummaryWithBookedEvent({eventId:51,agencyId:2,title:'Example Client',kind:'PERSONAL_EVENT',startAt:'2026-11-22T15:00:00Z',endAt:'2026-11-22T16:00:00Z',appointmentContext:{id:61,providerUserId:7,status:'scheduled',modality:'IN_PERSON',serviceLocationId:9,participants:[{clientId:81,displayName:'Example Client'}]}});
 const saved=Object.values(s.recentlySavedAppointments)[0];
 expect(saved).toMatchObject({appointmentId:61,clientId:81,clientName:'Example Client',serviceLocationId:9,isClientSession:true});
 s.acknowledgeSavedAppointments({scheduleEvents:[{id:51,appointmentId:61,kind:'PERSONAL_EVENT',title:'Session'}]});
 expect(Object.values(s.recentlySavedAppointments)).toHaveLength(1);
});

it('excludes SchoolCareBridge-only company memberships from the clinical waitlist aggregate',async()=>{
 const s=await mount();s.selfScheduleAgencyOptions=[{id:2,name:'Test Agency',organization_type:'agency'},{id:456,name:'School partner',organization_type:'agency',feature_flags:{schoolCareBridgeOnly:true}}];s.activeScheduleAgencyIds=[2,456];
 expect(s.effectiveAgencyIds).toEqual([2,456]);expect(s.providerWaitlistAgencyIds).toEqual([2]);
});
