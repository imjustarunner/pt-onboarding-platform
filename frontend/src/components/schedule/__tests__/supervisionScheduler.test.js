import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),route:null,replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post,patch:m.patch},isApiRateLimited:()=>false}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:m.replace,resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'provider',has_supervisor_privileges:true},isAuthenticated:true})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'Test agency',slug:'test',organization_type:'agency',feature_flags:{hasClinicalOrg:true}},agencies:[],userAgencies:[]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
import { invalidateScheduleSummaryCacheForUser } from '../../../utils/scheduleSummaryCache';
let wrapper;
beforeEach(()=>{vi.clearAllMocks();invalidateScheduleSummaryCacheForUser(7);setActivePinia(createPinia());localStorage.clear();sessionStorage.clear();m.route=reactive({path:'/dashboard',params:{},query:{}});m.get.mockImplementation(async url=>({data:url.includes('supervision/providers')?{providers:[{id:8,firstName:'Supervisee'}],facilitators:[{id:7,firstName:'Supervisor'}]}:url.includes('agencies')?[]:{}}));m.post.mockResolvedValue({data:{session:{id:10}}});m.patch.mockResolvedValue({data:{ok:true}});});
afterEach(async()=>{wrapper?.unmount();await flushPromises();invalidateScheduleSummaryCacheForUser(7);});
describe('My Schedule supervision controls',()=>{
 it('refreshes the supervisee balance immediately after an attendance correction',async()=>{
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
  const s=wrapper.vm.$.setupState;
  s.selectedSupervisionParticipantId=8;
  await flushPromises();
  m.get.mockImplementation(async url=>({data:url.includes('dashboard-summary')?{supervision:{enabled:true,isPrelicensed:true,individualHours:16.26,groupHours:1}}:{attendees:[]}}));
  await s.refreshSupervisionRecord();
  expect(s.supvSuperviseeHours).toMatchObject({individualHours:16.26,groupHours:1});
 });
 it('enables creation for a supervisor and sends the chosen recurrence to the supervision state',async()=>{
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
  const s=wrapper.vm.$.setupState;
  await s.openSlotActionModal({dayName:'Monday',hour:10,dateYmd:'2026-10-05',preserveSelectionRange:false,initialRequestType:'supervision'});await flushPromises();
  expect(s.editorIsSupervision).toBe(true);
  const editor=wrapper.findComponent({name:'AppointmentEditorShell'});expect(editor.exists()).toBe(true);expect(editor.props('disabled')).toBe(false);
  editor.vm.$emit('update:recurrenceFrequency','MONTHLY');editor.vm.$emit('update:recurrenceEndMode','count');editor.vm.$emit('update:recurrenceOccurrenceCount',3);await flushPromises();
  expect(s.supervisionRecurrence).toBe('MONTHLY');expect(s.supervisionOccurrenceCount).toBe(3);
  s.selectedSupervisionParticipantId=8;s.supervisionReminderOffsets=[30,5];
  await s.submitRequest();await flushPromises();
  const bookings=m.post.mock.calls.filter(([url])=>url==='/supervision/sessions').map(([,body])=>body);
  expect(bookings).toHaveLength(3);
  expect(bookings.map(b=>b.recurrenceIndex)).toEqual([0,1,2]);
  expect(bookings.map(b=>b.startAt.slice(0,10))).toEqual(['2026-10-05','2026-11-05','2026-12-05']);
  expect(new Set(bookings.map(b=>b.recurrenceSeriesId)).size).toBe(1);
  expect(bookings.every(b=>b.supervisorUserId===7&&b.superviseeUserId===8&&b.reminderOffsets.join(',')==='30,5')).toBe(true);
 });
 it('defaults recurring meetings to ongoing and submits explicit single versus future cancellation',async()=>{
  const fixture={weekStart:'2026-10-05',supervisionSessions:[{id:10,supervisorUserId:7,recurrenceSeriesId:'series',startAt:new Date(2026,9,5,10).toISOString(),endAt:new Date(2026,9,5,11).toISOString()}]};
  // Cancellation refreshes in the background. Every summary read must return
  // the fixture, including a slower refresh arriving during the second scope.
  const defaultGet=m.get.getMockImplementation();
  m.get.mockImplementation(async(url,...args)=>url.includes('schedule-summary')?{data:fixture}:defaultGet(url,...args));
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
  const s=wrapper.vm.$.setupState;
  expect(s.supervisionRecurrenceEndMode).toBe('indefinite');expect(s.scheduleEventRecurrenceEndMode).toBe('indefinite');
  for(const scope of ['single','future']) {
   s.summary=fixture;
   s.supvDayLabel='Monday';s.supvStartHour=10;s.selectedSupvSessionId=10;
   await flushPromises();expect(s.canCancelSelectedSupvSession).toBe(true);s.cancelSupvAttribution='supervisor';s.cancelSupvReason='Unavailable';await s.confirmCancelSupvSession(scope);
   expect(m.post).toHaveBeenCalledWith('/supervision/sessions/10/cancel',expect.objectContaining({scope}));
  }
 });

});

