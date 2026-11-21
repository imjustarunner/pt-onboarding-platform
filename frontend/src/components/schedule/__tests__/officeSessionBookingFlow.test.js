import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, shallowMount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), user: null, agency: null }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get, post: mocks.post, patch: mocks.patch }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/innerstrength/dashboard', params: { organizationSlug: 'innerstrength' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.user, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({
  currentAgency: mocks.agency || { id: 2, name: 'The Inner Strength Institute', slug: 'innerstrength', organization_type: 'agency', feature_flags: { hasClinicalOrg: true, medicalBillingEnabled: true }, logo_url: '/assets/branding/innerstrength-mark.png' },
  hydrateAgencyById:vi.fn(), agencies: [{ id: 377, name: 'The Inner Strength Institute', slug: 'tisi', organization_type: 'agency', feature_flags: { hasClinicalOrg: true, medicalBillingEnabled: true } }], userAgencies: []
}) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import Header from '../AppointmentHeaderFields.vue';
import Logo from '../ScheduleAgencyLogo.vue';
import Preview from '../DefaultNotificationPreview.vue';
import SupervisionBody from '../SupervisionBody.vue';
import AppointmentScheduleCheck from '../AppointmentScheduleCheck.vue';

const serviceLocations = [
  { id: 51, name: 'Office', place_of_service: '11', location_kind: 'office_pos', billing_office_location_id: 88, physical_office_location_id: 8, billing_office_name: 'Main office', street_address: '123 Main St' },
  { id: 52, name: 'Virtual', place_of_service: '10', billing_office_location_id: 88, physical_office_location_id: 8 },
  { id: 53, name: "Client's home", place_of_service: '12', billing_office_location_id: 88, physical_office_location_id: 8 }
];
let wrapper;
beforeEach(() => {
  setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  mocks.user = { id: 7, role: 'super_admin' };mocks.agency=null;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T21:00:00Z'));
  mocks.get.mockImplementation(async url => ({ data:
    url.includes('/service-code-eligibility') ? {serviceCodes:['90837']} :
    url.includes('/booking-access') ? { enabled: true } :
    url.includes('/booking-locations') ? { serviceLocations } :
    url.includes('/booking-metadata') ? { meetingPolicy:{providerId:7,usesGoogleSso:false,externalLinksAllowed:true}, serviceLocations, serviceCodes: [{ code: '90837', label: 'Psychotherapy', allowedPlaceOfService: ['11', '12', '02', '10'] }] } :
    url === '/offices' ? [{ id: 8, name: 'Main office', agencyIds: [2, 377] }] :
    url.includes('agencies') ? [] : {}
  }));
  mocks.post.mockResolvedValue({ data: {} });
  mocks.patch.mockResolvedValue({ data: { ok: true } });
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(['provider','admin','support'])('keeps a December 3 Denver 5 PM appointment at 5 PM when a %s opens it',async role=>{
 mocks.user={id:7,role};mocks.agency={id:2,slug:'test',organization_type:'agency',timezone:'America/Denver'};
 const event={id:910,eventId:910,kind:'PERSONAL_EVENT',eventKind:'PERSONAL_EVENT',label:'Client session',agencyId:2,providerId:7,appointmentId:821,clientId:2031,canEdit:true,canReschedule:true,startAt:'2026-12-04T00:00:00Z',endAt:'2026-12-04T01:00:00Z',timeZone:'America/Denver',isClientSession:true};
 const appointment={id:821,agencyId:2,providerUserId:7,status:'scheduled',businessType:'mental_health',modality:'TELEHEALTH',serviceCode:'90837',sourceTimezone:'America/Denver',startAt:'2026-12-04 00:00:00',endAt:'2026-12-04 01:00:00',addonServiceCodes:['99051']};
 const base=mocks.get.getMockImplementation();mocks.get.mockImplementation((path,...args)=>path==='/appointments/821'?Promise.resolve({data:{appointment}}):base(path,...args));
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:true,RouterLink:true,ClinicalWorkspaceFrame:{template:'<div><slot /></div>'},AppointmentScheduleCheck:false}}});await flushPromises();
 const s=wrapper.vm.$.setupState;s.weekStart='2026-11-30';s.summary={weekStart:'2026-11-30',scheduleEvents:[event]};await nextTick();
 expect(s.cellBlocks('Thursday',17,0).some(b=>b.appointmentId===821)).toBe(true);
 expect(s.cellBlocks('Thursday',10,0).some(b=>b.appointmentId===821)).toBe(false);
 expect(s.quarterClockLabel('2026-12-04T00:15:00Z')).toMatch(/^(5|17):15(?:\s*PM)?$/i);
 await s.openAppointmentEditInScheduleModal({item:event,dayName:'Thursday',hour:17});await flushPromises();
 expect(s.editorDateYmd).toBe('2026-12-03');expect(s.editorStartTime).toBe('17:00');
 expect(s.editorSavedSchedule.id).toBe(821);expect(wrapper.findComponent(AppointmentScheduleCheck).find('[role="alert"]').exists()).toBe(false);
 expect(mocks.patch).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
 event.startAt='2026-12-03T17:00:00Z';event.endAt='2026-12-03T18:00:00Z';
 await s.openAppointmentEditInScheduleModal({item:event,dayName:'Thursday',hour:10});await flushPromises();
 expect(s.editorStartTime).toBe('10:00');
 expect(wrapper.findComponent(AppointmentScheduleCheck).get('[role="alert"]').text()).toContain('different times');
 expect(mocks.patch).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
 event.calendarStartAt=event.startAt;event.calendarEndAt=event.endAt;event.calendarTimingMismatch=true;
 event.startAt='2026-12-04T00:00:00Z';event.endAt='2026-12-04T01:00:00Z';
 s.summary={weekStart:'2026-11-30',scheduleEvents:[{...event}]};await nextTick();
 const corrected=s.cellBlocks('Thursday',17,0).find(b=>b.appointmentId===821);expect(corrected).toBeTruthy();
 expect(s.cellBlocks('Thursday',10,0).some(b=>b.appointmentId===821)).toBe(false);
 await s.openAppointmentEditInScheduleModal({item:corrected,dayName:'Thursday',hour:17});await flushPromises();
 expect(s.editorStartTime).toBe('17:00');expect(s.editorEndTime).toBe('18:00');
 expect(wrapper.findComponent(AppointmentScheduleCheck).get('details').text()).toContain('Older calendar copy');
 expect(mocks.patch).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
});

