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
  const s=await mount();s.scheduleSideBySide=false;await nextTick();
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
  expect(m.put).toHaveBeenLastCalledWith('/users/7/preferences',{schedule_display_prefs:{...m.prefs,layoutDefaultsVersion:2,scheduleSideBySide:false}},expect.anything());
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

it.each([
  { left: 100, right: 240, side: 'right' },
  { left: 800, right: 940, side: 'left' }
])('positions the preview to the $side without covering the hovered day', async ({ left, right, side }) => {
  const s = await mount();
  const cell = wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"]');
  vi.spyOn(cell.element, 'getBoundingClientRect').mockReturnValue({ left, right, top: 200, bottom: 280 });
  await cell.find('.cell-blocks').trigger('mouseenter', { clientY: 220 });
  const style = s.calendarStackPosition;
  const x = parseFloat(style.left), width = parseFloat(style.width);
  if (side === 'right') expect(x).toBeGreaterThanOrEqual(right);
  else expect(x + width).toBeLessThanOrEqual(left);
  expect(x).toBeGreaterThanOrEqual(12);
  expect(x + width).toBeLessThanOrEqual(window.innerWidth - 12);
  expect(parseFloat(style.top) + parseFloat(style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 12);
  expect(cell.attributes('title')).toBeUndefined();
  expect(cell.findAll('[title]')).toHaveLength(0);
  expect(cell.find('.cell-block').attributes('aria-label')).toBeTruthy();
});

it('closes on calendar scroll and resize but allows scrolling within the preview', async () => {
  await mount();
  const owner = wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"] .cell-blocks');
  await owner.trigger('mouseenter');
  await wrapper.find('.cell-expanded-list').trigger('scroll');
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(true);
  window.dispatchEvent(new Event('scroll')); await nextTick();
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(false);
  await owner.trigger('mouseenter');
  window.dispatchEvent(new Event('resize')); await nextTick();
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(false);
});

it('lets the pointer cross into the side preview and dismisses after leaving', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  await mount();
  const owner = wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"] .cell-blocks');
  await owner.trigger('mouseenter');
  await owner.trigger('mouseleave');
  await vi.advanceTimersByTimeAsync(80);
  await wrapper.find('.cell-expanded-list').trigger('mouseenter');
  await vi.advanceTimersByTimeAsync(200);
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(true);
  await owner.trigger('mouseleave');
  await vi.advanceTimersByTimeAsync(200);
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(false);
});

it('keeps narrow days clear on hover while retaining explicit preview access', async () => {
  await mount();
  const cell = wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"]');
  vi.spyOn(cell.element, 'getBoundingClientRect').mockReturnValue({ left: 12, right: window.innerWidth - 12, top: 200, bottom: 280 });
  await cell.find('.cell-blocks').trigger('mouseenter');
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(false);
  await cell.find('.cell-multi-pick-badge').trigger('click');
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(true);
  await cell.find('.cell-blocks').trigger('keydown', { key: 'Escape' });
  expect(wrapper.find('.cell-expanded-list').exists()).toBe(false);
});

it('keeps the original hour when crossing the gap into a preview beside a later row', async () => {
  const s = await mount();
  const owner = wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="11"] .cell-blocks');
  await owner.trigger('mouseenter');
  vi.spyOn(wrapper.find('.cell-expanded-list').element, 'getBoundingClientRect')
    .mockReturnValue({ left: 250, right: 670, top: 200, bottom: 640 });
  vi.spyOn(wrapper.find('.sched-cell[data-day="Tuesday"][data-hour="13"]').element, 'getBoundingClientRect')
    .mockReturnValue({ left: 100, right: 240, top: 400, bottom: 480 });
  await owner.trigger('mouseleave');
  await owner.trigger('mouseenter', { clientX: 300, clientY: 450 });
  expect(s.calendarStackContext.hour).toBe(11);
  expect(s.calendarStackItems.map(b => b.eventId)).toEqual([1, 2]);
});

it('starts legacy schedules in a full week with side-by-side items at either entry point', async () => {
  m.prefs = {spanMode:'day',scheduleSideBySide:false,hideWeekend:true};
  for (const path of ['/dashboard','/itsco/my-schedule']) {
    m.route.path=path;
    const s=await mount({mode:'self',compactPageChrome:true});
    expect(s.scheduleSpanMode).toBe('week');
    expect(s.focusedDays).toEqual([]);
    expect(s.hideWeekend).toBe(false);
    expect(s.scheduleSideBySide).toBe(true);
    wrapper.unmount();
  }
});
it('keeps post-rollout layout choices but always starts a new visit on the week', async () => {
  m.prefs={layoutDefaultsVersion:2,spanMode:'agenda',scheduleSideBySide:false,hideWeekend:true};
  const s=await mount({mode:'self'});
  expect(s.scheduleSpanMode).toBe('week');
  expect(s.scheduleSideBySide).toBe(false);
  expect(s.hideWeekend).toBe(true);
  s.setScheduleSpanMode('day');await nextTick();
  expect(s.scheduleSpanMode).toBe('day');
});
it('shows the layout helper during the two-month introduction and dismisses on opening settings', async () => {
  vi.setSystemTime(new Date('2026-10-19T18:00:00Z'));
  const s=await mount({mode:'self',compactPageChrome:true});
  expect(wrapper.find('.sched-settings-tip').text()).toContain('change your layout');
  await wrapper.find('[data-testid="schedule-command-settings"]').trigger('click');
  expect(wrapper.find('.sched-settings-tip').exists()).toBe(false);
  wrapper.unmount();vi.setSystemTime(new Date('2026-12-20T18:00:00Z'));
  await mount({mode:'self',compactPageChrome:true});
  expect(wrapper.find('.sched-settings-tip').exists()).toBe(false);
});
