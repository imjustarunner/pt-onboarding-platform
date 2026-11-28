import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), push: vi.fn(), user: null, agency:null }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post, patch: m.patch }, isApiRateLimited: () => false, apiRateLimitRetryAt: () => 0 }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/test/dashboard', params: { organizationSlug: 'test' }, query: {} }), useRouter: () => ({ push: m.push, replace: vi.fn(), resolve: () => ({ href: '/test/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: m.user, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: m.agency, agencies: [], userAgencies: [] }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import Header from '../AppointmentHeaderFields.vue';
import Confirmation from '../VirtualSessionBookingConfirmation.vue';
import { clearScheduleSummaryCache } from '../../../utils/scheduleSummaryCache.js';
let wrapper;
const appointment = { id: 41, agencyId: 2, providerUserId: 7, providerScheduleEventId: 61, sourceTimezone: 'America/Denver', modality: 'TELEHEALTH',
  startAt: '2026-11-20 00:00:00', endAt: '2026-11-20 01:00:00', title: 'Virtual session', participants: [{ clientId: 8, role: 'client' }] };
beforeEach(() => {
  m.user = { id: 7, role: 'provider' };
  m.agency={id:2,name:'Test practice',slug:'test',organization_type:'agency',timezone:'America/Denver'};
  vi.clearAllMocks(); setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear(); clearScheduleSummaryCache();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-18T15:00:00Z'));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  m.get.mockImplementation(async url => ({ data: url.includes('/schedule-summary') ? { weekStart: '2026-11-16', scheduleEvents: [], videoConfigured: true } :
    url.endsWith('/booking-access') ? { enabled: true } : url === '/appointments/41' ? { appointment } : url.includes('agencies') ? [] : {} }));
  m.post.mockImplementation(async (url, body) => ({ data: url === '/appointments' ? { ok: true, appointment, appointments: [appointment] } :
    url === '/counseling/sessions/from-appointment' ? { session: { publicId: `room-${body.appointmentId}` }, sharePath: `/counseling/invite/invite-${body.appointmentId}` } : {} }));
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); clearScheduleSummaryCache(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function editor({ mode = 'self' } = {}) {
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2, mode, weekStartYmd: '2026-11-16' }, global: { stubs: { Teleport: true, RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' }, VirtualSessionBookingConfirmation: false } } });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-16'; s.modalDay = 'Thursday'; s.modalHour = 17; s.modalStartHour = 17; s.modalEndHour = 18;
  s.selectedActionAgencyId = 2; s.requestType = 'individual_session'; s.showRequestModal = true;
  await flushPromises();
  s.clientSessionBookingEnabled = true; s.bookingModality = 'TELEHEALTH'; s.editorModality = 'TELEHEALTH';
  s.virtualSessionSelectedClientIds = [8]; s.virtualSessionClients = [{ id: 8, displayName: 'Example client' }]; s.bookingServiceCode = '90837';
  s.scheduleEventRecurrence = 'ONCE'; s.editorRecurrenceEndMode = 'count'; s.editorRecurrenceOccurrenceCount = 1;
  await flushPromises(); return s;
}
const countCreates = () => m.post.mock.calls.filter(([url]) => url === '/appointments').length;

async function schoolClientEditor({ synthetic = false } = {}) {
  const base = m.get.getMockImplementation();
  const serviceLocations = [
    { id: 51, name: 'Assigned office', place_of_service: '11', physical_office_location_id: 8 },
    { id: 52, name: 'Virtual', place_of_service: '10' },
    { id: 54, name: 'Unassigned school', place_of_service: '03', school_organization_id: 40 },
    ...(!synthetic ? [{ id: 53, name: 'Assigned school', place_of_service: '03', school_organization_id: 30 }] : [])
  ];
  const clients = [{ id: 8, displayName: 'School client', clientType: 'school', schools: [{ schoolOrganizationId: 30, name: 'Assigned school' }] }];
  m.get.mockImplementation(async (url, ...args) => url.includes('virtual-session-clients') ? { data: { clients } } : /booking-(metadata|locations)/.test(url)
    ? { data: { serviceLocations, serviceCodes: [{ code: '90837' }, { code: '90832' }] } }
    : base(url, ...args));
  const s = await editor();
  s.virtualSessionClients = clients;
  s.editorModality = 'IN_PERSON';
  await s.loadBookingMetadataForProvider(); await flushPromises();
  return s;
}

it('defaults to the assigned school, retains office and virtual choices, and excludes unassigned schools', async () => {
  const s = await schoolClientEditor();
  expect(s.editorServiceLocationId).toBe(53);
  expect(s.editorServiceLocationOptions.map(l => l.id)).toEqual([53, 51]);
  s.onEditorOfficeLocationId(8); await flushPromises();
  expect(s.editorServiceLocationId).toBe(51); expect(s.editorSchoolOrganizationId).toBe(0);
  s.editorModality = 'TELEHEALTH'; await flushPromises();
  expect(s.editorServiceLocationId).toBe(0); expect(s.editorSchoolOrganizationId).toBe(0);
  expect(s.editorServiceLocationOptions.map(location => location.id)).toEqual([52]);
});

it('offers only schools shared by all selected clients and no schools before selecting a client', async () => {
  const s = await schoolClientEditor();
  s.virtualSessionClients = [...s.virtualSessionClients, { id: 9, displayName: 'Other client', schools: [{ schoolOrganizationId: 40, name: 'Other school' }] }];
  s.virtualSessionSelectedClientIds = [8, 9]; await flushPromises();
  expect(s.editorServiceLocationOptions.some(l => l.isSchool)).toBe(false);
  s.virtualSessionSelectedClientIds = []; await flushPromises();
  expect(s.editorServiceLocationOptions.some(l => l.isSchool)).toBe(false);
});

it('prepares a default synthetic school location before saving the school appointment', async () => {
  const s = await schoolClientEditor({ synthetic: true });
  expect(s.editorServiceLocationId).toBe(-30);
  const base = m.post.getMockImplementation();
  m.post.mockImplementation(async (url, body) => url.includes('ensure-school') ? { data: { item: { id: 53 } } } : base(url, body));
  await s.submitRequest(); await flushPromises();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({ serviceLocationId: 53, modality: 'IN_PERSON' }), { skipGlobalLoading: true });
});

it('blocks a school appointment if its default school location cannot be prepared', async () => {
  const s = await schoolClientEditor({ synthetic: true });
  await s.submitRequest(); await flushPromises();
  expect(s.modalError).toContain('school service location could not be prepared'); expect(countCreates()).toBe(0);
});

it('offers a private Google Meet option for counseling', () => {
  wrapper = mount(Header, { props: { showModality: true, modality: 'TELEHEALTH', videoRoomMode: 'google_meet', recurrenceFrequency: 'WEEKLY' } });
  expect(wrapper.text()).toContain('Each upcoming session gets its own link.');
  expect(wrapper.text()).not.toContain('personal link'); expect(wrapper.find('option[value="my_room"]').exists()).toBe(false);
});

it('saves one appointment, creates its private Google Meet link, and keeps a clear saved confirmation with the correct calendar time', async () => {
  const s = await editor(); s.editorVideoRoomMode = 'my_room';
  const fallback = m.post.getMockImplementation();
  m.post.mockImplementation(async (url, body) => {
    if (url === '/appointments') {
      const saved = { ...appointment, videoRoomMode: body.videoRoomMode };
      return { data: { appointment: saved, appointments: [saved] } };
    }
    if (url === '/counseling/sessions/from-appointment') return { data: { meetUrl: 'https://meet.google.com/abc-defg-hij' } };
    return fallback(url, body);
  });
  await s.submitRequest(); await flushPromises();
  expect(s.modalError).toBe(''); expect(countCreates()).toBe(1);
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({ videoRoomMode: 'google_meet', startAt: '2026-11-19T17:00:00' }), { skipGlobalLoading: true });
  expect(m.get.mock.calls.some(([url]) => url === '/my-room/me')).toBe(false);
  expect(wrapper.get('[data-testid="virtual-session-booked"]').text()).toContain('Session scheduled');
  expect(s.virtualSessionShareUrl).toBe('https://meet.google.com/abc-defg-hij');
  expect(wrapper.find('[data-testid="appointment-workspace"]').exists()).toBe(false);
  const block = s.cellBlocks('Thursday', 17, 0).find(b => b.appointmentId === 41);
  expect(block).toBeTruthy(); expect(s.summary.scheduleEvents.find(e => e.appointmentId === 41).startAt).toBe('2026-11-20T00:00:00.000Z');
  expect(s.editorAppointmentId).toBe(0);
});