it('uses the viewed provider’s reserved room when a staff member opens Book Session', async () => {
  wrapper = shallowMount(Grid, { props: { userId: 9, agencyId: 2 }, global: { stubs: { Teleport: true, RouterLink: true } } });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-23'; s.modalDay = 'Thursday'; s.modalHour = 11; s.modalStartHour = 11; s.modalEndHour = 12;
  s.selectedActionAgencyId = 2;
  s.modalContext = { agencyId: 2, dateYmd: '2026-11-26', hour: 11, officeLocationId: 8, roomId: 10, assignedProviderId: 9, slotState: 'ASSIGNED_BOOKED' };
  s.showRequestModal = true;
  await flushPromises();
  await s.onQuickActionSelect({ id: 'individual_session' });
  await flushPromises();
  expect(s.editorModality).toBe('IN_PERSON');
  expect(s.editorOfficeLocationId).toBe(8);
  expect(s.editorRoomId).toBe(10);
  expect(s.scheduleActorUserId).toBe(9);
});

it('carries the reserved office, room, biweekly cadence and billing location into the session and keeps them after selecting a client', async () => {
  const track = vi.fn();
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2 }, global: { stubs: { Teleport: false, RouterLink: true, ScheduleBookingJobs: {template:'<div/>',setup:(_, {expose})=>{expose({track});return {};}} } } });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-23'; s.modalDay = 'Thursday'; s.modalHour = 15; s.modalStartHour = 15; s.modalEndHour = 16;
  s.selectedActionAgencyId = 2;
  s.modalContext = { agencyId: 2, dateYmd: '2026-11-26', hour: 15, officeLocationId: 8, roomId: 10, assignedProviderId: 7, slotState: 'ASSIGNED_BOOKED', bookedFrequency: 'BIWEEKLY', frequencyLabel: 'Every 2 weeks', bookingActiveUntilDate: '2027-02-18', standingAssignmentId: 19 };
  s.showRequestModal = true;
  await flushPromises();
  s.bookingStripFrequency = 'BIWEEKLY'; s.bookingStripUntil = '2027-02-18'; s.clientSessionBookingEnabled = true;
  s.scheduleEventOccurrenceCount = 2;
  s.onQuickActionSelect({ id: 'individual_session' });
  await flushPromises();
  expect(s.requestType).toBe('individual_session');
  expect(s.editorModality).toBe('IN_PERSON'); expect(s.bookingModality).toBe('IN_PERSON');
  expect(s.editorOfficeLocationId).toBe(8); expect(s.editorRoomId).toBe(10);
  expect(s.editorRecurrenceFrequency).toBe('BIWEEKLY'); expect(s.editorRecurrenceEndMode).toBe('until');
  expect(s.editorRecurrenceUntilDate).toBe('2027-02-18');
  expect(s.editorRecurrenceWeekdays).toEqual(['Thu']);
  expect(s.editorServiceLocationId).toBe(51); expect(s.bookingServiceLocationId).toBe(51);
  expect(s.editorServiceLocationOptions.map(row => row.id)).toEqual([51, 53]);
  expect(s.editorServiceLocationOptions[0].label).toContain('Main office');
  expect(s.editorServiceLocationOptions[0].label).toContain('123 Main St');
  s.virtualSessionSelectedClientIds = [81];
  await flushPromises(); // The catalog is now scoped to the selected client.
  s.bookingServiceCode = '90837';
  await nextTick();
  expect(s.bookingClassificationInvalidReason).toBe('');
  expect(s.normalizeBookingSelectionPayload()).toMatchObject({ agencyId: 2, clientId: 81, modality: 'IN_PERSON', serviceLocationId: 51 });
  s.editorNotificationMode = 'customizable';
  s.editorCustomReminders = [{id:'extra',channel:'email',offsetMinutes:60,message:'Arrive early',askConfirmation:true}];
  const job={id:'job-26',status:'queued',phase:'preparing',total:26,completed:0};
  mocks.post.mockResolvedValueOnce({data:{kind:'booking_job',job}});
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(s.showRequestModal).toBe(false);expect(track).toHaveBeenCalledWith(job,{restore:true});
  expect(mocks.get.mock.calls.some(([url])=>url.includes('/booking-jobs/job-26'))).toBe(false);
  expect(mocks.post).toHaveBeenCalledWith('/office-schedule/booking-requests', expect.objectContaining({
    agencyId: 2, clientId: 81, modality: 'IN_PERSON', serviceLocationId: 51,
    notificationMode:'customizable',customReminders:[expect.objectContaining({id:'extra',offsetMinutes:60,message:'Arrive early'})],
    officeLocationId: 8, roomId: 10, recurrence: 'BIWEEKLY', bookedOccurrenceCount: 7,
    startAt: '2026-11-26T15:00:00', endAt: '2026-11-26T16:00:00'
  }));
});

