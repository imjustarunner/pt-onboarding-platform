import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,shallowMount} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import {reactive} from 'vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),route:null,summary:{}}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post,put:m.put},isApiRateLimited:()=>false}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:vi.fn(async()=>{}),resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'provider'},isAuthenticated:true})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'Viewing agency'},agencies:[],userAgencies:[]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
import {clearScheduleSummaryCache} from '../../../utils/scheduleSummaryCache.js';
import {notifyCompanyEventRsvpChanged} from '../../../utils/companyEventRsvpEvents.js';
let wrapper;
const invite=()=>({id:-7001,companyEventId:70,kind:'COMPANY_EVENT_INVITATION',agencyId:9,title:'Our second anniversary',startAt:'2026-10-13T15:00:00Z',endAt:'2026-10-13T17:00:00Z',canEdit:false,canReschedule:false,isInvitedCompanyEvent:true,myRsvp:'maybe',canRsvp:true,mandatory:false,staffPageUrl:'/company-events/70/staff/private'});
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2026-10-13T18:00:00Z');setActivePinia(createPinia());localStorage.clear();clearScheduleSummaryCache();vi.clearAllMocks();
  m.route=reactive({path:'/dashboard',params:{},query:{}});m.summary={providerId:7,weekStart:'2026-10-12',scheduleAgencyIds:[2],scheduleEvents:[invite()]};
  m.get.mockImplementation(async url=>({data:url.includes('/schedule-summary')?m.summary:{}}));});
afterEach(()=>{wrapper?.unmount();clearScheduleSummaryCache();vi.useRealTimers();});
async function render(){wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2,mode:'self',weekStartYmd:'2026-10-12'},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();const state=wrapper.vm.$.setupState;await state.load({forceRefresh:true});await flushPromises();return state;}
const hour=state=>state.parseGridEventDate(invite().startAt).getHours();
it('renders Yes/Maybe company invitations as actual timed schedule blocks with their own RSVP identity',async()=>{
  const state=await render();const block=state.cellBlocks('Tuesday',hour(state)).find(item=>item.eventKind==='COMPANY_EVENT_INVITATION');
  expect(block).toMatchObject({eventId:-7001,companyEventId:70,agencyId:9,isInvitedCompanyEvent:true,myRsvp:'maybe',canRsvp:true,canEdit:false,canReschedule:false,draggable:false});
  const detail=state.buildScheduleStackItemFromEvent(invite());expect(detail).toMatchObject({companyEventId:70,myRsvp:'maybe',kindLabel:'Company event',staffPageUrl:'/company-events/70/staff/private'});
  expect(detail.detailText).toContain('Your RSVP: Maybe');expect(detail.detailText).not.toContain('Open — sign up');
});
it('opens a projected invitation in read-only event details without selecting or editing a real provider event',async()=>{
  m.summary.scheduleEvents.unshift({id:7001,kind:'PERSONAL_EVENT',agencyId:2,title:'Real personal event',startAt:invite().startAt,endAt:invite().endAt});
  const state=await render();m.post.mockClear();m.put.mockClear();const block=state.cellBlocks('Tuesday',hour(state)).find(item=>item.eventKind==='COMPANY_EVENT_INVITATION');
  state.onCellBlockClick({preventDefault:vi.fn(),stopPropagation:vi.fn()},block,'Tuesday',hour(state));await flushPromises();
  expect(state.showStackDetailsModal).toBe(true);expect(state.stackDetailsItems).toHaveLength(1);expect(state.stackDetailsItems[0]).toMatchObject({label:'Our second anniversary',companyEventId:70,canEdit:false,eventId:-7001});
  expect(wrapper.findComponent({name:'CompanyEventRsvpControls'}).props('event')).toMatchObject({id:70,companyEventId:70,myRsvp:'maybe'});expect(state.showRequestModal).toBe(false);
  expect(m.post).not.toHaveBeenCalled();expect(m.put).not.toHaveBeenCalled();
});
it('removes No immediately and restores Yes after cross-agency RSVP changes, bypassing the cached summary',async()=>{
  const state=await render();expect(state.scheduleEventsInCell('Tuesday',hour(state))).toHaveLength(1);
  const initialScope=structuredClone(m.get.mock.calls.find(([url])=>url.includes('/schedule-summary'))[1].params);
  m.summary={...m.summary,scheduleEvents:[]};notifyCompanyEventRsvpChanged({eventId:70,agencyId:9,response:'no'});await flushPromises();
  expect(state.scheduleEventsInCell('Tuesday',hour(state))).toHaveLength(0);
  m.summary={...m.summary,scheduleEvents:[{...invite(),myRsvp:'yes'}]};notifyCompanyEventRsvpChanged({eventId:70,agencyId:9,response:'yes'});await flushPromises();
  expect(state.scheduleEventsInCell('Tuesday',hour(state))).toMatchObject([{myRsvp:'yes',companyEventId:70}]);
  const requests=m.get.mock.calls.filter(([url])=>url.includes('/schedule-summary'));expect(requests.length).toBeGreaterThanOrEqual(3);expect(requests.at(-1)[1].params).toEqual(initialScope);expect(requests.at(-1)[1].params.agencyId).not.toBe(9);
});
it('opens a masked negative-id Busy projection without falling back to the first real appointment or showing RSVP details',async()=>{
  const timing={startAt:invite().startAt,endAt:invite().endAt};
  m.summary.scheduleEvents=[{id:7001,kind:'PERSONAL_EVENT',agencyId:2,title:'Real appointment',...timing},{id:-7002,kind:'PERSONAL_EVENT',title:'Busy',canEdit:false,canReschedule:false,...timing}];
  const state=await render();m.post.mockClear();m.put.mockClear();const block=state.cellBlocks('Tuesday',hour(state)).find(item=>item.eventId===-7002);
  state.onCellBlockClick({preventDefault:vi.fn(),stopPropagation:vi.fn()},block,'Tuesday',hour(state));await flushPromises();
  expect(state.stackDetailsItems).toHaveLength(1);expect(state.stackDetailsItems[0]).toMatchObject({label:'Busy',eventId:-7002,canEdit:false,canReschedule:false});
  expect(state.stackDetailsItems[0]).not.toHaveProperty('companyEventId');expect(wrapper.findComponent({name:'CompanyEventRsvpControls'}).exists()).toBe(false);expect(state.showRequestModal).toBe(false);expect(m.put).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();
});