it('makes Done close a saved booking without a discard prompt and keeps it visible after refresh', async () => {
  const s = await editor(); await s.submitRequest(); await flushPromises();
  await wrapper.findAll('button').find(b => b.text() === 'Done').trigger('click'); await flushPromises();
  expect(window.confirm).not.toHaveBeenCalled(); expect(s.showRequestModal).toBe(false);
  expect(s.summary.scheduleEvents.some(e => e.appointmentId === 41)).toBe(true); expect(countCreates()).toBe(1);
});

it('retries a video-link failure against the same saved appointment', async () => {
  const s = await editor(); const base = m.post.getMockImplementation(); let fail = true;
  m.post.mockImplementation(async (url, body) => { if (url.includes('/from-appointment') && fail) throw { response: { status: 503, data: { error: { message: 'Video unavailable' } } } }; return base(url, body); });
  await s.submitRequest(); await flushPromises();
  expect(s.virtualSessionBookingResult.appointments[0].id).toBe(41); expect(s.modalError).toContain('Video unavailable');
  expect(wrapper.text()).toContain('appointment is saved'); expect(countCreates()).toBe(1);
  fail = false; await s.retryVirtualSessionVideo(); await flushPromises();
  expect(s.virtualSessionShareUrl).toContain('/counseling/invite/invite-41'); expect(countCreates()).toBe(1);
});