it('lets an admin edit the primary facilitator and add a cofacilitator while preserving the existing one', async () => {
  // Keep this permission test before the session in both runner time zones.
  vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
  mocks.user = { id: 507, role: 'admin' };
  const session = { id: 369, agencyId: 2, sessionType: 'group', supervisorUserId: 528, coFacilitatorUserId: 538, coFacilitatorUserIds: [538], startAt: '2026-11-13T01:00:00Z', endAt: '2026-11-13T02:00:00Z', modality: 'virtual', status: 'SCHEDULED' };
  const defaultGet = mocks.get.getMockImplementation();
  mocks.get.mockImplementation((url, ...args) => url.includes('/schedule-summary') ? Promise.resolve({ data: { supervisionSessions: [session] } }) : defaultGet(url, ...args));
  wrapper = shallowMount(Grid, {
    props: { userId: 507, agencyId: 2 },
    global: { stubs: {
      Teleport: false, RouterLink: true,
      ClinicalWorkspaceFrame: { template: '<div><slot /></div>' },
      AppointmentEditorShell: { template: '<div><slot /></div>' }
    } }
  });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-09';
  s.summary = { supervisionSessions: [session] };
  s.openSupervisionEditInScheduleModal('Thursday', 18, 369, true);
  await flushPromises();
  expect(s.canSaveSelectedSupvSession).toBe(true);
  expect(s.supervisionFacilitatorUserId).toBe(528); expect(s.supervisionCoFacilitatorUserIds).toEqual([538]);
  const body = wrapper.findAllComponents(SupervisionBody).find(component => component.props('section') === 'details');
  expect(body.props('multipleCoFacilitators')).toBe(true);
  body.vm.$emit('update:coFacilitatorUserIds', [538, 507]);
  body.vm.$emit('update:facilitatorUserId', 507);
  await nextTick();
  expect(s.supervisionCoFacilitatorUserIds).toEqual([538]);
  body.vm.$emit('update:facilitatorUserId', 501);
  body.vm.$emit('update:coFacilitatorUserIds', [538, 507]);
  await nextTick();
  await s.saveSupvSession({ scope: 'single' });
  expect(s.supvModalError).toBe('');
  expect(mocks.patch).toHaveBeenCalledWith('/supervision/sessions/369', expect.objectContaining({ supervisorUserId: 501, coFacilitatorUserIds: [538, 507] }));
});

