import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, mount as mountComponent } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';

const m = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), patch:vi.fn(), hydrate: vi.fn(), route: null, failSchedule: false }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, put: m.put, post: m.post, patch:m.patch }, isApiRateLimited: () => false, apiRateLimitRetryAt: () => 0 }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider', has_supervisor_privileges: true }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: null, agencies: [], userAgencies: [], hydrateAgencyById: m.hydrate }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import RecurrenceControls from '../RecurrenceControls.vue';
import { clearScheduleSummaryCache, getScheduleSummaryStale, setScheduleSummary } from '../../../utils/scheduleSummaryCache.js';

const summary = { providerId: 7, weekStart: '2026-10-12', scheduleEvents: [], scheduleAgencyIds: [] };
let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-13T18:00:00Z'));
  setActivePinia(createPinia());
  localStorage.clear();
  clearScheduleSummaryCache();
  vi.clearAllMocks();
  m.put.mockReset().mockResolvedValue({ data: {} });
  m.patch.mockReset().mockResolvedValue({data:{}});
  m.post.mockReset().mockResolvedValue({data:{}});
  m.failSchedule = false;
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.get.mockImplementation(async (url) => {
    if (url.includes('/schedule-summary')) {
      if (m.failSchedule) throw { response: { status: 503, data: { error: { message: 'Schedule temporarily unavailable.' } } } };
      return { data: summary };
    }
    if (url.endsWith('/agencies')) throw { response: { status: 403 } };
    return { data: {} };
  });
});
afterEach(() => {
  wrapper?.unmount();
  clearScheduleSummaryCache();
  vi.useRealTimers();
});
async function mount({ realChangeWizard = false } = {}) {
  wrapper = shallowMount(Grid, {
    props: { userId: 7, mode: 'self', weekStartYmd: '2026-10-12' },
    global: { stubs: { Teleport: false, RouterLink: true, AppointmentChangeWizard: !realChangeWizard, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } } }
  });
  await flushPromises();
  return wrapper.vm.$.setupState;
}

it('loads the signed-in provider calendar even when the optional agency request is denied', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(m.get).toHaveBeenCalledWith('/users/7/schedule-summary', expect.objectContaining({ params: expect.objectContaining({ includeAllAgencies: 'true' }) }));
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('shows a load error without throwing, and lets the provider retry successfully', async () => {
  const state = await mount();
  m.failSchedule = true;
  await expect(state.load({ forceRefresh: true })).resolves.toBeUndefined();
  await flushPromises();
  expect(state.loading).toBe(false);
  expect(wrapper.find('[role="alert"]').text()).toContain('Schedule temporarily unavailable.');
  m.failSchedule = false;
  await wrapper.find('[data-testid="schedule-retry"]').trigger('click');
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
});

it('keeps a cached calendar visible after a transient refresh failure', async () => {
  setScheduleSummary('7|all|2026-10-12|monday|false|false|false|', summary);
  vi.setSystemTime(new Date(Date.now() + 120_000));
  m.failSchedule = true;
  const state = await mount();
  await expect(state.load()).resolves.toBeUndefined();
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toContain('previously loaded schedule');
});

it('keeps the loaded calendar visible when a forced background refresh fails', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  m.failSchedule = true;
  await state.load({ forceRefresh: true });
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toContain('previously loaded schedule');
});

it('waits for Retry-After and recovers an initially throttled calendar automatically', async () => {
  const get = m.get.getMockImplementation();
  let reads = 0;
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary') && ++reads === 1) {
      throw { response: { status: 429, headers: { 'retry-after': '60' } } };
    }
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  expect(state.summary).toBeNull();
  expect(wrapper.find('[data-testid="schedule-retry"]').element.disabled).toBe(true);
  expect(state.error).toContain('retry automatically');
  await vi.advanceTimersByTimeAsync(30000);
  await state.load({ forceRefresh: true });
  expect(reads).toBe(1);
  await vi.advanceTimersByTimeAsync(31000);
  await flushPromises();
  expect(reads).toBe(2);
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
});

it('cancels a pending cooldown retry when the calendar closes', async () => {
  const get = m.get.getMockImplementation();
  let reads = 0;
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary')) {
      reads++;
      throw { response: { status: 429, headers: { 'retry-after': '60' } } };
    }
    return get(url, options);
  });
  await mount();
  await vi.advanceTimersByTimeAsync(500);
  expect(reads).toBe(1);
  wrapper.unmount(); wrapper = null;
  await vi.advanceTimersByTimeAsync(61000);
  expect(reads).toBe(1);
});