it('creates a separate room for each recurrence and retries only unfinished links', async () => {
  const s = await editor(); const base = m.post.getMockImplementation(); let fail = true;
  m.post.mockImplementation(async (url, body) => {
    if (url === '/appointments') return { data: { appointment, appointments: [appointment, { ...appointment, id: 42, providerScheduleEventId: 62 }], recurrenceSeriesId: 'series-1' } };
    if (url.includes('/from-appointment') && body.appointmentId === 42 && fail) throw { response: { status: 503, data: { error: { message: 'Retry this room' } } } };
    return base(url, body);
  });
  await s.submitRequest(); fail = false; await s.retryVirtualSessionVideo();
  expect(countCreates()).toBe(1);
  expect(m.post.mock.calls.filter(([url, body]) => url.includes('/from-appointment') && body.appointmentId === 41)).toHaveLength(1);
  expect(Object.keys(s.virtualSessionBookingResult.videoRooms)).toEqual(['41', '42']);
});

it('preserves known saved appointments when calendar creation fails partway through', async () => {
  const s = await editor();
  m.post.mockRejectedValueOnce({ response: { status: 500, data: { createdAppointmentIds: [41], error: { message: 'Calendar save failed' } } } });
  await s.submitRequest();
  expect(s.virtualSessionBookingResult).toMatchObject({ partial: true, appointments: [{ id: 41 }] });
  expect(s.summary.scheduleEvents.some(e => e.appointmentId === 41)).toBe(true);
  await s.retryVirtualSessionVideo(); expect(countCreates()).toBe(1);
});

it('blocks blind rebooking after an interrupted appointment response', async () => {
  const s = await editor(); m.post.mockRejectedValueOnce(new Error('response lost'));
  await s.submitRequest(); expect(s.virtualSessionBookingResult.uncertain).toBe(true);
  await s.submitRequest(); await s.retryVirtualSessionVideo(); expect(countCreates()).toBe(1);
});