it('keeps session locations as a selector when the catalog is empty or loading', async () => {
  wrapper = mount(Header, { props: { bookSessionLayout: true, modality: 'IN_PERSON', locationOptionsLoading: true }, global: { stubs: { ScheduleAgencyLogo: true } } });
  expect(wrapper.get('select[aria-label="Service location"]').element.disabled).toBe(true);
  expect(wrapper.text()).toContain('Loading locations');
  expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  await wrapper.setProps({ locationOptionsLoading: false });
  expect(wrapper.text()).toContain('Billing settings');
});

it('uses the agency logo and falls back to its bundled mark if a logo fails', async () => {
  wrapper = mount(Logo, { props: { agencyId: 2, iconUrl: '/missing-icon.png' } });
  expect(wrapper.get('img').attributes('src')).toBe('/assets/branding/innerstrength-mark.png');
  await wrapper.get('img').trigger('error');
  expect(wrapper.get('img').attributes('src')).toBe('/missing-icon.png');
  await wrapper.get('img').trigger('error');
  expect(wrapper.get('img').attributes('src')).toBe('/assets/branding/innerstrength-favicon-v2.png');
});

it('previews configured notification timing and message text without sending', async () => {
  mocks.get.mockResolvedValue({ data: { settings: {
    platform: { channels: { email: 'available', sms: 'disabled' }, minRules: [] },
    channelsEnabled: { email: true },
    bookingConfirmation: { enabled: true, channels: ['email'], message: 'Your appointment is booked.' },
    standardReminder: { enabled: true, channels: ['email'], offsetValue: 2, offsetUnit: 'hours', message: 'Your session is coming up.' }
  } } });
  wrapper = mount(Preview, { props: { agencyId: 2 } });
  expect(mocks.get).not.toHaveBeenCalled();
  wrapper.get('details').element.open = true;
  await wrapper.get('details').trigger('toggle'); await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/tenant-booking/agencies/2/session-notifications');
  expect(wrapper.text()).toContain('After booking'); expect(wrapper.text()).toContain('2 hours before');
  expect(wrapper.text()).toContain('Your appointment is booked.'); expect(wrapper.text()).toContain('Your session is coming up.');
  expect(mocks.post).not.toHaveBeenCalled();
});

