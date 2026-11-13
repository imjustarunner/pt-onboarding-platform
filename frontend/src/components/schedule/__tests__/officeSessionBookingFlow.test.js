import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), user: null }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get, post: mocks.post, patch: mocks.patch }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/innerstrength/dashboard', params: { organizationSlug: 'innerstrength' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.user, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({
  currentAgency: { id: 2, name: 'The Inner Strength Institute', slug: 'innerstrength', organization_type: 'agency', feature_flags: { hasClinicalOrg: true, medicalBillingEnabled: true }, logo_url: '/assets/branding/innerstrength-mark.png' },
  agencies: [{ id: 377, name: 'The Inner Strength Institute', slug: 'tisi', organization_type: 'agency', feature_flags: { hasClinicalOrg: true, medicalBillingEnabled: true } }], userAgencies: []
}) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import Header from '../AppointmentHeaderFields.vue';
import Logo from '../ScheduleAgencyLogo.vue';
import Preview from '../DefaultNotificationPreview.vue';
import SupervisionBody from '../SupervisionBody.vue';

const serviceLocations = [
  { id: 51, name: 'Office', place_of_service: '11', location_kind: 'office_pos', billing_office_location_id: 88, physical_office_location_id: 8, billing_office_name: 'Main office', street_address: '123 Main St' },
  { id: 52, name: 'Virtual', place_of_service: '10', billing_office_location_id: 88, physical_office_location_id: 8 },
  { id: 53, name: "Client's home", place_of_service: '12', billing_office_location_id: 88, physical_office_location_id: 8 }
];
let wrapper;
beforeEach(() => {
  setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  mocks.user = { id: 7, role: 'super_admin' };
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T21:00:00Z'));
  mocks.get.mockImplementation(async url => ({ data:
    url.includes('/booking-access') ? { enabled: true } :
    url.includes('/booking-locations') ? { serviceLocations } :
    url.includes('/booking-metadata') ? { serviceLocations, serviceCodes: [{ code: '90837', label: 'Psychotherapy', allowedPlaceOfService: ['11', '12', '02', '10'] }] } :
    url === '/offices' ? [{ id: 8, name: 'Main office', agencyIds: [2, 377] }] :
    url.includes('agencies') ? [] : {}
  }));
  mocks.post.mockResolvedValue({ data: {} });
  mocks.patch.mockResolvedValue({ data: { ok: true } });
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('carries the reserved office, room, biweekly cadence and billing location into the session and keeps them after selecting a client', async () => {
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2 }, global: { stubs: { Teleport: false, RouterLink: true } } });
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
  s.virtualSessionSelectedClientIds = [81]; s.bookingServiceCode = '90837';
  await nextTick();
  expect(s.bookingClassificationInvalidReason).toBe('');
  expect(s.normalizeBookingSelectionPayload()).toMatchObject({ agencyId: 2, clientId: 81, modality: 'IN_PERSON', serviceLocationId: 51 });
  s.editorNotificationMode = 'customizable';
  s.editorCustomReminders = [{id:'extra',channel:'email',offsetMinutes:60,message:'Arrive early',askConfirmation:true}];
  await s.submitRequest();
  expect(s.modalError).toBe('');
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
  const context = wrapper.get('[data-testid="selected-office-reservation"]');
  expect(context.text()).toContain('Thursday, November 26, 2026');
  expect(context.text()).toContain('3:00 PM–4:00 PM'); expect(context.text()).toContain('Office #10');
  s.bookingStripFrequency = 'BIWEEKLY'; await nextTick();
  expect(wrapper.get('select[aria-label="Reservation edit scope"] option[value="occurrence"]').element.disabled).toBe(true);
  expect(s.bookingMoveScope).toBe('future');
});
it('locks recurrence for one-date edits and moves only that occurrence without a booking-plan write', async () => {
  const s = await openReservation();
  await wrapper.get('select[aria-label="Reservation edit scope"]').setValue('occurrence');
  expect(s.bookingStripFrequency).toBe('ONCE'); expect(s.bookingStripDirty).toBe(false);
  const repeat = wrapper.get('[data-testid="schedule-booking-meta"] select');
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
  expect(s.bookingMetadataLoading).toBe(false);
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