it('keeps the calendar mounted with inline progress while a refresh is pending', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  const grid = wrapper.find('.sched-grid-wrap').element;
  let resolveSchedule;
  const get = m.get.getMockImplementation();
  m.get.mockImplementation((url, options) => url.includes('/schedule-summary')
    ? new Promise(resolve => { resolveSchedule = resolve; }) : get(url, options));
  const refreshing = state.load({ forceRefresh: true });
  await flushPromises();
  expect(state.loading).toBe(true);
  expect(state.summary).toMatchObject(summary);
  expect(wrapper.find('.sched-grid-wrap').element).toBe(grid);
  expect(wrapper.find('.sched-corner-loading').text()).toContain('Refreshing');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
  resolveSchedule({ data: summary });
  await refreshing;
  await flushPromises();
  expect(wrapper.find('.sched-grid-wrap').element).toBe(grid);
  expect(wrapper.find('.sched-corner-loading').exists()).toBe(false);
});

it.each([401, 403])('clears cached schedule data when the calendar request is denied with %s', async (status) => {
  const key = '7|all|2026-10-12|monday|false|false|false|';
  setScheduleSummary(key, summary);
  vi.setSystemTime(new Date(Date.now() + 120_000));
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary')) throw { response: { status, data: {} } };
    return get(url, options);
  });
  const state = await mount();
  await expect(state.load()).resolves.toBeUndefined();
  await flushPromises();
  expect(state.summary).toBeNull();
  expect(state.error).toBeTruthy();
  expect(getScheduleSummaryStale(key)).toBeNull();
  expect(wrapper.find('[data-testid="schedule-retry"]').exists()).toBe(true);
});

it.each([
  { scheduleSideBySide: true, rowHeightMode: 'compact', spanMode: 'week' },
  { scheduleSideBySide: true, rowHeightMode: 'xl', spanMode: 'day', hideWeekend: true },
  { spanMode: 'agenda', weekStartsOn: 'sunday', showAllHours: true }
])('loads My Schedule with saved display settings %j', async (prefs) => {
  localStorage.setItem('schedule.displayPrefs.v1:7', JSON.stringify(prefs));
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('keeps app appointments loaded when a saved Google overlay reports a permission error', async () => {
  localStorage.setItem('schedule.overlayPrefs.v2:7:multi', JSON.stringify({ showGoogleEvents: true, viewMode: 'open_finder' }));
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary')) return { data: { ...summary, googleCalendarEnabled: true, googleEvents: [], googleEventsError: 'Request failed with status code 403' } };
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('loads memberships once, shows personal rooms by default, and keeps available-room counts off', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.endsWith('/agencies')) return { data: Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `Tenant ${i + 1}`, organization_type: 'agency' })) };
    if (url === '/offices') return { data: [{ id: 1, name: 'Office' }] };
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(m.get.mock.calls.filter(([url]) => url === '/users/me/agencies')).toHaveLength(1);
  expect(m.hydrate).not.toHaveBeenCalled();
  expect(state.selectedOfficeLocationId).toBe(-1);
  expect(state.showMyRooms).toBe(true);
  expect(state.showOfficeOverlay).toBe(false);
  expect(m.get.mock.calls.some(([url]) => /weekly-grid|assigned-offices/.test(url))).toBe(false);
  const select = wrapper.find('[data-tour="my-schedule-office-select"]');
  expect(select.exists()).toBe(true);
  expect(select.findAll('option').map(o => o.text())).toContain('All offices');
});

it('toggles personal reservations independently of available-room counts and remembers the choice', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation((url, options) => {
    if (url.includes('/schedule-summary')) return Promise.resolve({ data: { ...summary, officeEvents: [
      { id: 1, buildingId: 1, roomId: 10, assignedProviderId: 7, slotState: 'ASSIGNED_AVAILABLE', startAt: new Date('2026-10-12T10:00:00').toISOString(), endAt: new Date('2026-10-12T11:00:00').toISOString() },
      { id: 2, buildingId: 2, roomId: 20, assignedProviderId: 7, bookedProviderId: 7, slotState: 'ASSIGNED_BOOKED', startAt: new Date('2026-10-12T10:00:00').toISOString(), endAt: new Date('2026-10-12T11:00:00').toISOString() }
    ] } });
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500); await flushPromises();
  expect(state.cellBlocks('Monday', 10).map(b => b.kind)).toEqual(expect.arrayContaining(['oa','ob']));
  expect(state.showOfficeOverlay).toBe(false);
  await wrapper.find('[data-testid="my-schedule-room-toggle"]').trigger('click');
  expect(state.cellBlocks('Monday', 10).some(b => ['oa','ob'].includes(b.kind))).toBe(false);
  expect(state.showOfficeOverlay).toBe(false);
  expect(JSON.parse(localStorage.getItem('schedule.overlayPrefs.v2:7:multi')).showMyRooms).toBe(false);
  wrapper.unmount();
  const restored = await mount();
  expect(restored.showMyRooms).toBe(false);
  await wrapper.find('[data-testid="my-schedule-room-toggle"]').trigger('click');
  await vi.advanceTimersByTimeAsync(500); await flushPromises();
  expect(restored.cellBlocks('Monday', 10).map(b => b.kind)).toEqual(expect.arrayContaining(['oa','ob']));
});

