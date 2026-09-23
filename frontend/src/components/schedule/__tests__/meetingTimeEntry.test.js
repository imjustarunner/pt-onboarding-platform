import { computed, nextTick, ref, watch } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppointmentHeaderFields from '../AppointmentHeaderFields.vue';
import source from '../ScheduleAvailabilityGrid.vue?raw';

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing scheduler section: ${start}`);
  return source.slice(from, to);
}

// Exercise the real scheduler's input handler, computed bounds and normalization
// watcher without mounting its unrelated network-backed calendars and booking UI.
function scheduler(type = 'agency_meeting') {
  const state = {
    computed, watch,
    requestType: ref(type), gridMinHour: ref(7), gridMaxHour: ref(22),
    modalHour: ref(18), modalStartHour: ref(18), modalStartMinute: ref(0),
    modalEndHour: ref(19), modalEndMinute: ref(0),
    useModalQuarterHourTime: ref(true), canUseQuarterHourInput: ref(true),
    disableEndTimeInput: ref(false),
    isScheduleEventEditMode: ref(false), isSupervisionEditMode: ref(false),
    onChooserWhenChanged: () => {}
  };
  const create = new Function(...Object.keys(state), `
    const quarterMinuteOptions = [0, 15, 30, 45];
    ${section('const snapQuarterMinute =', 'const modalStartTimeValue =')}
    ${section('const endMinuteOptions =', 'const modalTimeRangeLabel =')}
    ${section('const startHourOptions =', 'const isWeekdayName =')}
    ${section('function onEditorStartTime(', 'function onEditorEndTime(')}
    const stop = ${section('watch([modalHour, modalStartHour, modalEndHour, modalStartMinute, modalEndMinute, useModalQuarterHourTime, disableEndTimeInput]', '/** Snap back to Open finder')}
    return { onEditorStartTime, stop, startHourOptions, modalGridMaxEnd };
  `);
  return { ...state, ...create(...Object.values(state)) };
}

describe('meeting time entry independent of the visible calendar band', () => {
  it.each(['agency_meeting', 'huddle', 'supervision', 'edit_supervision', ''])
    ('keeps 6:30 AM and its one-hour duration for %s', async (type) => {
      const s = scheduler(type);
      try {
        s.onEditorStartTime('06:30');
        await nextTick();
        expect([s.modalStartHour.value, s.modalStartMinute.value]).toEqual([6, 30]);
        expect([s.modalEndHour.value, s.modalEndMinute.value]).toEqual([7, 30]);
        expect(s.startHourOptions.value).toContain(6);
        expect(s.modalGridMaxEnd.value).toBe(24);
      } finally { s.stop(); }
    });

  it('preserves AM/PM and evening minutes when switching from the chooser to a meeting', async () => {
    const s = scheduler('');
    try {
      s.onEditorStartTime('06:30');
      await nextTick();
      s.requestType.value = 'agency_meeting';
      await nextTick();
      expect(s.modalStartHour.value).toBe(6);
      for (const [input, start, end] of [['18:30', 18, 19], ['21:30', 21, 22], ['00:30', 0, 1]]) {
        s.onEditorStartTime(input);
        await nextTick();
        expect([s.modalStartHour.value, s.modalStartMinute.value]).toEqual([start, 30]);
        expect([s.modalEndHour.value, s.modalEndMinute.value]).toEqual([end, 30]);
      }
    } finally { s.stop(); }
  });

  it('does not change a meeting when the visible calendar hours change', async () => {
    const s = scheduler();
    try {
      s.onEditorStartTime('06:30');
      await nextTick();
      for (const [min, max] of [[0, 24], [7, 22], [9, 18]]) {
        s.gridMinHour.value = min;
        s.gridMaxHour.value = max;
        await nextTick();
        expect([s.modalStartHour.value, s.modalStartMinute.value]).toEqual([6, 30]);
        expect([s.modalEndHour.value, s.modalEndMinute.value]).toEqual([7, 30]);
      }
    } finally { s.stop(); }
  });

  it('leaves office-specific time bounds unchanged', () => {
    const s = scheduler('office_request_only');
    try {
      expect(s.startHourOptions.value).toEqual(Array.from({ length: 15 }, (_, i) => i + 7));
      expect(s.modalGridMaxEnd.value).toBe(22);
    } finally { s.stop(); }
  });

  it('forwards distinct AM and PM wall times from the shared editor without date conversion', async () => {
    const wrapper = mount(AppointmentHeaderFields, { props: { startTime: '18:00', endTime: '19:00' } });
    try {
      const start = wrapper.findAll('input[type="time"]')[0];
      await start.setValue('06:30');
      await start.setValue('18:30');
      expect(wrapper.emitted('update:startTime')).toEqual([['06:30'], ['18:30']]);
    } finally { wrapper.unmount(); }
  });
});
