import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), route: null }));
vi.mock('../../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post, patch: mocks.patch },
  isApiRateLimited: () => false
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) })
}));
vi.mock('../../../store/auth', () => ({
  useAuthStore: () => ({ user: { id: 7, role: 'provider' }, isAuthenticated: true })
}));
vi.mock('../../../store/agency', () => ({
  useAgencyStore: () => ({
    currentAgency: { id: 2, name: 'Test agency', slug: 'test', organization_type: 'agency', timezone: 'America/Denver' },
    agencies: [], userAgencies: []
  })
}));

import Grid from '../ScheduleAvailabilityGrid.vue';
import { invalidateScheduleSummaryCacheForUser } from '../../../utils/scheduleSummaryCache';

let wrapper;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T00:15:00Z'));
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
  sessionStorage.clear();
  invalidateScheduleSummaryCacheForUser(7);
  mocks.route = reactive({ path: '/dashboard', params: {}, query: {} });
  mocks.post.mockResolvedValue({ data: {} });
  mocks.patch.mockResolvedValue({ data: {} });
  // Keep this date-selection regression independent of the day the suite runs.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => {
  wrapper?.unmount();
  await flushPromises();
  invalidateScheduleSummaryCacheForUser(7);
  invalidateScheduleSummaryCacheForUser(8);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('rescheduling an existing meeting from the Edit tab', () => {
  it.each(['2026-10-28', '2026-10-30', '2026-11-05'])
    ('saves %s while preserving the meeting clock times and timezone', async (dateYmd) => {
      const event = {
        id: 10, kind: 'TEAM_MEETING', title: 'Check In', meetingSubtype: 'general',
        providerId: 7, agencyId: 2, canEdit: true, canReschedule: true,
        startAt: '2026-10-29T19:00:00Z', endAt: '2026-10-29T20:30:00Z',
        timeZone: 'America/Denver', attendeeUserIds: [8],
        attendees: [{ id: 8, name: 'Test participant' }]
      };
      const summary = { weekStart: '2026-10-26', scheduleEvents: [event] };
      mocks.get.mockImplementation(async (url) => ({
        data: url.includes('schedule-summary') ? summary : url.includes('agencies') ? [] : {}
      }));
      wrapper = shallowMount(Grid, {
        props: { userId: 7, agencyId: 2 },
        global: {
          stubs: {
            Teleport: false, RouterLink: true,
            ClinicalWorkspaceFrame: { template: '<div><slot /></div>' },
            AppointmentEditorShell: false,
            AppointmentHeaderFields: false
          }
        }
      });
      await flushPromises();
      const state = wrapper.vm.$.setupState;
      state.summary = summary;
      const item = state.buildScheduleStackItemFromEvent(event);
      await state.openAppointmentEditInScheduleModal({ item, dayName: 'Thursday', hour: 13 });
      state.editorWorkspaceTab = 'edit';
      await flushPromises();

      const date = wrapper.get('input[aria-label="Appointment date"]');
      expect(date.element.disabled).toBe(false);
      expect(date.element.value).toBe('2026-10-29');
      await date.setValue(dateYmd);
      expect(wrapper.findAll('input[type="time"]').map((input) => input.element.value))
        .toEqual(['13:00', '14:30']);
      expect(state.scheduleEventEditForm).toMatchObject({
        startAt: `${dateYmd}T13:00`, endAt: `${dateYmd}T14:30`
      });

      await wrapper.get('.nr-btn-submit').trigger('click');
      await flushPromises();
      expect(state.scheduleEventEditError).toBe('');
      expect(mocks.patch).toHaveBeenCalledWith('/users/7/schedule-events/10', expect.objectContaining({
        startAt: `${dateYmd}T13:00:00`,
        endAt: `${dateYmd}T14:30:00`,
        timeZone: 'America/Denver',
        attendeeUserIds: [8]
      }), { skipGlobalLoading: true });
      expect(state.showRequestModal).toBe(false);
      if (dateYmd === '2026-10-28') {
        expect(window.confirm).toHaveBeenCalledWith('This meeting has already passed. Are you sure you want to update it?');
      }
    });
});
