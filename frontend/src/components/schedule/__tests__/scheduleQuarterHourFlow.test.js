import { computed, effectScope, nextTick, ref, watch } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Picker from '../ScheduleQuarterHourPicker.vue';
import source from '../ScheduleAvailabilityGrid.vue?raw';

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing scheduler section: ${start}`);
  return source.slice(from, to);
}

// Run the production picker -> async chooser -> event editor path and its real
// time watchers. Unrelated form fields and network loaders need no calendar data.
function scheduler() {
  const code = [
    section('const SCHEDULE_EVENT_ACTIONS =', 'const AGENCY_OPTIONAL_ACTIONS ='),
    section('const isScheduleEventRequestType =', 'const modalTimeRangeLabel ='),
    section('const disableEndTimeInput =', 'const requestNotesPlaceholder ='),
    section('const startHourOptions =', 'const isWeekdayName ='),
    section('const onScheduleCellPlusClick =', 'const openMobileDayHour ='),
    section('const openSlotActionModal =', 'const applyShiftSelection ='),
    section('function openAppointmentEditor(', 'watch(editorWorkspaceTab,'),
    section('const onQuickActionSelect =', 'const requestCloseModal ='),
    section('const goBackToActionChooser =', 'const actionRequiresAgency ='),
    section('watch(requestType, (t) =>', 'watch([modalLockRoomToAssigned,'),
    section('watch([modalHour, modalStartHour, modalEndHour, modalStartMinute, modalEndMinute, useModalQuarterHourTime, disableEndTimeInput]', '/** Snap back to Open finder')
  ].join('\n');
  const declared = new Set([...code.matchAll(/(?:const|let|function) (\w+)/g)].map(m => m[1]));
  const state = Object.fromEntries([...code.matchAll(/\b(\w+)\.value\b/g)]
    .map(m => m[1]).filter(name => !declared.has(name)).map(name => [name, ref(0)]));
  Object.assign(state, {
    requestType: ref(''), showRequestModal: ref(false), canBookFromGrid: ref(true),
    gridMinHour: ref(7), gridMaxHour: ref(22),
    modalHour: ref(7), modalStartHour: ref(7), modalEndHour: ref(8),
    modalStartMinute: ref(0), modalEndMinute: ref(0),
    scheduleEventAllDay: ref(false), viewMode: ref('open_finder'),
    bookingAgencyOptions: ref([{ id: 2 }]), effectiveAgencyIds: ref([2]),
    scheduleEventOrgOptions: ref([{ id: 2 }]),
    scheduleHoldReasonOptions: ref([{ code: 'DOCUMENTATION' }]),
    modalContext: ref({}), weekStart: ref('2026-10-26')
  });
  const dependencies = {
    computed, watch,
    props: { userId: 10 }, authStore: { user: { id: 10 } },
    agencyStore: { currentAgency: { id: 2 }, fetchAgencies: vi.fn().mockResolvedValue() },
    ensureOfficeAgencyIds: vi.fn().mockResolvedValue(),
    buildModalContext: ({ dayName, hour }) => ({ dayName, hour, agencyId: 2 }),
    addDaysYmd: () => '2026-10-30', dayIdxFromWeekStartMonday: () => 4,
    actionSlotKey: () => '2026-10-30|10|0', selectedActionSignature: () => 'selected',
    sortedSelectedActionSlots: () => [],
    CLIENT_SESSION_CREATE_ACTIONS: new Set(['individual_session', 'group_session']),
    UNIFIED_EDITOR_KINDS: new Set(['schedule_hold', 'personal_event', 'agency_meeting', 'school', 'portal_intake']),
    ALL_RECURRENCE_FREQUENCIES: ['ONCE', 'WEEKLY'],
    PERSONAL_EVENT_TYPE_OPTIONS: [{ title: 'Personal event' }],
    defaultScheduleEventTitleForAction: () => 'Schedule block'
  };
  for (const name of [
    'resetBookingSelectionDefaults', 'resetBookingMetadataState', 'resetVirtualSessionShareState',
    'loadBookingProviderDirectory', 'loadSlotActionPrefs', 'loadBookingMetadataForProvider',
    'loadSupervisionProviders', 'loadMeetingCandidates', 'loadVirtualSessionClients',
    'loadEditorOfficeLocations', 'recordSlotActionUsage', 'selectHoldReasonOption', 'syncEditorOfficeBookingLink'
  ]) dependencies[name] = vi.fn();
  const scope = effectScope();
  const args = { ...state, ...dependencies };
  const create = new Function(...Object.keys(args), `${code}
    return { onScheduleCellPlusClick, openSlotActionModal, onQuickActionSelect,
      goBackToActionChooser, modalStartTimeValue, modalEndTimeValue };
  `);
  return { ...state, ...dependencies, ...scope.run(() => create(...Object.values(args))), stop: () => scope.stop() };
}

describe('quarter-hour selection through the scheduling form', () => {
  it.each([0, 15, 30, 45])('keeps :%s from the plus menu through Schedule block', async minute => {
    const s = scheduler();
    const wrapper = mount(Picker, {
      props: { hour: 10, onSelect: value => s.onScheduleCellPlusClick('Friday', 10, null, value) },
      attachTo: document.body
    });
    try {
      await wrapper.find('button').trigger('click');
      const option = document.querySelectorAll('.schedule-quarter-menu button')[minute / 15];
      // Safari does not focus buttons on a mouse click. Without preventing the
      // mousedown default, the focused menu option blurs to the document body;
      // focusout removes the menu before mouseup/click can select a time.
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      option.dispatchEvent(down);
      if (!down.defaultPrevented) document.activeElement?.blur();
      await nextTick();
      expect(option.isConnected).toBe(true);
      option.click();
      await flushPromises();
      expect(s.showRequestModal.value).toBe(true);
      expect(s.modalStartTimeValue.value).toBe(`10:${String(minute).padStart(2, '0')}`);
      expect(s.modalEndTimeValue.value).toBe(`11:${String(minute).padStart(2, '0')}`);
      s.onQuickActionSelect({ id: 'schedule_hold' });
      await nextTick();
      expect(s.modalStartTimeValue.value).toBe(`10:${String(minute).padStart(2, '0')}`);
      expect(s.modalEndTimeValue.value).toBe(`11:${String(minute).padStart(2, '0')}`);
    } finally { wrapper.unmount(); s.stop(); }
  });

  it.each(['school', 'portal_intake'])('keeps quarter-hours when choosing %s', async type => {
    const s = scheduler();
    try {
      await s.openSlotActionModal({ dayName: 'Friday', hour: 10, minute: 45 });
      await nextTick();
      s.onQuickActionSelect({ id: type });
      await nextTick();
      expect(s.modalStartTimeValue.value).toBe('10:45');
      expect(s.modalEndTimeValue.value).toBe('11:45');
    } finally { s.stop(); }
  });

  it('keeps the selected time when returning to the chooser and choosing another event type', async () => {
    const s = scheduler();
    try {
      await s.openSlotActionModal({ dayName: 'Friday', hour: 10, minute: 30 });
      await nextTick();
      s.onQuickActionSelect({ id: 'schedule_hold' });
      await nextTick();
      s.goBackToActionChooser();
      await nextTick();
      expect(s.modalStartTimeValue.value).toBe('10:30');
      expect(s.modalEndTimeValue.value).toBe('11:30');
      s.onQuickActionSelect({ id: 'personal_event' });
      await nextTick();
      expect(s.modalStartTimeValue.value).toBe('10:30');
    } finally { s.stop(); }
  });

  it('preserves the quarter-hour choice while agency information loads', async () => {
    const s = scheduler();
    let finishLoading;
    s.ensureOfficeAgencyIds.mockImplementationOnce(() => new Promise(resolve => { finishLoading = resolve; }));
    try {
      const opening = s.openSlotActionModal({ dayName: 'Friday', hour: 10, minute: 15 });
      await nextTick();
      expect(s.showRequestModal.value).toBe(false);
      finishLoading();
      await opening;
      await nextTick();
      expect(s.modalStartTimeValue.value).toBe('10:15');
      expect(s.modalEndTimeValue.value).toBe('11:15');
    } finally { s.stop(); }
  });

  it.each(['admin_assign', 'schedule_hold_all_day'])('still uses whole hours for %s', async type => {
    const s = scheduler();
    try {
      await s.openSlotActionModal({ dayName: 'Friday', hour: 10, minute: 30 });
      await nextTick();
      s.onQuickActionSelect({ id: type });
      await nextTick();
      expect(s.modalStartMinute.value).toBe(0);
      expect(s.modalEndMinute.value).toBe(0);
    } finally { s.stop(); }
  });
});