it('keeps usable actions ahead of a preferred but unavailable school action, including under More', async () => {
  const state = await mount();
  // This ordering fixture represents a provider whose session rollout is enabled.
  state.clientSessionBookingEnabled = true;
  state.modalDay = 'Tuesday'; state.modalHour = 15; state.modalEndHour = 20;
  state.slotActionPrefs = { order: ['school', 'schedule_hold', 'personal_event'], usage: { school: 999 } };
  await flushPromises();
  expect(state.availableQuickActions.find(a => a.id === 'school').disabledReason).toBeTruthy();
  expect(state.displayedChooserActions.map(a => a.id)).toEqual(expect.arrayContaining(['schedule_hold', 'personal_event']));
  expect(state.displayedChooserActions.every(a => !a.disabledReason)).toBe(true);
  expect(state.displayedChooserActions[0].id).toBe('schedule_hold');
  expect(state.moreQuickActions.find(a => a.id === 'school')).toBeTruthy();
  state.showMoreSlotActions = true;
  await flushPromises();
  const expanded = state.displayedChooserActions;
  const firstDisabled = expanded.findIndex(a => a.disabledReason);
  expect(firstDisabled).toBeGreaterThan(0);
  expect(expanded.slice(firstDisabled).every(a => a.disabledReason)).toBe(true);
  // Changing the selected time makes the action usable again and restores its preferred position.
  state.modalEndHour = 17;
  await flushPromises();
  expect(state.availableQuickActions.find(a => a.id === 'school').disabledReason).toBe('');
  expect(state.displayedChooserActions[0].id).toBe('school');
  expect(state.slotActionPrefs.order[0]).toBe('school');
});

it('opens each compact toolbar settings panel directly and toggles it closed', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500); await flushPromises();
  await wrapper.setProps({ compactPageChrome: true });
  state.summary = { ...summary, googleCalendarEnabled: true };
  await wrapper.find('[data-testid="schedule-command-settings"]').trigger('click');
  const settings = wrapper.find('[data-testid="my-schedule-calendar-settings"]');
  expect(settings.attributes('open')).toBeUndefined();
  for (const section of ['people', 'office', 'feeds', 'layout', 'more']) {
    const button = wrapper.find(`[aria-controls="sched-settings-${section}"]`);
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(settings.attributes('open')).toBeDefined();
    expect(wrapper.find(`#sched-settings-${section}`).element.style.display).not.toBe('none');
    for (const other of ['people', 'office', 'feeds', 'layout', 'more'].filter(id => id !== section)) {
      expect(wrapper.find(`#sched-settings-${other}`).element.style.display).toBe('none');
    }
  }
  await wrapper.find('[aria-controls="sched-settings-more"]').trigger('click');
  expect(settings.attributes('open')).toBeUndefined();
  expect(state.calendarSettingsOpen).toBe(true);
  // Nested disclosure toggle events must not collapse the toolbar itself.
  await settings.trigger('toggle');
  expect(state.calendarSettingsOpen).toBe(true);
  state.summary = { ...summary, googleCalendarEnabled: false };
  await flushPromises();
  expect(wrapper.find('[aria-controls="sched-settings-feeds"]').exists()).toBe(false);
});

it('submits ranked room preferences and the editor building from the provider request form', async () => {
  const api=(await import('../../../services/api')).default;
  api.post.mockResolvedValue({data:{ok:true,id:99}});
  const state=await mount();
  await wrapper.setProps({agencyId:2});
  state.requestType='office_request_only';
  state.modalDay='Tuesday';state.modalHour=17;state.modalEndHour=18;
  await flushPromises();
  state.modalStartHour=17;state.editorOfficeLocationId=1;
  state.editorPreferredRoomIds=[5,7];
  state.editorRecurrenceFrequency='WEEKLY';
  await state.submitRequest();
  const call=api.post.mock.calls.find(([url])=>url==='/availability/office-requests');
  expect(call, state.modalError).toBeTruthy();
  expect(call[1]).toMatchObject({agencyId:2,officeLocationIds:[1],preferredRoomIds:[5,7],requestedStartDate:'2026-10-13',slots:[{weekday:2,startHour:17,endHour:18}]});
  expect(call[1].slots[0].roomId).toBeUndefined();
  expect(call[1]).not.toHaveProperty('clientId');
});