it('ignores another Schedule click while the first booking is saving', async () => {
  const s = await editor(); let finish; const base = m.post.getMockImplementation();
  m.post.mockImplementation((url, body) => url === '/appointments' ? new Promise(resolve => { finish = resolve; }) : base(url, body));
  const pending = s.submitRequest(); await flushPromises(); await s.submitRequest();
  expect(countCreates()).toBe(1); finish({ data: { appointment, appointments: [appointment] } }); await pending;
});

it('places a wall-clock booking at 5 PM Mountain rather than interpreting its input as 5 PM UTC', async () => {
  const s = await editor();
  s.patchScheduleSummaryWithBookedEvent({ eventId: 99, agencyId: 2, title: 'Session', startAt: '2026-11-19T17:00:00', endAt: '2026-11-19T18:00:00', wallTimeZone: 'America/Denver' });
  expect(s.summary.scheduleEvents.find(e => e.id === 99).startAt).toBe('2026-11-20T00:00:00.000Z');
});

it.each(['provider','provider_plus','clinical_practice_assistant','admin','support','staff'])('keeps provider, timezone, and calendar position consistent when %s books a session', async role => {
  m.user = {id: role === 'provider' ? 7 : 9, role};
  const s = await editor({ mode: role === 'provider' ? 'self' : 'admin' });
  await s.submitRequest(); await flushPromises();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({providerUserId:7,timeZone:'America/Denver',startAt:'2026-11-19T17:00:00',videoRoomMode:'google_meet'}), { skipGlobalLoading: true });
  expect(s.cellBlocks('Thursday',17,0).some(block => block.appointmentId === 41)).toBe(true);
  expect(countCreates()).toBe(1);
});

it('records a past virtual appointment quietly and closes its saved receipt', async () => {
  const s = await editor();
  s.modalDay = 'Monday';
  await flushPromises();
  expect(s.editorHistoricalBooking).toBe(true);
  const saved = { ...appointment, startAt: '2026-11-17 00:00:00', endAt: '2026-11-17 01:00:00',
    videoRoomMode: 'none', notificationMode: 'off' };
  m.post.mockResolvedValueOnce({ data: { appointment: saved, appointments: [saved] } });
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
    startAt: '2026-11-16T17:00:00', sendBookingNotice: false, notificationMode: 'off', videoRoomMode: 'none'
  }), { skipGlobalLoading: true });
  expect(m.post.mock.calls.filter(([url]) => url.includes('/from-appointment'))).toHaveLength(0);
  expect(wrapper.get('[data-testid="virtual-session-booked"]').text()).toContain('Past session recorded');
  await wrapper.findAll('button').find(button => button.text() === 'Done').trigger('click');
  expect(window.confirm).not.toHaveBeenCalled();
});

it('records a past in-person office visit at its service location without requesting a room', async () => {
  const s = await schoolClientEditor();
  s.modalDay = 'Monday';
  await s.onEditorServiceLocationId(51);
  await flushPromises();
  expect(s.editorHistoricalBooking).toBe(true);
  expect(s.editorShowOfficeRequestCta).toBe(false);
  expect(s.requestSubmitBlockedReason).toBe('');
  const saved = { ...appointment, serviceLocationId: 51, modality: 'IN_PERSON',
    startAt: '2026-11-17 00:00:00', endAt: '2026-11-17 01:00:00', videoRoomMode: 'none' };
  m.post.mockResolvedValueOnce({ data: { appointment: saved, appointments: [saved] } });
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
    serviceLocationId: 51, modality: 'IN_PERSON', sendBookingNotice: false, notificationMode: 'off', videoRoomMode: 'none'
  }), { skipGlobalLoading: true });
  expect(m.post.mock.calls.some(([url]) => /office-schedule|office-slots|from-appointment/.test(url))).toBe(false);
  expect(wrapper.get('[data-testid="virtual-session-booked"]').text()).toContain('Past session recorded');
});