it('ignores Google-only overlaps but keeps simultaneous app conflicts',async()=>{
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
 const s=wrapper.vm.$.setupState;
 const interval={startAt:'2026-10-13T19:00:00Z',endAt:'2026-10-13T20:00:00Z'};
 const ranges=[{start:new Date(interval.startAt),end:new Date(interval.endAt)}];
 expect(s.getBusyConflictFromSummary({googleBusy:[interval],googleEvents:[interval]},ranges).busy).toBe(false);
 const google={...interval,source:'external',activityType:'external',blocksScheduling:false,displayStatus:'BUSY'};
 expect(s.getBusyConflictFromSummary({busyBlocks:[google]},ranges).busy).toBe(false);
 for(const kind of ['TEAM_MEETING','SCHEDULE_HOLD','PERSONAL_EVENT']) {
  const app={...interval,eventKind:kind,title:'App conflict',displayStatus:'BUSY',googleEventId:'synced-copy'};
  expect(s.getBusyConflictFromSummary({busyBlocks:[google,app]},ranges)).toEqual({busy:true,label:'App conflict'});
 }
 m.get.mockClear();
 await s.fetchMeetingBusyEntries([8],ranges);
 expect(m.get).toHaveBeenCalledWith('/users/8/schedule-summary',expect.objectContaining({params:expect.objectContaining({includeGoogleBusy:'false',includeGoogleEvents:'false'})}));
});

for(const series of [false,'single','future']) it(series?`reloads the repeat label and saves the explicit ${series} edit scope`:'saves the repeat selection when converting an existing one-time session',async()=>{
 const fixture={weekStart:'2026-10-05',supervisionSessions:[{id:10,supervisorUserId:7,superviseeUserId:8,sessionType:'individual',recurrenceSeriesId:series?'weekly':null,recurrenceFrequency:series?'WEEKLY':null,recurrencePolicy:'INDEFINITE',startAt:new Date(2026,9,5,10).toISOString(),endAt:new Date(2026,9,5,11).toISOString()}]};
 const defaultGet=m.get.getMockImplementation();
 m.get.mockImplementation(async(url,...args)=>url.includes('schedule-summary')?{data:fixture}:defaultGet(url,...args));
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
 const s=wrapper.vm.$.setupState;s.summary=fixture;
 s.openSupervisionEditInScheduleModal('Monday',10,10);await flushPromises();
 expect(s.supervisionRecurrence).toBe(series?'WEEKLY':'ONCE');
 if(!series){s.supervisionRecurrence='BIWEEKLY';s.supervisionRecurrenceEndMode='indefinite';}
 s.supvStartIsoLocal='2026-10-05T11:00';s.supvEndIsoLocal='2026-10-05T12:00';s.supvChangeReason='Scheduling conflict';
 const saving=s.saveSupvSession();await flushPromises();
 if(series){expect(s.showSeriesEditScopeModal).toBe(true);expect(m.patch).not.toHaveBeenCalled();await s.confirmSeriesEditScope(series);}
 await saving;
 expect(m.patch).toHaveBeenCalledWith('/supervision/sessions/10',expect.objectContaining(series?{scope:series,startAt:'2026-10-05T11:00:00'}:{recurrenceFrequency:'BIWEEKLY',recurrencePolicy:'INDEFINITE'}));
 expect(m.patch).toHaveBeenCalledWith('/supervision/sessions/10',expect.objectContaining({changeReason:'Scheduling conflict'}));
 expect(m.post.mock.calls.filter(([url])=>url==='/supervision/sessions')).toHaveLength(0);
 confirm.mockRestore();
});

it('shows recurrence and outcome controls on Info, hides Join/status in Edit, and asks for a reason only after changing the time',async()=>{
 const fixture={weekStart:'2026-10-05',supervisionSessions:[{id:10,supervisorUserId:7,superviseeUserId:8,status:'SCHEDULED',role:'supervisor',modality:'virtual',sessionType:'individual',recurrenceSeriesId:'series',recurrenceFrequency:'WEEKLY',joinUrl:'/join/test',startAt:new Date(2026,9,5,10).toISOString(),endAt:new Date(2026,9,5,11).toISOString()}]};
 const defaultGet=m.get.getMockImplementation();m.get.mockImplementation(async(url,...args)=>url.includes('schedule-summary')?{data:fixture}:defaultGet(url,...args));
 vi.spyOn(window,'confirm').mockReturnValue(true);
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
 const s=wrapper.vm.$.setupState;s.summary=fixture;s.openSupervisionEditInScheduleModal('Monday',10,10);await flushPromises();
 s.editorWorkspaceTab='info';await flushPromises();
 expect(wrapper.find('[data-testid="supervision-recurrence-summary"]').text()).toContain('Weekly');
 expect(wrapper.find('[data-testid="supervision-recurrence-summary"]').text()).not.toContain('When saving');
 expect(wrapper.find('.nr-btn-join').exists()).toBe(true);
 s.editorWorkspaceTab='edit';await flushPromises();
 expect(wrapper.find('.nr-btn-join').exists()).toBe(false);
 const editor=wrapper.findComponent({name:'AppointmentEditorShell'});expect(editor.props('showStatus')).toBe(false);expect(editor.props('showVirtual')).toBe(false);
 s.supvStartIsoLocal='2026-10-05T11:00';s.supvEndIsoLocal='2026-10-05T12:00';await s.saveSupvSession();
 expect(s.supervisionActionDraft.mode).toBe('change');expect(m.patch).not.toHaveBeenCalled();
 await s.confirmSupervisionAction({scope:'single',reason:'Scheduling conflict'});
 expect(m.patch).toHaveBeenCalledWith('/supervision/sessions/10',expect.objectContaining({scope:'single',changeReason:'Scheduling conflict'}));
});