it('submits every chosen office weekday with the edited time range and recurrence', async () => {
  const state = await mount();
  await wrapper.setProps({agencyId:2});
  m.post.mockResolvedValue({data:{id:1,requestIds:[1,2]}});
  state.requestType = 'office_request_only';
  expect(state.editorShowRecurrence).toBe(true);
  state.modalDay = 'Tuesday';
  state.modalHour = 17;
  state.modalStartHour = 17;
  state.modalEndHour = 19;
  state.editorRecurrenceFrequency = 'WEEKLY';
  expect(state.editorRecurrenceEndMode).toBe('indefinite');
  state.scheduleEventOccurrenceCount = 6;
  state.editorRecurrenceWeekdays = ['Tue','Wed'];
  await flushPromises();
  state.modalStartHour = 17;state.modalEndHour = 19;
  state.editorRecurrenceFrequency = 'WEEKLY';state.editorRecurrenceWeekdays = ['Tue','Wed'];
  state.editorRoomPreferenceAcknowledged = true;
  await state.submitRequest();
  expect(state.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/availability/office-requests', expect.objectContaining({
    recurrence:'WEEKLY', requestedStartDate:'2026-10-13',
    slots:[{weekday:2,startHour:17,endHour:19,roomId:undefined},{weekday:3,startHour:17,endHour:19,roomId:undefined}]
  }));
});

it('offers weekday choices for ongoing room requests without an unsupported end date',async()=>{
 const controls=mountComponent(RecurrenceControls,{props:{frequency:'WEEKLY',endMode:'indefinite',endModes:[],weekdays:['Tue']}});
 expect(controls.find('.rec-weekdays').exists()).toBe(true);
 expect(controls.find('input[type=date]').exists()).toBe(false);
 expect(controls.find('input[type=number]').exists()).toBe(false);
 await controls.findAll('.rec-day').find(b=>b.attributes('aria-pressed')==='false' && b.text().startsWith('W')).trigger('click');
 expect(controls.emitted('update:weekdays')[0][0]).toEqual(['Tue','Wed']);
 controls.unmount();
});

it('keeps a one-time room request unsent when the user cancels confirmation', async () => {
 const state=await mount();await wrapper.setProps({agencyId:2});
 state.requestType='office_request_only';state.modalDay='Tuesday';state.modalHour=17;
 await flushPromises();state.modalStartHour=17;state.modalEndHour=18;
 state.editorOfficeLocationId=1;state.editorPreferredRoomIds=[7];state.editorRecurrenceFrequency='ONCE';
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 try {await state.submitRequest();expect(confirm).toHaveBeenCalled();expect(m.post.mock.calls.some(([url])=>url==='/availability/office-requests')).toBe(false);}finally{confirm.mockRestore();}
});

it('keeps Book Session coming soon visible in the primary chooser and leaves nonclinical actions enabled', async () => {
  const state=await mount();await wrapper.setProps({agencyId:2});await flushPromises();
  state.showRequestModal=true;state.modalActionSource='plus_or_blank';
  await flushPromises();
  const book=state.displayedChooserActions.find(action=>action.id==='individual_session');
  expect(book).toMatchObject({label:'Book Session · Coming soon'});expect(book.disabledReason).toBeTruthy();
  for(const id of ['portal_intake','office_request_only','supervision'])expect(state.availableQuickActions.find(action=>action.id===id).disabledReason).toBe('');
  const button=wrapper.findAll('button').find(button=>button.text().includes('Book session · Coming soon'));
  expect(button?.attributes('disabled')).toBeDefined();
  state.onQuickActionSelect({id:'individual_session',disabledReason:''});expect(state.requestType).toBe('');
  state.openAppointmentEditor({mode:'create',kind:'group_session'});expect(state.requestType).toBe('');
});

it('resolves a client-session deep link to the chooser when rollout is disabled', async () => {
  const state=await mount();await wrapper.setProps({agencyId:2});await flushPromises();
  await state.openSlotActionModal({dayName:'Tuesday',hour:10,dateYmd:'2026-10-13',initialRequestType:'individual_session',preserveSelectionRange:false});
  await flushPromises();expect(state.showRequestModal).toBe(true);expect(state.showActionChooser).toBe(true);expect(state.requestType).toBe('');
  state.requestType='individual_session';await state.submitRequest();
  expect(state.modalError).toContain('coming soon');expect(m.post.mock.calls.some(([url])=>url==='/appointments')).toBe(false);
});

it('uses the chosen action agency and provider, and ignores an earlier provider’s delayed permission', async () => {
  const original=m.get.getMockImplementation();let resolveOld;
  m.get.mockImplementation(async (url,options)=>{
    if(url==='/appointments/booking-access') {
      if(options.params.providerUserId===7 && options.params.agencyId===2)return new Promise(resolve=>{resolveOld=resolve;});
      return {data:{enabled:options.params.providerUserId===8 && options.params.agencyId===3}};
    }
    return original(url,options);
  });
  const state=await mount();await wrapper.setProps({agencyId:2});await flushPromises();
  state.bookingTargetUserId=8;expect(state.clientSessionBookingEnabled).toBe(false);await flushPromises();
  resolveOld({data:{enabled:true}});await flushPromises();expect(state.clientSessionBookingEnabled).toBe(false);
  state.selectedActionAgencyId=3;await flushPromises();
  expect(m.get).toHaveBeenCalledWith('/appointments/booking-access',expect.objectContaining({params:{agencyId:3,providerUserId:8}}));
  expect(state.clientSessionBookingEnabled).toBe(true);
  state.bookingTargetUserId=9;expect(state.clientSessionBookingEnabled).toBe(false);await flushPromises();
});