it('preserves future series preferences when the first occurrence is in the past', async () => {
  const s = await editor();
  s.modalDay = 'Monday';
  s.scheduleEventRecurrence = 'WEEKLY';
  s.editorRecurrenceOccurrenceCount = 2;
  await flushPromises();
  expect(s.editorSeriesStartsInPast).toBe(true);
  expect(s.editorHistoricalBooking).toBe(false);
  const past = { ...appointment, startAt: '2026-11-17 00:00:00', endAt: '2026-11-17 01:00:00', videoRoomMode: 'none' };
  const future = { ...appointment, id: 42, providerScheduleEventId: 62, startAt: '2026-11-24 00:00:00', endAt: '2026-11-24 01:00:00' };
  m.post.mockResolvedValueOnce({ data: { appointment: past, appointments: [past, future], recurrenceSeriesId: 'series-1' } });
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(m.post.mock.calls[0][1]).toMatchObject({
    recurrence: 'WEEKLY', occurrenceCount: 2, sendBookingNotice: true, notificationMode: 'default', videoRoomMode: 'google_meet'
  });
  expect(m.post.mock.calls.filter(([url]) => url.includes('/from-appointment')).map(([, body]) => body.appointmentId)).toEqual([42]);
});

it('keeps confirmation, reminders, and video choices independent for an upcoming session', async () => {
  const s = await editor();
  s.editorBookingNotice = false;
  s.editorNotificationMode = 'off';
  s.editorVideoRoomMode = 'none';
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
    sendBookingNotice: false, notificationMode: 'off', videoRoomMode: 'none'
  }), { skipGlobalLoading: true });
  expect(m.post.mock.calls.filter(([url]) => url.includes('/from-appointment'))).toHaveLength(0);
  expect(wrapper.text()).toContain('Session scheduled');
});

it('saves typed minute times for a recurring school session', async () => {
  const s = await schoolClientEditor();
  s.bookingServiceCode = '90832';
  s.onEditorStartTime('17:07');
  s.onEditorEndTime('17:39');
  s.editorRecurrenceFrequency = 'WEEKLY';
  s.editorRecurrenceOccurrenceCount = 3;
  await flushPromises();
  expect(s.editorStartTime).toBe('17:07');
  expect(s.editorEndTime).toBe('17:39');
  await s.submitRequest();
  expect(s.modalError).toBe('');
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
    startAt: '2026-11-20T00:07:00.000Z', endAt: '2026-11-20T00:39:00.000Z', recurrence: 'WEEKLY', occurrenceCount: 3, modality: 'IN_PERSON'
  }), { skipGlobalLoading: true });
});

it('flags a nonexistent school session time when the local clock springs forward', async () => {
  const s = await schoolClientEditor();
  s.onEditorDateYmd('2027-03-14');
  s.onEditorStartTime('02:15');
  s.onEditorEndTime('03:15');
  await flushPromises();
  await s.submitRequest();
  expect(s.modalError).toContain('valid start and end time');
  expect(countCreates()).toBe(0);
});

it('keeps the reserved office when the chosen client has an assigned school', async () => {
  const s = await schoolClientEditor();
  const base = m.get.getMockImplementation();
  m.get.mockImplementation((url, ...args) => url === '/offices'
    ? Promise.resolve({ data: [{ id: 8, name: 'Main office', timezone: 'America/Denver', agencyIds: [2] }] })
    : base(url, ...args));
  const clients = s.virtualSessionClients;
  s.virtualSessionSelectedClientIds = [];
  s.requestType = '';
  s.modalActionSource = 'office_block';
  s.modalContext = { agencyId: 2, dateYmd: '2026-11-19', hour: 17, officeLocationId: 8, roomId: 10,
    officeEventId: 18510, bookedProviderId: 7, assignedProviderId: 222, slotState: 'BOOKED' };
  await flushPromises();
  await s.onQuickActionSelect({ id: 'individual_session' });
  await flushPromises();
  s.virtualSessionClients = clients;
  s.virtualSessionSelectedClientIds = [8];
  s.bookingServiceCode = '90837';
  await flushPromises();
  expect(s.editorModality).toBe('IN_PERSON');
  expect(s.editorServiceLocationId).toBe(51);
  expect(s.editorSchoolOrganizationId).toBe(0);
  expect(s.editorServiceLocationOptions.some(location => location.id === 53)).toBe(true);
  await s.submitRequest();
  expect(m.post).toHaveBeenCalledWith('/office-schedule/booking-requests', expect.objectContaining({ serviceLocationId: 51, roomId: 10, clientId: 8 }));
  expect(countCreates()).toBe(0);
});

