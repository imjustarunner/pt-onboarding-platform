import {it,expect} from 'vitest';
import {officeRequestWindows} from '../officeRequestWindows.js';
const base={baseDate:'2026-10-13',startHour:17,endHour:19,roomId:3};
it('keeps all recurring weekdays without repeating windows for later weeks',()=>{
 expect(officeRequestWindows({...base,recurrence:'WEEKLY',recurrenceWeekdays:['Tue','Wed','Tue']})).toEqual([
  {weekday:2,startHour:17,endHour:19,roomId:3},{weekday:3,startHour:17,endHour:19,roomId:3}]);
});
it('keeps multi-day selections but uses the edited whole time range',()=>{
 const selected=[{dayName:'Tuesday',dateYmd:'2026-10-13',hour:17},{dayName:'Tuesday',dateYmd:'2026-10-13',hour:18},{dayName:'Wednesday',dateYmd:'2026-10-14',hour:17}];
 expect(officeRequestWindows({...base,selected}).map(s=>[s.weekday,s.startHour,s.endHour])).toEqual([[2,17,19],[3,17,19]]);
});
it('honors replacing the initial weekday in recurrence controls',()=>{
 expect(officeRequestWindows({...base,selected:[{dayName:'Tuesday'}],recurrence:'BIWEEKLY',recurrenceWeekdays:['Wed','Fri']}).map(s=>s.weekday)).toEqual([3,5]);
});