it('opens a new clinical editor only for an enabled provider and preserves existing session edits', async () => {
  const original=m.get.getMockImplementation();m.get.mockImplementation(async (url,options)=>url==='/appointments/booking-access'?{data:{enabled:true}}:original(url,options));
  const state=await mount();await wrapper.setProps({agencyId:2});await flushPromises();
  state.openAppointmentEditor({mode:'create',kind:'individual_session'});expect(state.requestType).toBe('individual_session');
  state.clientSessionBookingEnabled=false;
  state.openAppointmentEditor({mode:'edit',kind:'individual_session',id:45});expect(state.requestType).toBe('edit_schedule_event');
});


it('persists the updated palette once and preserves a later custom choice that matches an old default', async () => {
  const original=m.get.getMockImplementation();
  const preferences={
    schedule_color_overrides:{client_session:'#059669',availability:'#16A34A',interview:'#123456'},
    schedule_display_prefs:{spanMode:'day',scheduleSideBySide:false,hideWeekend:true,customFuturePreference:'keep'}
  };
  m.get.mockImplementation(async (url,options)=>url==='/users/7/preferences'?{data:structuredClone(preferences)}:original(url,options));
  m.put.mockImplementation(async(url,body)=>{if(url==='/users/7/preferences')Object.assign(preferences,structuredClone(body));return {data:{}};});
  const state=await mount();
  expect(state.scheduleColors.client_session).toBe('#1D4ED8');
  expect(state.scheduleColors.availability).toBe('#06B6D4');
  expect(state.scheduleColors.interview).toBe('#123456');
  expect(preferences.schedule_display_prefs).toMatchObject({schedulePaletteVersion:2,customFuturePreference:'keep'});
  expect(state.scheduleSpanMode).toBe('week');expect(state.focusedDays).toEqual([]);
  expect(state.scheduleSideBySide).toBe(true);expect(state.hideWeekend).toBe(false);
  // This is now an intentional personal choice, not the unmigrated default.
  state.scheduleColors.client_session='#059669';await state.saveScheduleColors();
  expect(preferences.schedule_display_prefs.schedulePaletteVersion).toBe(2);
  wrapper.unmount();const restored=await mount();
  expect(restored.scheduleColors.client_session).toBe('#059669');
  expect(restored.scheduleColors.interview).toBe('#123456');
});

it('does not mark palette migration complete when its atomic save fails', async () => {
  const original=m.get.getMockImplementation();
  const preferences={schedule_color_overrides:{client_session:'#059669'},schedule_display_prefs:{spanMode:'day'}};
  m.get.mockImplementation(async(url,options)=>url==='/users/7/preferences'?{data:preferences}:original(url,options));
  m.put.mockRejectedValue(new Error('Unavailable'));
  const state=await mount();
  expect(state.scheduleColors.client_session).toBe('#1D4ED8');
  expect(state.collectDisplayPrefs().schedulePaletteVersion).toBe(0);
  expect(JSON.parse(localStorage.getItem('schedule.displayPrefs.v1:7')).schedulePaletteVersion).toBe(0);
});

it('starts each visit with a whole week while preserving a deliberate current-version layout choice', async () => {
  const original=m.get.getMockImplementation();
  m.get.mockImplementation(async(url,options)=>url==='/users/7/preferences'?{data:{schedule_display_prefs:{layoutDefaultsVersion:2,schedulePaletteVersion:2,spanMode:'day',scheduleSideBySide:false,hideWeekend:false}}}:original(url,options));
  const state=await mount();
  expect(state.scheduleSpanMode).toBe('week');expect(state.focusedDays).toEqual([]);
  expect(state.scheduleSideBySide).toBe(false);expect(state.hideWeekend).toBe(false);
  // Ordinary schedule refreshes do not revert choices made during this visit.
  state.scheduleSpanMode='day';await state.load({forceRefresh:true});await flushPromises();
  expect(state.scheduleSpanMode).toBe('day');
});