it('shows the duration conflict while keeping the selected psychotherapy code and typed minutes', async () => {
  const base = m.get.getMockImplementation();
  m.get.mockImplementation((url, ...args) => url.includes('/booking-metadata')
    ? Promise.resolve({ data: { serviceCodes: [{ code: '90837' }] } }) : base(url, ...args));
  const s = await editor();
  s.bookingServiceCode = '90837';
  s.onEditorEndTime('17:34');
  await flushPromises();
  expect(s.bookingServiceCode).toBe('90837');
  expect(s.editorEndTime).toBe('17:34');
  expect(s.bookingServiceSelectionIssue).toContain('90837 requires at least 53 minutes. This session is 34 minutes.');
});

it.each(['90791', 'H0004'])('can manually book an approved %s without waiting for payer eligibility', async code => {
  const base = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, ...args) => {
    if (url.includes('/medical-billing/service-code-eligibility')) throw new Error('Payer eligibility unavailable');
    if (url.includes('/booking-metadata')) return {
      data: { serviceCodes: [{ code: '90791' }, { code: 'H0004' }, { code: '90837' }] }
    };
    return base(url, ...args);
  });
  const s = await editor();
  s.virtualSessionSelectedClientIds = [9];
  s.bookingServiceCode = code;
  s.onEditorEndTime('17:32');
  await flushPromises();

  expect(s.bookingServiceSelectionIssue).toBe('');
  expect(s.bookingServiceCode).toBe(code);
  expect(s.editorEndTime).toBe('17:32');
  await s.submitRequest();
  await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({ serviceCode: code }), { skipGlobalLoading: true });
  expect(m.get.mock.calls.some(([url]) => url.includes('/medical-billing/service-code-eligibility'))).toBe(false);
});

it('shows the credential reason when the scheduling catalog excludes 90791', async () => {
  const base = m.get.getMockImplementation();
  const reason = 'The provider’s credential tier is not eligible to book 90791.';
  m.get.mockImplementation((url, options, ...args) => url.includes('/booking-metadata')
    ? Promise.resolve({ data: options?.params?.clientIds
      ? { serviceCodes: [], diagnosticBookingIssue: reason }
      : { serviceCodes: [{ code: '90791' }] } })
    : base(url, options, ...args));
  const s = await editor();
  s.bookingServiceCode = '90791';
  s.virtualSessionSelectedClientIds = [9];
  await flushPromises();
  expect(s.bookingServiceSelectionIssue).toBe(reason);
});

it('adds a guardian from the selected account and preserves a written name', async () => {
  const s = await editor();
  s.editorClinicalParticipantsMode = 'Client and Others';
  await flushPromises();
  s.editorOthersPresentNames = 'Family friend';
  s.virtualSessionGuardians = [
    { userId: 14, clientId: 8, displayName: 'Linked Parent' },
    { userId: 15, clientId: 9, displayName: 'Unrelated Parent' }
  ];
  expect(s.editorLinkedGuardians.map(person => person.userId)).toEqual([14]);
  s.addEditorLinkedGuardian({ target: { value: 'Linked Parent' } });
  await s.submitRequest();
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({ othersPresentNames: 'Family friend, Linked Parent' }), { skipGlobalLoading: true });
});

it('offers tutoring only for the selected provider’s authorized services in this agency', async () => {
  const s = await editor({ mode: 'admin' });
  s.editorPracticeCategories = ['mental_health', 'tutoring'];
  s.bookingProviderBusinessTypes = ['mental_health'];
  s.editorTenantServices = [{ id: 21, businessType: 'mental_health', serviceCode: '90837' }];
  await flushPromises();
  expect(s.editorBookServiceChoices.map(row => row.value)).toEqual(['mental_health']);
  expect(s.mixedSessionServices).toBe(false);
  s.bookingProviderBusinessTypes = ['mental_health', 'tutoring'];
  s.editorTenantServices = [...s.editorTenantServices, { id: 22, businessType: 'tutoring', serviceCode: 'TUTORING' }];
  await flushPromises();
  expect(s.editorBookServiceChoices.map(row => row.value)).toEqual(['mental_health', 'tutoring']);
  expect(s.mixedSessionServices).toBe(true);
});