async function openReservation() {
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2 }, global: { stubs: { Teleport: false, RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } } } });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-23'; s.modalDay = 'Thursday'; s.modalHour = 15; s.modalStartHour = 15; s.modalEndHour = 16;
  s.selectedActionAgencyId = 2;
  s.modalContext = { agencyId: 2, dateYmd: '2026-11-26', hour: 15, officeLocationId: 8, roomId: 10, roomLabel: 'Office #10', assignedProviderId: 7, slotState: 'ASSIGNED_BOOKED', bookedFrequency: 'WEEKLY', frequencyLabel: 'Weekly', standingAssignmentId: 19, officeEventId: 91 };
  s.showRequestModal = true;
  await flushPromises();
  s.syncBookingStripFromContext();
  await nextTick();
  return s;
}
it('anchors editing to the selected date, time and room and prevents occurrence scope after a cadence change', async () => {
  const s = await openReservation();
  const editor = new DOMWrapper(document.body).get('.modal-backdrop--request');
  const context = editor.get('[data-testid="selected-office-reservation"]');
  expect(context.text()).toContain('Thursday, November 26, 2026');
  expect(context.text()).toContain('3:00 PM–4:00 PM'); expect(context.text()).toContain('Office #10');
  s.bookingStripFrequency = 'BIWEEKLY'; await nextTick();
  expect(editor.get('select[aria-label="Reservation edit scope"] option[value="occurrence"]').element.disabled).toBe(true);
  expect(s.bookingMoveScope).toBe('future');
});
it('locks recurrence for one-date edits and moves only that occurrence without a booking-plan write', async () => {
  const s = await openReservation();
  const editor = new DOMWrapper(document.body).get('.modal-backdrop--request');
  await editor.get('select[aria-label="Reservation edit scope"]').setValue('occurrence');
  expect(s.bookingStripFrequency).toBe('ONCE'); expect(s.bookingStripDirty).toBe(false);
  const repeat = editor.get('[data-testid="schedule-booking-meta"] select');
  expect(repeat.element.disabled).toBe(true);
  s.onModalStartTimeInput('16:00'); await nextTick();
  s.onModalEndTimeInput('17:00'); await nextTick();
  expect(s.editorStartTime).toBe('16:00'); expect(s.editorEndTime).toBe('17:00');
  expect(s.bookingStripDirty).toBe(true);
  await s.saveBookingStripEdits();
  expect(s.bookingStripError).toBe('');
  expect(mocks.post).toHaveBeenCalledWith('/office-slots/8/events/91/reschedule', expect.objectContaining({ scope: 'single', startAt: '2026-11-26T16:00:00', endAt: '2026-11-26T17:00:00' }), expect.anything());
  expect(mocks.post.mock.calls.some(([url]) => /booking-plan|recurrence|temporary/.test(url))).toBe(false);
});
it('uses the selected session agency even when only the office owner agency is shown on the calendar', async () => {
  const s = await openReservation();
  s.selectedActionAgencyId = 377;
  await nextTick();
  s.onQuickActionSelect({ id: 'individual_session' }); await flushPromises();
  s.editorPracticeCategory = 'mental_health';
  // The assigned-client selector loads after the agency/service context changes.
  await flushPromises();
  s.bookingServiceCode = '90837'; s.bookingModality = 'IN_PERSON';
  s.bookingServiceLocationId = 51; s.virtualSessionSelectedClientIds = [81];
  await flushPromises();
  expect(s.editorAgencyId).toBe(377);
  expect(s.normalizeBookingSelectionPayload()).toMatchObject({ agencyId: 377 });
  expect(mocks.get).toHaveBeenCalledWith('/users/7/virtual-session-clients', expect.objectContaining({ params: expect.objectContaining({ agencyId: 377 }) }));
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(mocks.post).toHaveBeenCalledWith('/office-schedule/booking-requests', expect.objectContaining({ agencyId: 377, clientId: 81 }));
});
it('selects the office as soon as locations arrive while the slower service catalog is still loading', async () => {
  const base = mocks.get.getMockImplementation();
  let resolveMetadata;
  const metadata = new Promise(resolve => { resolveMetadata = resolve; });
  mocks.get.mockImplementation((url, ...args) => url.includes('/booking-metadata') ? metadata : base(url, ...args));
  const s = await openReservation();
  s.onQuickActionSelect({ id: 'individual_session' }); await flushPromises();
  expect(s.bookingLocationsLoading).toBe(false); expect(s.bookingMetadataLoading).toBe(true);
  expect(s.editorServiceLocationId).toBe(51);
  expect(mocks.get.mock.calls.filter(([url]) => url.includes('/booking-locations'))).toHaveLength(1);
  resolveMetadata({ data: { serviceLocations, serviceCodes: [] } }); await flushPromises();
  await vi.waitFor(() => expect(s.bookingMetadataLoading).toBe(false), { timeout: 3000 });
});
it('shows one default delivery when platform and agency both set a 24-hour email reminder', async () => {
  mocks.get.mockResolvedValue({ data: { settings: {
    platform: { channels: { email: 'available' }, minRules: [{ channel: 'email', offsetValue: 24, offsetUnit: 'hours' }] },
    channelsEnabled: { email: true }, bookingConfirmation: { enabled: false },
    standardReminder: { enabled: true, channels: ['email'], offsetValue: 24, offsetUnit: 'hours', message: 'Practice reminder' }
  } } });
  wrapper = mount(Preview, { props: { agencyId: 377, dateYmd: '2026-11-26', startTime: '15:00', timezoneLabel: 'Mountain Time' } });
  wrapper.get('details').element.open = true;
  await wrapper.get('details').trigger('toggle'); await flushPromises();
  expect(wrapper.findAll('li')).toHaveLength(1); expect(wrapper.text()).toContain('Practice reminder');
});

