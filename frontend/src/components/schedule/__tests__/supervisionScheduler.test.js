import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:null,replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post,patch:vi.fn()},isApiRateLimited:()=>false}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:m.replace,resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'provider',has_supervisor_privileges:true},isAuthenticated:true})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'Test agency',slug:'test',organization_type:'agency',feature_flags:{hasClinicalOrg:true}},agencies:[],userAgencies:[]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
let wrapper;
beforeEach(()=>{setActivePinia(createPinia());localStorage.clear();m.route=reactive({path:'/dashboard',params:{},query:{}});m.get.mockImplementation(async url=>({data:url.includes('supervision/providers')?{providers:[{id:8,firstName:'Supervisee'}],facilitators:[{id:7,firstName:'Supervisor'}]}:url.includes('agencies')?[]:{}}));m.post.mockResolvedValue({data:{session:{id:10}}});});
afterEach(()=>wrapper?.unmount());
describe('My Schedule supervision controls',()=>{
 it('enables creation for a supervisor and sends the chosen recurrence to the supervision state',async()=>{
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
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
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});await flushPromises();
  const s=wrapper.vm.$.setupState;
  expect(s.supervisionRecurrenceEndMode).toBe('indefinite');expect(s.scheduleEventRecurrenceEndMode).toBe('indefinite');
  for(const scope of ['single','future']) {
   s.summary={weekStart:'2026-10-05',supervisionSessions:[{id:10,supervisorUserId:7,recurrenceSeriesId:'series',startAt:new Date(2026,9,5,10).toISOString(),endAt:new Date(2026,9,5,11).toISOString()}]};
   s.supvDayLabel='Monday';s.supvStartHour=10;s.selectedSupvSessionId=10;
   await flushPromises();expect(s.canCancelSelectedSupvSession).toBe(true);await s.confirmCancelSupvSession(scope);
   expect(m.post).toHaveBeenCalledWith('/supervision/sessions/10/cancel',expect.objectContaining({scope}));
  }
 });

});