it('saves an audio-only appointment with the client setting and never requests a video link', async () => {
  const s = await schoolClientEditor();
  s.editorModality = 'TELEHEALTH';
  s.editorAudioOnly = true;
  await flushPromises();
  expect(s.requestSubmitBlockedReason).toContain('where the client will be');
  await s.onEditorServiceLocationId(52);
  await s.submitRequest();
  expect(m.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
    audioOnly: true, serviceLocationId: 52, videoRoomMode: 'none'
  }), { skipGlobalLoading: true });
  expect(m.post.mock.calls.some(([url]) => url.includes('/counseling/sessions/'))).toBe(false);
});

it('filters Book Session by provider offering and hides staff time codes', async () => {
  const s = await editor();
  s.editorPracticeCategories = ['mental_health', 'tutoring'];
  s.bookingProviderBusinessTypes = ['mental_health'];
  s.editorTenantServices = [{ id: 21, businessType: 'mental_health', serviceCode: '90837' }];
  s.bookingMetadata = { ...s.bookingMetadata, serviceCodes: [
    { code: '90837' }, { code: 'ADMIN TIME' }, { code: 'TUTORING' }
  ] };
  await flushPromises();
  expect(s.editorBookServiceChoices).toEqual([{ value: 'mental_health', label: 'Clinical' }]);
  expect(s.bookingServiceCodeOptions.map(item => item.code)).toEqual(['90837']);
  const base = m.get.getMockImplementation();
  m.get.mockImplementation((url, ...args) => url.endsWith('/booking-options')
    ? Promise.resolve({ data: { clientSessionCategories: ['tutoring'], sessionOnly: true,
      services: [{ id: 22, businessType: 'tutoring', serviceCode: 'TUTORING' }] } })
    : base(url, ...args));
  s.bookingProviderBusinessTypes = ['mental_health', 'tutoring'];
  s.clientSessionCategories = ['tutoring'];
  s.editorTenantServices = [{ id: 22, businessType: 'tutoring', serviceCode: 'TUTORING' }];
  await flushPromises();
  expect(s.editorBookServiceChoices).toEqual([{ value: 'tutoring', label: 'Learning' }]);
});