it('renders a school session once in occupied hours and retains its complete assignment overview',async()=>{
 const state=await mount();
 state.summary={...summary,schoolAssignments:[{assignmentId:10,schoolOrgId:451,agencyId:450,schoolName:'Cedar Grove',dayOfWeek:'Monday',startTime:'08:00',endTime:'15:00'}],scheduleEvents:[{id:80,appointmentId:20,clientId:5,agencyId:450,kind:'PERSONAL_EVENT',schoolOrganizationId:451,title:'School session',startAt:new Date('2026-10-12T08:30:00').toISOString(),endAt:new Date('2026-10-12T09:15:00').toISOString()}]};
 await flushPromises();
 const occupied=state.cellBlocks('Monday',8,0,true);
 expect(occupied.filter(b=>b.kind==='sevt')).toHaveLength(1);
 expect(occupied.some(b=>b.kind==='school')).toBe(false);
 expect(occupied.find(b=>b.kind==='sevt').shortLabel).toContain('Cedar Grove');
 expect(state.cellBlocks('Monday',10,0,true).some(b=>b.kind==='school')).toBe(true);
 expect(wrapper.get('[aria-label="Assigned school hours"]').text()).toContain('08:00–15:00');
 await wrapper.get('[aria-label="Assigned school hours"] button').trigger('click');
 expect(state.schoolAssignmentReview).toMatchObject({agencyId:450,schoolId:451,assignmentId:10});
 state.summary={...state.summary,scheduleEvents:state.summary.scheduleEvents.map(event=>({...event,appointmentStatus:'canceled_by_provider'}))};
 expect(state.cellBlocks('Monday',8,0,true).some(b=>b.kind==='school')).toBe(true);
});
it('keeps saved event insertion idempotent without a post-save wall-time error',async()=>{
 const state=await mount();state.summary={...summary,scheduleEvents:[{id:9,agencyId:450,kind:'PERSONAL_EVENT',title:'Session',startAt:'2026-10-12T15:00:00.000Z',endAt:'2026-10-12T16:00:00.000Z'}]};
 expect(()=>state.patchScheduleSummaryWithBookedEvent({eventId:9,agencyId:450,title:'Session',startAt:'2026-10-12T15:00:00Z',endAt:'2026-10-12T16:00:00Z',wallTimeZone:'UTC'})).not.toThrow();
 expect(state.summary.scheduleEvents).toHaveLength(1);
});
it('hydrates the canonical service and status when opening a saved appointment',async()=>{
 const state=await mount();const fallback=m.get.getMockImplementation();
 m.get.mockImplementation(async(url,...args)=>url==='/appointments/20'?{data:{appointment:{id:20,status:'client_confirmed',clinicalSessionId:159,tenantServiceId:287,serviceLocationId:19,billing:{serviceCode:'PRO_BONO_SERVICE'}}}}:fallback(url,...args));
 state.editorAppointmentId=20;await state.loadEditorReminders();
 expect(state.editorStatus).toBe('client_confirmed');expect(state.bookingServiceCode).toBe('PRO_BONO_SERVICE');expect(state.editorServiceLocationId).toBe(19);expect(state.editorClinicalSessionId).toBe(159);
 state.bookingServiceCodeOptions=[{code:'90837'}];await flushPromises();expect(state.bookingServiceCode).toBe('PRO_BONO_SERVICE');
});
it.each(['no_show','canceled_by_provider'])('opens the full outcome workflow for %s rather than silently saving calendar-only state',async status=>{
 const state=await mount();state.requestType='individual_session';state.editorAppointmentId=20;
 const open=vi.spyOn(state.appointmentChange,'openWizard').mockResolvedValue();
 state.onEditorStatus(status);await flushPromises();
 expect(open).toHaveBeenCalledWith(expect.objectContaining({appointmentId:20}));
 expect(state.appointmentChange.facts.eventType).toBe(status==='no_show'?'no_show':'canceled');
 open.mockRestore();
});
it('routes clinical Cancel event through reason, fee, and notification review',async()=>{
 const state=await mount();const open=vi.spyOn(state.appointmentChange,'openWizard').mockResolvedValue();
 state.openCancelMeetingConfirm({eventId:80,appointmentId:20,clientId:5,isClientSession:true,startAt:'2026-10-12T15:00:00Z',endAt:'2026-10-12T16:00:00Z'});await flushPromises();
 expect(open).toHaveBeenCalledWith(expect.objectContaining({appointmentId:20}));expect(state.showCancelMeetingModal).toBe(false);expect(state.appointmentChange.facts.eventType).toBe('canceled');open.mockRestore();
});

it('does not use another open appointment as a fallback when canceling an unlinked client event',async()=>{
 const state=await mount();state.editorAppointmentId=99;state.scheduleEventEditId=90;
 const open=vi.spyOn(state.appointmentChange,'openWizard').mockResolvedValue();
 state.openCancelMeetingConfirm({eventId:80,clientId:5,isClientSession:true});
 expect(open).not.toHaveBeenCalled();expect(state.modalError).toContain('appointment link');expect(state.showCancelMeetingModal).toBe(false);open.mockRestore();
});

