import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({get:vi.fn(),put:vi.fn(),route:null,prefs:{},colors:{},summary:{}}));
vi.mock('../../../services/api', () => ({default:{get:m.get,put:m.put,post:vi.fn(),delete:vi.fn(),patch:vi.fn()},isApiRateLimited:()=>false}));
vi.mock('vue-router', () => ({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:vi.fn(),resolve:()=>({href:'/dashboard'})})}));
vi.mock('../../../store/auth', () => ({useAuthStore:()=>({user:{id:7,role:'admin'},isAuthenticated:true})}));
vi.mock('../../../store/agency', () => ({useAgencyStore:()=>({currentAgency:{id:2,name:'Test agency',slug:'test',organization_type:'agency'},agencies:[],userAgencies:[]})}));
import Grid from '../ScheduleAvailabilityGrid.vue';
let wrapper;
const event=(id,start,end)=>({id,kind:'SCHEDULE_HOLD',title:`Block ${id}`,startAt:`2026-10-13T${start}:00`,endAt:`2026-10-13T${end}:00`,agencyId:2,providerId:7});
async function mount(props={}) {
  wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2,weekStartYmd:'2026-10-12',...props},global:{stubs:{RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'}}}});
  await flushPromises();
  const s=wrapper.vm.$.setupState;
  s.summary=m.summary;
  await nextTick();
  return s;
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-12T18:00:00Z'));
  setActivePinia(createPinia());localStorage.clear();vi.clearAllMocks();m.prefs={};m.colors={};
  m.summary={weekStart:'2026-10-12',scheduleEvents:[event(1,'09:00','14:30'),event(2,'11:00','12:00'),event(3,'13:00','14:00'),event(4,'16:00','17:00')]};
  m.route=reactive({path:'/dashboard',params:{},query:{}});
  m.get.mockImplementation(async url=>({data:url.endsWith('/preferences')?{schedule_display_prefs:m.prefs,schedule_color_overrides:m.colors}:url.includes('/schedule-summary')?m.summary:url.includes('agencies')?[]:{}}));
  m.put.mockResolvedValue({data:{}});
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('keeps long events separate from later overlaps and restores full width afterward',async()=>{
  const s=await mount();s.scheduleSideBySide=true;await nextTick();
  const at=hour=>s.cellBlocks('Tuesday',hour,0).filter(b=>b.kind==='sevt');
  expect(at(9)[0].sideBySideLane).toEqual({col:0,cols:2});
  expect(at(11)[0].sideBySideLane).toEqual({col:1,cols:2});
  expect(at(13)[0].sideBySideLane).toEqual({col:1,cols:2});
  expect(at(16)[0].sideBySideLane).toEqual({col:0,cols:1});
  expect(s.cellBlockStyle(at(11)[0]).left).toContain('50%');
});
it('renders every event rather than capping crowded slots',async()=>{
  m.summary.scheduleEvents=Array.from({length:6},(_,i)=>event(i+1,'11:00','12:00'));
  const s=await mount();s.scheduleSideBySide=true;await nextTick();
  const blocks=s.cellBlocks('Tuesday',11,0);
  expect(blocks).toHaveLength(6);expect(blocks.some(b=>b.kind==='more')).toBe(false);
  expect(new Set(blocks.map(b=>b.sideBySideLane.col)).size).toBe(6);
});
it('offers the saved side-by-side toggle on hover and zooms a single item when enabled',async()=>{
  const s=await mount();
  const overlap=wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"] .cell-blocks');
  await overlap.trigger('mouseenter');
  expect(wrapper.findAll('.cell-expanded-item')).toHaveLength(2);
  await wrapper.find('.cell-layout-toggle').trigger('click');
  expect(s.scheduleSideBySide).toBe(true);
  expect(wrapper.find('[data-testid="schedule-side-by-side-setting"]').attributes('aria-checked')).toBe('true');
  await overlap.trigger('mouseleave');
  await wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="16"] .cell-blocks').trigger('mouseenter');
  expect(wrapper.find('[aria-label="Enlarged schedule items"]').exists()).toBe(true);
  expect(wrapper.findAll('.cell-expanded-item')).toHaveLength(1);
  await s.saveDisplayPrefsToServer();
  expect(m.put).toHaveBeenCalledWith('/users/7/preferences',expect.objectContaining({schedule_display_prefs:expect.objectContaining({scheduleSideBySide:true})}),expect.anything());
});
it('uses the viewer preference when displaying someone else and preserves their other settings',async()=>{
  m.prefs={scheduleSideBySide:true,rowHeightMode:'large',holdReasons:[{code:'CUSTOM',label:'Custom'}]};
  const s=await mount({mode:'admin',userId:91});expect(s.scheduleSideBySide).toBe(true);
  s.scheduleSideBySide=false;await flushPromises();
  expect(m.put).toHaveBeenLastCalledWith('/users/7/preferences',{schedule_display_prefs:{...m.prefs,scheduleSideBySide:false}},expect.anything());
  expect(m.put.mock.calls.some(([url])=>url.includes('/91/'))).toBe(false);
  wrapper.unmount();m.prefs={scheduleSideBySide:true};await mount();
  expect(wrapper.vm.$.setupState.scheduleSideBySide).toBe(true);
});
it('hovering a later part of a long event shows the events at that time',async()=>{
  const s=await mount();
  const owner=wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="9"] .cell-blocks');
  const later=wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"]');
  vi.spyOn(later.element,'getBoundingClientRect').mockReturnValue({top:400,bottom:500});
  await owner.trigger('mouseenter',{clientY:450});
  expect(s.calendarStackContext.hour).toBe(11);
  expect(s.calendarStackItems.map(b=>b.eventId)).toEqual([1,2]);
  expect(wrapper.findAll('.cell-expanded-item')).toHaveLength(2);
});