it('shares catalog requests, isolates practices and retries failed reads', async () => {
  const { createBookingCatalogCache } = await import('../../../utils/bookingCatalogCache.js');
  let resolve;
  const get = vi.fn().mockImplementation(() => new Promise(done => { resolve = done; }));
  const read = createBookingCatalogCache({ get });
  const first = read('/locations', { agencyId: 377, providerId: 501 });
  const second = read('/locations', { agencyId: 377, providerId: 501 });
  expect(get).toHaveBeenCalledOnce();
  resolve({ data: { serviceLocations: [44] } });
  expect(await first).toEqual(await second);
  await read('/locations', { agencyId: 377, providerId: 501 }); expect(get).toHaveBeenCalledOnce();
  get.mockRejectedValueOnce(new Error('temporary failure'));
  await expect(read('/locations', { agencyId: 2, providerId: 501 })).rejects.toThrow('temporary failure');
  get.mockResolvedValue({ data: { serviceLocations: [1] } });
  expect(await read('/locations', { agencyId: 2, providerId: 501 })).toEqual({ serviceLocations: [1] });
  expect(get).toHaveBeenCalledTimes(3);
});

it('shows a saved office client appointment when the room-reservation layer is hidden',async()=>{
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:2},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();const s=wrapper.vm.$.setupState;
 s.weekStart='2026-11-23';s.showMyRooms=false;s.summary={weekStart:'2026-11-23',officeEvents:[{id:18510,appointmentId:264,clientId:81,agencyId:2,_agencyId:2,buildingId:8,roomId:10,startAt:'2026-11-26T22:00:00Z',endAt:'2026-11-26T23:00:00Z',status:'BOOKED'}]};await nextTick();
 expect(s.summary.scheduleEvents).toEqual([expect.objectContaining({kind:'PERSONAL_EVENT',appointmentId:264,officeEventId:18510})]);
 const item={...s.summary.scheduleEvents[0],eventId:-18510,eventKind:'PERSONAL_EVENT'};expect(s.isEditableScheduleStackItem(item)).toBe(true);expect(s.isClientSessionScheduleEvent(item)).toBe(true);
 await s.openAppointmentEditInScheduleModal({item,dayName:'Thursday',hour:15});await flushPromises();expect(s.editorAppointmentId).toBe(264);
 expect(mocks.get.mock.calls.some(([url])=>String(url).includes('/schedule-events/-18510'))).toBe(false);
});