it('saves explicitly changed clinical fields to the canonical appointment before refreshing its calendar',async()=>{
 const state=await mount();
 const item={eventId:80,eventKind:'PERSONAL_EVENT',appointmentId:20,clientId:5,agencyId:450,canEdit:true,startAt:'2026-10-12T15:00:00Z',endAt:'2026-10-12T16:00:00Z'};
 state.requestType='edit_schedule_event';state.scheduleEventEditId=80;state.stackDetailsItems=[item];state.editorAppointmentId=20;
 state.scheduleEventEditForm={title:'School session',description:'Client id: 5',startAt:'2026-10-12T09:00',endAt:'2026-10-12T10:00',agencyId:450,clientId:5,isPrivate:false};
 state.editorStatus='scheduled';state.editorStatusBaseline='scheduled';
 state.editorAppointmentBaseline={id:20,serviceCode:'PRO_BONO_SERVICE',tenantServiceId:10,serviceLocationId:12,modality:'IN_PERSON'};
 state.editorTenantServiceId=11;state.editorModality='IN_PERSON';await flushPromises();state.editorServiceLocationId=13;state.bookingServiceCode='90791';
 await state.saveScheduleStackItem(item,{pastConfirmed:true});
 expect(m.patch).toHaveBeenCalledWith('/appointments/20',{serviceCode:'90791',tenantServiceId:11,serviceLocationId:13},{skipGlobalLoading:true});
 expect(m.patch.mock.calls.findIndex(([url])=>url==='/appointments/20')).toBeLessThan(m.patch.mock.calls.findIndex(([url])=>url==='/users/7/schedule-events/80'));
});


it('keeps the linked appointment context through a real calendar cell and cancel button', async () => {
 const state = await mount({realChangeWizard:true});
 const raw = {id:442,appointmentId:104,clinicalSessionId:166,officeEventId:null,clientId:2273,tenantServiceId:34,serviceCode:'90834',serviceLocationId:125,modality:'TELEHEALTH',agencyId:450,kind:'PERSONAL_EVENT',title:'Virtual session · Blake QA-SchoolEN-1027',description:'Client id: 2273',startAt:new Date('2026-10-12T09:15:00').toISOString(),endAt:new Date('2026-10-12T10:00:00').toISOString()};
 state.summary={...summary,scheduleEvents:[raw]};
 const fallback=m.get.getMockImplementation();
 m.get.mockImplementation(async(url,...args)=>url==='/appointments/104'?{data:{appointment:{id:104,status:'scheduled',clinicalSessionId:166,tenantServiceId:34,serviceCode:'90834',serviceLocationId:125,modality:'TELEHEALTH'}}}:fallback(url,...args));
 const item=state.cellBlocks('Monday',9,15,true).find(block=>block.kind==='sevt');
 expect(item).toMatchObject({appointmentId:104,clinicalSessionId:166,officeEventId:null,clientId:2273,serviceCode:'90834',tenantServiceId:34,serviceLocationId:125,modality:'TELEHEALTH'});
 await flushPromises();
 const cell=wrapper.findAll('.cell-block-sevt').find(cell=>cell.attributes('aria-label')?.includes('Virtual session'));
 expect(cell).toBeTruthy();await cell.trigger('click');await flushPromises();
 expect(state.scheduleEventEditForm.clientId).toBe(2273);
 expect(state.editorOfficeEventId).toBe(0);
 expect(state.editorAppointmentId).toBe(104);expect(state.editorClinicalSessionId).toBe(166);
 expect(state.editorSessionServiceCode).toBe('90834');
 expect(state.editorServiceLocationId).toBe(125);
 m.post.mockResolvedValue({data:{appointment:{id:104},sessions:[{id:166,clientId:2273}]}});
 const sessionTab=wrapper.findAll('button').find(button=>button.text().includes('Session note'));
 expect(sessionTab).toBeTruthy();await sessionTab.trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/appointments/104/context');
 expect(wrapper.findComponent({name:'OfficeEventSessionNotePanel'}).props()).toMatchObject({clinicalSessionId:166,officeEventId:0,clientId:2273,serviceCode:'90834'});
 const button=wrapper.findAll('button').find(button=>button.text()==='Cancel / Missed session');
 expect(button).toBeTruthy();
 await button.trigger('click');await flushPromises();
 expect(state.appointmentChange.open.value).toBe(true);
 expect(m.get).toHaveBeenCalledWith('/appointments/104/change',{skipGlobalLoading:true});
 expect(state.appointmentChange.facts.eventType).toBe('canceled');
 expect(document.body.querySelector('[aria-labelledby="acw-title"]')?.textContent).toContain('What happened to this appointment?');
});

