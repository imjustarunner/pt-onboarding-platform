import { describe, it, expect } from 'vitest';
import { SCHEDULE_COLOR_OPTIONS, defaultScheduleColors, resolveScheduleColors, scheduleBlockColorKey, scheduleTypePalette, isExactHourAppointment } from '../scheduleAppearance.js';
import { layoutScheduleDayBlocks } from '../scheduleOverlapLayout.js';
const hour=(start,end,rest={})=>({kind:'sevt',startAt:`2026-10-13T${start}:00`,endAt:`2026-10-13T${end}:00`,...rest});
describe('schedule appearance',()=>{
 it('hides time only for an exact, on-the-hour appointment',()=>{
  expect(isExactHourAppointment(hour('13:00','14:00'))).toBe(true);
  for(const [start,end] of [['13:30','14:30'],['13:00','13:45'],['13:00','15:00']])expect(isExactHourAppointment(hour(start,end))).toBe(false);
  expect(isExactHourAppointment(hour('13:00','14:00',{allDay:true}))).toBe(false);
  expect(isExactHourAppointment(hour('13:00','14:00',{kind:'gbusy'}))).toBe(false);
 });
 it('gives appointment categories distinct defaults and honors custom transparent fills in both themes',()=>{
  expect(new Set(SCHEDULE_COLOR_OPTIONS.map(o=>o.color)).size).toBe(SCHEDULE_COLOR_OPTIONS.length);
  const examples=[{kind:'supv'},{kind:'supv',sessionType:'group'},{kind:'supv',sessionType:'triadic'},{kind:'supv-signup'},{kind:'sevt',eventKind:'TEAM_MEETING',meetingSubtype:'interview'},{kind:'sevt',eventKind:'PERSONAL_EVENT',isClientSession:true},{kind:'sevt',eventKind:'PERSONAL_EVENT'},{kind:'gevt'}];
  expect(new Set(examples.map(scheduleBlockColorKey)).size).toBe(examples.length);
  for(const dark of [false,true]) for(const block of examples) {
   const key=scheduleBlockColorKey(block);const p=scheduleTypePalette(block,{[key]:'#123456'},dark);
   expect(p.fill).toBe(`rgba(18, 52, 86, ${dark?0.32:0.22})`);
  }
  expect(scheduleTypePalette({kind:'supv'},{supervision:'red'}).fill).toBe(scheduleTypePalette({kind:'supv'},defaultScheduleColors()).fill);
 });
 it('moves only overlapping active holds to the background and reserves lanes for appointments',()=>{
  const hold={key:'hold',kind:'sevt',eventKind:'SCHEDULE_HOLD',timedSlice:{topPct:0,heightPct:500}};
  const lanes=layoutScheduleDayBlocks([{hour:9,blocks:[hold]},{hour:11,blocks:[{key:'client',kind:'sevt',eventKind:'PERSONAL_EVENT'},{key:'supervision',kind:'supv'}]},{hour:16,blocks:[{...hold,key:'later',timedSlice:{topPct:0,heightPct:100}}]}]);
  expect(lanes.get('9:0:hold')).toEqual({col:0,cols:1,background:true});
  expect(lanes.get('11:0:client').cols).toBe(2);expect(lanes.get('11:0:supervision').cols).toBe(2);
  expect(lanes.get('16:0:later')).toEqual({col:0,cols:1});
  const cancelled=layoutScheduleDayBlocks([{hour:9,blocks:[hold,{key:'cancelled',isCancelled:true}]}]);
  expect(cancelled.get('9:0:hold').background).toBeUndefined();
 });
});

it('updates the old default palette while preserving intentional custom colors', () => {
 const saved={client_session:'#059669',office_assigned:'#27AE60',availability:'#123456'};
 const upgraded=resolveScheduleColors(saved);
 expect(upgraded.client_session).toBe(defaultScheduleColors().client_session);
 expect(upgraded.office_assigned).toBe(defaultScheduleColors().office_assigned);
 expect(upgraded.availability).toBe('#123456');
 expect(resolveScheduleColors(saved,2).client_session).toBe('#059669');
 expect(scheduleBlockColorKey({kind:'sevt',eventKind:'TEAM_MEETING',meetingSubtype:'training'})).toBe('training');
});
