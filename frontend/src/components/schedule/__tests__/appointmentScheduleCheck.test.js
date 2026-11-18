import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Check from '../AppointmentScheduleCheck.vue';

it('reveals a seven-hour disagreement using the same Denver timezone for both records', () => {
  const appointment = { startAt: '2026-12-04 00:00:00', endAt: '2026-12-04 01:00:00' };
  const calendarEvent = { startAt: '2026-12-03T17:00:00Z', endAt: '2026-12-03T18:00:00Z' };
  const w = mount(Check, { props: { appointment, calendarEvent, timeZone: 'America/Denver' } });
  expect(w.get('[role="alert"]').text()).toContain('different times');
  expect(w.text()).toContain('5:00 PM MST');
  expect(w.text()).toContain('10:00 AM MST');
  expect(w.text()).toContain('Confirm the intended time before rescheduling');
  expect(w.emitted()).toEqual({});
  expect(appointment.startAt).toBe('2026-12-04 00:00:00');
  w.unmount();
});

it('compares absolute instants rather than strings or browser clocks', async () => {
  const w = mount(Check, { props: {
    appointment: { startAt: '2026-12-03T17:00:00-07:00', endAt: '2026-12-03T18:00:00-07:00' },
    calendarEvent: { startAt: '2026-12-04 00:00:00', endAt: '2026-12-04T01:00:00Z' }
  } });
  expect(w.find('[role="alert"]').exists()).toBe(false);
  await w.setProps({ calendarEvent: { startAt: '2026-12-04T00:00:00Z', endAt: '2026-12-04T01:30:00Z' } });
  expect(w.get('[role="alert"]').exists()).toBe(true);
  w.unmount();
});

it('does not invent a disagreement while either record is unavailable', () => {
  const w = mount(Check, { props: { appointment: { startAt: '2026-12-04T00:00:00Z' }, calendarEvent: null } });
  expect(w.find('[role="alert"]').exists()).toBe(false);w.unmount();
});

it('keeps the incorrect stored copy visible after the calendar uses the saved appointment time',()=>{
 const appointment={startAt:'2026-12-04T00:00:00Z',endAt:'2026-12-04T01:00:00Z'};
 const w=mount(Check,{props:{appointment,calendarEvent:{...appointment,calendarTimingMismatch:true,calendarStartAt:'2026-12-03T17:00:00Z',calendarEndAt:'2026-12-03T18:00:00Z'}}});
 expect(w.get('[role="alert"]').text()).toContain('Stored calendar copy');expect(w.text()).toContain('10:00 AM MST');
 expect(w.text()).toContain('The calendar displays the saved appointment time');w.unmount();
});