it('finishes a pending preference save when leaving and never writes it again later',async()=>{
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});
  const s=await mount();m.put.mockClear();
  s.scheduleSideBySide=true;await nextTick();
  expect(m.put).not.toHaveBeenCalled();
  wrapper.unmount();
  expect(m.put).toHaveBeenCalledTimes(1);
  expect(m.put).toHaveBeenCalledWith('/users/7/preferences',expect.objectContaining({schedule_display_prefs:expect.objectContaining({scheduleSideBySide:true})}),expect.anything());
  await vi.advanceTimersByTimeAsync(1000);
  expect(m.put).toHaveBeenCalledTimes(1);
});

it('fades overlapping holds behind appointments without taking a side-by-side lane',async()=>{
  m.summary.scheduleEvents=[event(1,'09:00','15:00'),{...event(2,'11:00','12:00'),kind:'PERSONAL_EVENT',clientId:20}];
  const s=await mount();
  for(const side of [false,true]) {
    s.scheduleSideBySide=side;await nextTick();
    const hold=s.cellBlocks('Tuesday',9,0)[0], appointment=s.cellBlocks('Tuesday',11,0)[0];
    expect(hold.backgroundContext).toBe(true);expect(appointment.backgroundContext).toBe(false);
    expect(s.cellBlockStyle(hold).zIndex).toBeLessThan(s.cellBlockStyle(appointment).zIndex);
    expect(s.cellBlockStyle(hold).opacity).toBeLessThan(0.5);
    if(side)expect(appointment.sideBySideLane).toEqual({col:0,cols:1});
  }
});
it('omits exact-hour time from the grid but retains it in hover and off-hour cards',async()=>{
  m.summary.scheduleEvents=[{...event(1,'13:00','14:00'),kind:'PERSONAL_EVENT',title:'Planning'},{...event(2,'14:30','15:30'),kind:'TEAM_MEETING',title:'Team meeting'}];
  const s=await mount();s.scheduleSideBySide=true;await nextTick();
  const full=s.cellBlocks('Tuesday',13,0)[0], partial=s.cellBlocks('Tuesday',14,0)[0];
  expect(s.gridBlockLabel(full)).not.toContain('1:00');expect(s.gridBlockLabel(full)).toContain('Planning');
  expect(s.gridBlockLabel(partial)).toContain(s.clockRangeLabel(partial.startAt,partial.endAt));
  await wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="13"] .cell-blocks').trigger('mouseenter');
  expect(wrapper.find('.cell-expanded-item').text()).toContain(s.clockRangeLabel(full.startAt,full.endAt));
  s.scheduleSideBySide=false;expect(s.gridBlockLabel(full)).toContain(s.clockRangeLabel(full.startAt,full.endAt));
});
it('uses distinct custom appointment colors and saves only the viewer color preferences',async()=>{
  m.colors={interview:'#123456'};
  const s=await mount({mode:'admin',userId:91});
  expect(s.scheduleColors.interview).toBe('#123456');
  const interview={kind:'sevt',eventKind:'TEAM_MEETING',meetingSubtype:'interview'};
  expect(s.cellBlockStyle(interview)['--blockFill']).not.toBe(s.cellBlockStyle({kind:'supv'})['--blockFill']);
  s.scheduleColors={...s.scheduleColors,interview:'#123456',supervision:'#654321'};
  expect(s.cellBlockStyle(interview)['--blockFill']).toBe('rgba(18, 52, 86, 0.22)');
  await s.saveScheduleColors();
  expect(m.put).toHaveBeenLastCalledWith('/users/7/preferences',{schedule_color_overrides:expect.objectContaining({interview:'#123456',supervision:'#654321'})},expect.anything());
});