it('keeps quarter-hour clinical starts and a 45-minute service instead of replacing it during billing preview', async () => {
 const state=await mount();state.selfScheduleAgencyOptions=[{id:450,organization_type:'agency',name:'Synthetic agency',feature_flags:{medicalBillingEnabled:true}}];state.selectedActionAgencyId=450;state.requestType='individual_session';state.showRequestModal=true;await flushPromises();
 state.modalDay='Monday';state.modalHour=9;state.modalStartHour=9;state.modalStartMinute=0;state.modalEndHour=10;state.modalEndMinute=0;
 state.editorPracticeCategory='mental_health';state.editorTenantServices=[{id:34,serviceCode:'90834',businessType:'mental_health',defaultDurationMinutes:45},{id:37,serviceCode:'90837',businessType:'mental_health',defaultDurationMinutes:60}];
 state.onEditorStartTime('09:15');await flushPromises();
 state.onEditorPrimaryServiceCode('90834');await flushPromises();
 expect(state.editorStartTime).toBe('09:15');expect(state.editorEndTime).toBe('10:00');expect(state.bookingServiceCode).toBe('90834');
 state.onEditorEndTime('10:15');await flushPromises();
 m.post.mockResolvedValue({data:{overflowApplied:true,effectiveServiceCode:'90837',units:1}});
 await state.refreshBookingUnitPreview();expect(state.bookingServiceCode).toBe('90834');expect(state.bookingUnitPreview).toContain('90837');
 state.onEditorEndTime('09:45');await flushPromises();
 expect(state.editorEndTime).toBe('09:45');expect(state.bookingServiceCode).toBe('90834');
 state.onEditorStartTime('10:15');await flushPromises();
 expect(state.editorStartTime).toBe('10:15');expect(state.editorEndTime).toBe('10:45');
});

it('loads the exact linked clinical session before permitting session-source entry', async () => {
 const state=await mount();state.requestType='edit_schedule_event';state.scheduleEventEditId=80;state.editorAppointmentId=20;
 state.scheduleEventEditForm={clientId:2273,startAt:'2026-10-12T09:15',endAt:'2026-10-12T10:00',agencyId:450,id:80};state.modalContext={officeEventId:999};
 m.post.mockResolvedValue({data:{appointment:{id:20},sessions:[{id:167,clientId:2273},{id:168,clientId:2274}]}});
 expect(state.editorOfficeEventId).toBe(0);
 expect(await state.ensureEditorClinicalContext()).toBe(true);
 expect(state.editorClinicalSessionId).toBe(167);expect(state.editorClinicalContextReady).toBe(true);
 state.scheduleEventEditForm={...state.scheduleEventEditForm,clientId:2274};
 expect(state.editorClinicalContextReady).toBe(false);
 expect(await state.ensureEditorClinicalContext()).toBe(true);expect(state.editorClinicalSessionId).toBe(168);
});

it('does not create an unlinked source or select another group client when context linking fails',async()=>{
 const state=await mount();state.requestType='edit_schedule_event';state.scheduleEventEditId=80;state.editorAppointmentId=20;
 state.scheduleEventEditForm={clientId:2273,startAt:'2026-10-12T09:15',endAt:'2026-10-12T10:00',agencyId:450};
 m.post.mockResolvedValue({data:{appointment:{id:20,clinicalSessionId:168},sessions:[{id:168,clientId:2274}]}});
 expect(await state.ensureEditorClinicalContext()).toBe(false);expect(state.editorClinicalContextReady).toBe(false);
 expect(state.editorClinicalContextError).toContain('for this client');
 expect(m.post.mock.calls.some(([url])=>url==='/clinical-notes/drafts')).toBe(false);
});


it('preserves edits when a delayed appointment hydration finishes after the user selected another service',async()=>{
 const state=await mount();state.editorAppointmentId=20;state.editorStatus='scheduled';state.editorStatusBaseline='scheduled';
 state.editorAppointmentBaseline={id:20,serviceCode:'90837',tenantServiceId:37,serviceLocationId:125,modality:'IN_PERSON'};
 state.editorTenantServiceId=34;state.bookingServiceCode='90834';state.editorServiceLocationId=125;state.editorModality='IN_PERSON';await flushPromises();
 const fallback=m.get.getMockImplementation();m.get.mockImplementation(async(url,...args)=>url==='/appointments/20'?{data:{appointment:{id:20,status:'scheduled',serviceCode:'90837',tenantServiceId:37,serviceLocationId:125,modality:'IN_PERSON'}}}:fallback(url,...args));
 await state.loadEditorReminders();expect(state.bookingServiceCode).toBe('90834');expect(state.editorTenantServiceId).toBe(34);expect(state.editorServiceLocationId).toBe(125);
 expect(state.editorAppointmentBaseline.serviceCode).toBe('90837');
});

it('keeps the appointment open if its pending session source cannot be saved before opening the full note',async()=>{
 const state=await mount();state.editorClinicalSessionId=167;
 const savePendingDraft=vi.fn().mockRejectedValue(new Error('Keep the unsaved source'));
 state.editorSessionNotePanel={savePendingDraft};
 await state.openEditorClinicalNote();expect(savePendingDraft).toHaveBeenCalledOnce();expect(state.scheduleEventEditError).toBe('Keep the unsaved source');
});