async function nluEditor(){
 m.agency.slug='nlu';m.user.workspaceServiceContext={agencyId:2,canTutor:true,learningOnly:true};
 const base=m.get.getMockImplementation();
 m.get.mockImplementation(async(url,...args)=>url.includes('/practice-categories')?{data:{categories:['tutoring'],allowedCategories:['tutoring']}}:url.includes('/booking-options')?{data:{services:[{id:11,businessType:'tutoring',serviceCode:'TUTORING',isActive:true}],tutoringSubjects:[{key:'math',label:'Math'},{key:'reading',label:'Reading'}]}}:base(url,...args));
 const s=await editor();await flushPromises();expect(s.editorIsLearning).toBe(true);expect(s.editorNluVideoChoice).toBe(true);return s;
}
it.each([true,false])('offers both Session Hub and Google Meet for tutoring with external-link policy=%s',async externalMeetingsEnabled=>{
 wrapper=mount(Header,{props:{showModality:true,modality:'TELEHEALTH',appointmentType:'tutoring',nluVideoChoice:true,videoRoomMode:'unique_session',externalMeetingsEnabled,recurrenceFrequency:'WEEKLY'}});
 const options=wrapper.findAll('#tutoring-video-option option').map(option=>({value:option.attributes('value'),label:option.text()}));
 expect(options).toEqual(expect.arrayContaining([{value:'unique_session',label:'Platform Session Hub'},{value:'google_meet',label:'Google Meet'}]));
 expect(options.some(option=>option.value==='external')).toBe(externalMeetingsEnabled);
 await wrapper.get('#tutoring-video-option').setValue('google_meet');
 expect(wrapper.emitted('update:videoRoomMode').at(-1)).toEqual(['google_meet']);
 await wrapper.setProps({videoRoomMode:'google_meet'});
 expect(wrapper.text()).toContain('Each upcoming session gets its own link.');
 await wrapper.setProps({modality:'IN_PERSON'});
 expect(wrapper.find('#tutoring-video-option').exists()).toBe(false);
});
it('keeps the chosen tutoring transport through modality and asynchronous external-policy changes',async()=>{
 const s=await nluEditor();
 s.editorVideoRoomMode='google_meet';s.editorModality='IN_PERSON';await flushPromises();s.editorModality='TELEHEALTH';
 s.bookingMeetingPolicy={agencyId:2,providerId:7,usesGoogleSso:false};await flushPromises();
 expect(s.editorVideoRoomMode).toBe('google_meet');expect(s.editorBookingVideoMode).toBe('google_meet');
});
it('uses the saved tutoring Meet destination after booking and never substitutes a platform room',async()=>{
 const s=await editor();
 const saved={...appointment,businessType:'tutoring',videoRoomMode:'google_meet',googleMeetReady:true,googleMeetUrl:'https://meet.google.com/abc-defg-hij'};
 m.get.mockImplementation(async url=>({data:url==='/appointments/41'?{appointment:saved}:{}}));
 s.virtualSessionBookingResult={agencyId:2,learning:true,nluVideoChoice:true,appointments:[saved],videoRooms:{}};
 await s.finishVirtualSessionVideoLinks();
 expect(s.virtualSessionShareUrl).toBe(saved.googleMeetUrl);expect(s.virtualSessionBookingResult.googleMeetReady).toBe(true);
 expect(s.virtualSessionBookingResult.videoRooms[41].shareUrl).not.toContain('tutoring-session');
 expect(countCreates()).toBe(0);expect(m.post).not.toHaveBeenCalled();
});
it('lets an authorized booker verify tutoring Meet readiness without obtaining the tutor’s private host link',async()=>{
 const s=await editor(),saved={...appointment,businessType:'tutoring',videoRoomMode:'google_meet',googleMeetReady:true};
 m.get.mockImplementation(async()=>({data:{appointment:saved}}));
 s.virtualSessionBookingResult={agencyId:2,learning:true,nluVideoChoice:true,appointments:[saved],videoRooms:{}};
 await s.finishVirtualSessionVideoLinks();
 expect(s.virtualSessionBookingResult.googleMeetReady).toBe(true);expect(s.virtualSessionShareUrl).toBe('');expect(m.post).not.toHaveBeenCalled();
});
it('keeps a failed tutoring Meet preparation visible on the saved booking without creating it twice',async()=>{
 const s=await editor(),saved={...appointment,businessType:'tutoring',videoRoomMode:'google_meet',googleMeetReady:false};
 m.get.mockImplementation(async()=>({data:{appointment:saved}}));m.post.mockRejectedValue(new Error('Google Meet is unavailable for this provider’s workspace.'));
 s.virtualSessionBookingResult={agencyId:2,learning:true,nluVideoChoice:true,appointments:[saved],videoRooms:{}};
 await expect(s.finishVirtualSessionVideoLinks()).rejects.toThrow('workspace');
 expect(countCreates()).toBe(0);expect(Object.keys(s.virtualSessionBookingResult.videoRooms)).toEqual([]);
});

it('keeps the NLU meeting option separate from the tutoring subject selection',async()=>{
 const s=await nluEditor();
 s.editorVideoRoomMode='google_meet';s.editorTutoringSubject='math';await flushPromises();s.editorTutoringSubject='reading';await flushPromises();
 expect(s.editorVideoRoomMode).toBe('google_meet');expect(s.editorBookingVideoMode).toBe('google_meet');
 expect(s.editorPracticeCategory).toBe('tutoring');
});
