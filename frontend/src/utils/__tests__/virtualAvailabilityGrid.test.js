import {describe,it,expect} from 'vitest';
import {virtualPublicationRanges,virtualAvailabilityCellSlice,virtualAvailabilityCellSlices} from '../virtualAvailabilityGrid';
import source from '../../components/schedule/ScheduleAvailabilityGrid.vue?raw';
const edited={dayName:'Monday',startHour:15,startMinute:30,endHour:17,endMinute:30};
describe('virtual availability minute precision',()=>{
 it('subtracts a quarter-hour appointment from both adjoining rows without changing the saved hours',()=>{
  const busy=[[10*60+15,11*60+15]];
  expect(virtualAvailabilityCellSlices('09:00','12:00',10,0,60,busy)).toEqual([{topPct:0,heightPct:25}]);
  expect(virtualAvailabilityCellSlices('09:00','12:00',11,0,60,busy)).toEqual([{topPct:25,heightPct:75}]);
  expect(virtualAvailabilityCellSlices('09:00','12:00',10,15,15,busy)).toEqual([]);
  expect(virtualAvailabilityCellSlices('09:00','12:00',9,0,60,busy)).toEqual([{topPct:0,heightPct:100}]);
 });
 it('merges overlapping busy intervals and retains both genuine gaps in one row',()=>{
  const slices=virtualAvailabilityCellSlices('10:00','11:00',10,0,60,[[610,630],[620,640]]);
  expect(slices).toHaveLength(2);
  expect(slices[0].heightPct).toBeCloseTo(100/6);
  expect(slices[1].topPct).toBeCloseTo(200/3);
  expect(slices[1].heightPct).toBeCloseTo(100/3);
  expect(virtualAvailabilityCellSlices('10:00','11:00',10,0,60,[[590,670]])).toEqual([]);
 });
 it('saves 3:30–5:30 after selecting the 3 and 4 PM grid cells',()=>{
  const selected=[15,16].map(hour=>({dayName:'Monday',dateYmd:'2026-10-05',hour}));
  expect(virtualPublicationRanges(selected,edited)).toEqual([edited]);
 });
 it('preserves separate bulk windows on different days or with gaps',()=>{
  const selected=[{dayName:'Monday',hour:15},{dayName:'Tuesday',hour:15}];
  expect(virtualPublicationRanges(selected,edited)).toEqual(selected.map(s=>({dayName:s.dayName,startHour:s.hour,endHour:s.hour+1,startMinute:0,endMinute:0})));
  expect(virtualPublicationRanges([{dayName:'Monday',hour:15},{dayName:'Monday',hour:18}],edited)).toHaveLength(2);
 });
 it('positions half-hour boundaries accurately in both hour and quarter-hour rows',()=>{
  expect(virtualAvailabilityCellSlice('15:30','17:30',15)).toEqual({topPct:50,heightPct:50});
  expect(virtualAvailabilityCellSlice('15:30','17:30',16)).toEqual({topPct:0,heightPct:100});
  expect(virtualAvailabilityCellSlice('15:30','17:30',17)).toEqual({topPct:0,heightPct:50});
  expect(virtualAvailabilityCellSlice('15:30','17:30',15,15,15)).toBeNull();
  expect(virtualAvailabilityCellSlice('15:30','17:30',15,30,15)).toEqual({topPct:0,heightPct:100});
  expect(virtualAvailabilityCellSlice('15:30','17:30',17,30,15)).toBeNull();
 });
 it('uses edited times in the real publication path and rejects fractional office attachment before publishing',()=>{
  const start=source.indexOf("} else if (requestType.value === 'portal_intake' || requestType.value === 'attach_open_for_booking')");
  const end=source.indexOf('// Attach office request',start);const branch=source.slice(start,end);
  expect(branch).toContain('virtualPublicationRanges(selected, { dayName: dn, startHour: h, endHour: endH, startMinute, endMinute })');
  expect(branch.indexOf('Office reservations must start')).toBeLessThan(branch.indexOf('await ensureVirtualWorkingHoursForRange'));
  const officeStart=source.indexOf("} else if (requestType.value === 'office_request_only') {");
  const office=source.slice(officeStart,source.indexOf('const targets =',officeStart));
  expect(office).toContain("if (startMinute || endMinute) throw new Error('Office reservations must start and end on the hour.");
 });
});