it('offers tutoring booking and both new/current-student openings without a clinical transition',async()=>{
 mocks.user={id:1496,role:'provider',workspaceServiceContext:{agencyId:453,canTutor:true,canClinical:false,learningOnly:true}};mocks.agency={id:453,slug:'nlu-qa-demo',organization_type:'agency',feature_flags:{qaSandbox:{program:'tutoring'}}};
 wrapper=shallowMount(Grid,{props:{userId:1496,agencyId:453},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();const s=wrapper.vm.$.setupState;
 expect(mocks.get).toHaveBeenCalledWith('/appointments/booking-access',expect.objectContaining({params:expect.objectContaining({agencyId:453,providerUserId:1496,businessType:'tutoring'})}));
 s.openAppointmentEditor({kind:'portal_intake',defaults:{availableForIntake:true}});await flushPromises();expect(s.editorOpeningServiceType).toBe('tutoring');expect(s.editorAvailableForIntake).toBe(true);expect(s.editorAvailableForSession).toBe(true);
 s.editingOpenSlot={virtualHoursId:246};s.openAppointmentEditor({mode:'edit',kind:'portal_intake',defaults:{serviceType:'tutoring',availableForIntake:true,availableForSession:false}});await flushPromises();expect(s.editorAvailableForSession).toBe(false);
 s.editorPracticeCategory='tutoring';s.editorTenantServices=[{id:320,businessType:'tutoring',serviceCode:'TUTORING',name:'Tutoring session',enrollmentLabel:'Tutoring — Math',defaultDurationMinutes:60}];await nextTick();expect(s.editorHeaderServiceOptions[0]).toMatchObject({id:320,name:'Tutoring — Math'});expect(s.editorHeaderServiceOptions[0].label).toContain('TUTORING');
 s.requestType='individual_session';await nextTick();s.editorPracticeCategory='tutoring';s.editorCanSetTutoringPrice=true;s.editorIndividualPrice={amountCents:100,reason:'Synthetic one-dollar session'};
 expect(s.normalizeBookingSelectionPayload().tutoringSessionPrice).toBeUndefined();
 s.editorPackageEntitlementId=77;expect(s.normalizeBookingSelectionPayload().packageEntitlementId).toBe(77);
 s.editorPackageEntitlementId=0;s.editorCanSetTutoringPrice=false;expect(s.normalizeBookingSelectionPayload().tutoringSessionPrice).toBeUndefined();
});
it('requests an agency scheduling capability for the scoped admin instead of requiring the admin to be a provider',async()=>{
 mocks.user={id:1807,role:'admin'};mocks.agency={id:453,slug:'nlu-qa-demo',organization_type:'agency',feature_flags:{}};
 wrapper=shallowMount(Grid,{props:{userId:1807,agencyId:453},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();
 expect(mocks.get).toHaveBeenCalledWith('/appointments/booking-access',expect.objectContaining({params:expect.objectContaining({agencyId:453,providerUserId:1807,businessType:'any',scope:'agency'})}));expect(wrapper.vm.$.setupState.clientSessionBookingEnabled).toBe(true);
});
it('uses Finley’s tutoring form and pricing capability when the viewer is the QA administrator',async()=>{
 mocks.user={id:1807,role:'admin'};mocks.agency={id:453,slug:'nlu-qa-demo',organization_type:'agency',feature_flags:{}};
 const base=mocks.get.getMockImplementation();mocks.get.mockImplementation((url,...args)=>url.includes('/booking-options')?Promise.resolve({data:{canSetTutoringSessionPrice:true,services:[{id:320,businessType:'tutoring',serviceCode:'TUTORING',name:'Math',defaultDurationMinutes:60,quotes:{TELEHEALTH:{amountCents:5000,rateCents:5000,rateUnit:'hour'}}}]}}):base(url,...args));
 wrapper=shallowMount(Grid,{props:{userId:1496,agencyId:453},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();const s=wrapper.vm.$.setupState;
 s.onQuickActionSelect({id:'individual_session'});await flushPromises();await s.loadEditorTenantServices();await nextTick();
 expect(s.editorPracticeCategory).toBe('tutoring');expect(s.editorIsLearning).toBe(true);expect(s.editorTenantServiceId).toBe(320);expect(s.editorCanSetTutoringPrice).toBe(true);
});

it.each([
 ['mental_health',''],['mental_health','https://video.example.test/counseling'],
 ['tutoring',''],['tutoring','https://video.example.test/tutoring']
])('books one NLU %s appointment with an optional external link (%s)',async(businessType,url)=>{
 mocks.agency={id:6,slug:'nlu',organization_type:'agency',feature_flags:{hasClinicalOrg:true,medicalBillingEnabled:true}};
 const base=mocks.get.getMockImplementation();
 mocks.get.mockImplementation((path,...args)=>path.includes('/virtual-session-clients')?Promise.resolve({data:{clients:[{id:81,full_name:'Synthetic Client'}]}}):base(path,...args));
 mocks.post.mockImplementation(async(path,payload)=>({data:path==='/appointments'?{appointment:{id:821,agencyId:6,businessType,videoRoomMode:payload.videoRoomMode,externalMeetingUrl:payload.externalMeetingUrl||null,providerScheduleEventId:910}}:path.includes('counseling')?{session:{publicId:'clinical-821'},sharePath:'/counseling/invite/clinical-821'}:{}}));
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:6},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();
 const s=wrapper.vm.$.setupState;
 s.weekStart='2026-11-23';s.modalDay='Thursday';s.modalHour=15;s.modalStartHour=15;s.modalEndHour=16;s.selectedActionAgencyId=6;
 s.modalContext={agencyId:6,dateYmd:'2026-11-26',hour:15,assignedProviderId:7};s.showRequestModal=true;await flushPromises();
 s.onQuickActionSelect({id:'individual_session'});await flushPromises();
 s.editorPracticeCategory=businessType;s.editorModality='TELEHEALTH';s.bookingModality='TELEHEALTH';await flushPromises();
 s.editorTenantServices=[{id:320,businessType,serviceCode:businessType==='tutoring'?'TUTORING':'90837',name:'Configured service',defaultDurationMinutes:60}];
 s.editorTenantServiceId=320;await flushPromises();
 s.editorExternalMeetingUrl=url;s.virtualSessionSelectedClientIds=[81];await flushPromises();s.bookingServiceCode=businessType==='tutoring'?'TUTORING':'90837';
 expect(s.editorExternalMeetingUrl).toBe(url);s.clientSessionBookingEnabled=true;await nextTick();
 expect({enabled:s.editorExternalMeetingsEnabled,agency:s.editorAgencyId,modality:s.editorModality,editing:s.isAppointmentEditMode,mode:s.editorVideoRoomMode}).toEqual({enabled:true,agency:6,modality:'TELEHEALTH',editing:false,mode:businessType==='tutoring'?'external':'unique_session'});expect(s.isQuarterHourRequestType).toBe(true);expect(s.submitActionLabel).toBe(businessType==='tutoring'?'Schedule':'Schedule & link video room');
 await s.submitRequest();await flushPromises();
 expect(s.modalError).toBe('');
 expect(mocks.post).toHaveBeenCalledWith('/appointments',expect.objectContaining({agencyId:6,providerUserId:7,videoRoomMode:businessType==='tutoring'?'external':'unique_session',participants:[expect.objectContaining({clientId:81})]}));
 if(businessType==='mental_health'){
  expect(mocks.post.mock.calls.filter(([path])=>path.includes('counseling'))).toHaveLength(1);
  expect(s.virtualSessionScheduledSessionKey).toBe('clinical-821');return;
 }
 expect(mocks.post.mock.calls.some(([path])=>path.includes('counseling'))).toBe(false);
 expect(s.virtualSessionScheduledSessionKey).toBe('external-appointment:821');expect(s.submitActionLabel).toBe(url?'Open external meeting':'Done');
 const open=vi.spyOn(window,'open').mockImplementation(()=>null);await s.submitRequest();
 expect(mocks.post.mock.calls.filter(([path])=>path==='/appointments')).toHaveLength(1);
 if(url)expect(open).toHaveBeenCalledWith(url,'_blank','noopener,noreferrer');else expect(s.showRequestModal).toBe(false);
});

it('opens an existing external appointment and saves an added link to that same appointment',async()=>{
 mocks.agency={id:6,slug:'nlu',organization_type:'agency',timezone:'America/Denver'};
 const event={id:910,eventId:910,kind:'PERSONAL_EVENT',eventKind:'PERSONAL_EVENT',label:'Virtual session',title:'Virtual session',agencyId:6,providerId:7,appointmentId:821,clientId:81,canEdit:true,startAt:'2026-11-26T22:00:00Z',endAt:'2026-11-26T23:00:00Z',timeZone:'America/Denver',isClientSession:true};
 const appointment={id:821,agencyId:6,providerUserId:7,status:'scheduled',businessType:'mental_health',modality:'TELEHEALTH',serviceCode:'90837',videoRoomMode:'external',externalMeetingUrl:null};
 const base=mocks.get.getMockImplementation();mocks.get.mockImplementation((path,...args)=>path==='/appointments/821'?Promise.resolve({data:{appointment}}):path==='/users/7/schedule-events/910'?Promise.resolve({data:{event}}):base(path,...args));
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:6},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();const s=wrapper.vm.$.setupState;
 s.weekStart='2026-11-23';await s.openAppointmentEditInScheduleModal({item:event,dayName:'Thursday',hour:15});await flushPromises();
 expect(s.editorAppointmentId).toBe(821);expect(s.editorVideoRoomMode).toBe('external');expect(s.editorExternalMeetingUrl).toBe('');
 s.editorExternalMeetingUrl='https://video.example.test/added';await nextTick();await s.saveScheduleStackItem(event,{scope:'single'});await flushPromises();
 expect(s.scheduleEventEditError).toBe('');expect(mocks.patch).toHaveBeenCalledWith('/appointments/821',expect.objectContaining({videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/added'}),expect.any(Object));
 expect(mocks.post.mock.calls.some(([path])=>path==='/appointments')).toBe(false);
});
it('does not offer external links for the scheduled SSO provider when booking staff have a different login policy',async()=>{
 mocks.agency={id:6,slug:'nlu',organization_type:'agency'};
 const base=mocks.get.getMockImplementation();mocks.get.mockImplementation((url,...args)=>url.includes('/booking-metadata')?Promise.resolve({data:{meetingPolicy:{providerId:7,usesGoogleSso:true,externalLinksAllowed:false},serviceCodes:[{code:'90837'}]}}):base(url,...args));
 wrapper=shallowMount(Grid,{props:{userId:7,agencyId:6},global:{stubs:{Teleport:false,RouterLink:true}}});await flushPromises();const s=wrapper.vm.$.setupState;
 s.weekStart='2026-11-23';s.selectedActionAgencyId=6;s.modalDay='Thursday';s.modalHour=15;s.modalEndHour=16;s.modalContext={agencyId:6,dateYmd:'2026-11-26',hour:15};s.showRequestModal=true;await flushPromises();
 s.onQuickActionSelect({id:'individual_session'});await flushPromises();expect(s.editorExternalMeetingsEnabled).toBe(false);expect(s.editorVideoRoomMode).toBe('unique_session');
});
