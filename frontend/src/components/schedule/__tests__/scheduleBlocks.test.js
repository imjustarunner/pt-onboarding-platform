import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({ get:vi.fn(), post:vi.fn(), put:vi.fn(), remove:vi.fn(), route:null, user:{id:7,role:'provider'}, prefs:{} }));
vi.mock('../../../services/api', () => ({default:{get:m.get,post:m.post,put:m.put,delete:m.remove,patch:vi.fn()},isApiRateLimited:()=>false}));
vi.mock('vue-router', () => ({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:vi.fn(),resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth', () => ({useAuthStore:()=>({user:m.user,isAuthenticated:true})}));
vi.mock('../../../store/agency', () => ({useAgencyStore:()=>({currentAgency:{id:2,name:'Test agency',slug:'test',organization_type:'agency'},agencies:[],userAgencies:[]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
let wrapper;
async function open(type='schedule_hold') {
  wrapper=shallowMount(Grid,{props:{userId:m.user.id,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});
  await flushPromises();
  const s=wrapper.vm.$.setupState;
  await s.openSlotActionModal({dayName:'Tuesday',hour:13,dateYmd:'2026-10-13',preserveSelectionRange:false,initialRequestType:'schedule_hold'});
  await flushPromises();
  if(type==='schedule_hold_all_day') s.scheduleEventAllDay=true;
  return s;
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-12T18:00:00Z'));
  setActivePinia(createPinia());localStorage.clear();m.user.id=7;m.prefs={};vi.clearAllMocks();
  m.route=reactive({path:'/dashboard',params:{},query:{}});
  m.get.mockImplementation(async url=>({data:url.endsWith('/preferences')?{schedule_display_prefs:m.prefs}:url.includes('agencies')?[]:{}}));
  m.post.mockResolvedValue({data:{}});m.put.mockResolvedValue({data:{}});m.remove.mockResolvedValue({data:{ok:true}});
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('filters reasons, adds only personal options, hides defaults, and restores from server preferences',async()=>{
  const s=await open();
  s.holdReasonSearch='doc';expect(s.filteredHoldReasonOptions.map(o=>o.label)).toEqual(['Documentation','Document Review']);
  s.scheduleHoldReasonDraft='Peer consultation';s.onHoldReasonDraftChange();s.commitHoldReasonDraft();
  s.requestNotes='Keep this note';s.removeCustomHoldReason('DOCUMENTATION');
  expect(s.scheduleHoldReasonOptions.some(o=>o.code==='DOCUMENTATION')).toBe(false);
  expect(s.scheduleHoldReasonOptions.some(o=>o.label==='Peer consultation'&&o.custom)).toBe(true);
  await s.saveDisplayPrefsToServer();
  expect(m.put).toHaveBeenCalledWith('/users/7/preferences',expect.objectContaining({schedule_display_prefs:expect.objectContaining({hiddenHoldReasonCodes:['DOCUMENTATION'],holdReasons:[{code:'PEER_CONSULTATION',label:'Peer consultation'}]})}),expect.anything());
  expect(m.post).not.toHaveBeenCalled();
  const prefs=s.collectDisplayPrefs();
  s.removeCustomHoldReason('PEER_CONSULTATION');
  expect(s.scheduleHoldReasonDraft).toBe('Peer consultation');expect(s.requestNotes).toBe('Keep this note');
  wrapper.unmount();localStorage.clear();m.prefs=prefs;
  const restored=await open();
  expect(restored.scheduleHoldReasonOptions.some(o=>o.code==='DOCUMENTATION')).toBe(false);
  expect(restored.scheduleHoldReasonOptions.some(o=>o.label==='Peer consultation')).toBe(true);
  restored.restoreHiddenHoldReasons();expect(restored.scheduleHoldReasonOptions.some(o=>o.code==='DOCUMENTATION')).toBe(true);
  wrapper.unmount();m.user.id=8;m.prefs={};
  const other=await open();expect(other.customHoldReasons).toEqual([]);expect(other.hiddenHoldReasonCodes).toEqual([]);
});
it.each(['schedule_hold','schedule_hold_all_day'])('schedules Tuesday/Thursday %s blocks with notes and a finite series',async type=>{
  const s=await open(type);
  const editor=wrapper.findComponent({name:'RecurrenceControls'});
  expect(editor.exists()).toBe(true);
  editor.vm.$emit('update:frequency','BIWEEKLY');
  editor.vm.$emit('update:endMode','count');
  editor.vm.$emit('update:occurrenceCount',4);
  editor.vm.$emit('update:weekdays',['Thu','Tue']);
  await flushPromises();s.scheduleHoldReasonDraft='Documentation';s.onHoldReasonDraftChange();s.requestNotes='Protected writing time';s.modalEndHour=14;s.modalStartMinute=15;s.modalEndMinute=15;
  await s.submitRequest();
  expect(s.modalError).toBe('');
  const bodies=m.post.mock.calls.filter(([url])=>url==='/users/7/schedule-events').map(([,body])=>body);
  expect(bodies).toHaveLength(4);
  expect(bodies.map(b=>(b.startDate||b.startAt).slice(0,10))).toEqual(['2026-10-13','2026-10-15','2026-10-27','2026-10-29']);
  expect(new Set(bodies.map(b=>b.recurrenceSeriesId)).size).toBe(1);
  expect(bodies.map(b=>b.recurrenceIndex)).toEqual([0,1,2,3]);
  expect(bodies.every(b=>b.kind==='SCHEDULE_HOLD'&&b.title==='Documentation'&&b.description==='Protected writing time'&&b.recurrencePolicy==='FINITE'&&b.recurrenceFrequency==='BIWEEKLY'&&b.timeZone)).toBe(true);
  if(type==='schedule_hold') expect(bodies.every(b=>b.startAt.endsWith('T13:15:00')&&b.endAt.endsWith('T14:15:00'))).toBe(true);
  else expect(bodies.every(b=>b.allDay&&b.endDate>b.startDate)).toBe(true);
});
it('supports an end date and an ongoing rolling year, and respects a different single chosen weekday',async()=>{
  const s=await open();s.scheduleEventRecurrence='WEEKLY';s.editorRecurrenceWeekdays=['Thu'];s.scheduleEventRecurrenceEndMode='until';s.editorRecurrenceUntilDate='2026-10-22';
  await s.submitRequest();
  let bodies=m.post.mock.calls.filter(([url])=>url.endsWith('/schedule-events')).map(([,body])=>body);
  expect(bodies.map(b=>b.startAt.slice(0,10))).toEqual(['2026-10-15','2026-10-22']);
  wrapper.unmount();m.post.mockClear();const again=await open();again.scheduleEventRecurrence='WEEKLY';again.editorRecurrenceWeekdays=['Tue','Thu'];again.scheduleEventRecurrenceEndMode='indefinite';
  await again.submitRequest();bodies=m.post.mock.calls.filter(([url])=>url.endsWith('/schedule-events')).map(([,body])=>body);
  expect(bodies.length).toBeGreaterThan(80);expect(bodies.every(b=>b.recurrencePolicy==='INDEFINITE')).toBe(true);
  const now=new Date();const end=new Date(now.getFullYear()+1,now.getMonth(),now.getDate());
  expect(bodies.every(b=>new Date(`${b.startAt.slice(0,10)}T00:00:00`)<end)).toBe(true);
});
it('sends distinct single-occurrence and future block cancellation scopes',async()=>{
  const s=await open();
  for (const scope of ['single','future']) {
    s.cancelMeetingItem={eventId:81,providerId:7,bookedProviderId:7,kind:'SCHEDULE_HOLD',recurrenceSeriesId:'blocks'};
    await s.confirmCancelMeeting(scope);
    expect(m.remove).toHaveBeenCalledWith('/users/7/schedule-events/81',expect.objectContaining({params:expect.objectContaining({scope})}));
  }
});

it('requires a weekday and a date range containing an occurrence before creating blocks',async()=>{
 const s=await open();s.scheduleEventRecurrence='WEEKLY';s.editorRecurrenceWeekdays=[];
 await s.submitRequest();expect(s.modalError).toContain('Select at least one day');expect(m.post).not.toHaveBeenCalled();
 s.editorRecurrenceWeekdays=['Thu'];s.scheduleEventRecurrenceEndMode='until';s.editorRecurrenceUntilDate='2026-10-13';
 await s.submitRequest();expect(s.modalError).toContain('No block dates');expect(m.post).not.toHaveBeenCalled();
});
