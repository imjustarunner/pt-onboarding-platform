import {describe,it,expect} from 'vitest';
import {canCheckIn,checkinClosesAt} from '../officeCheckinWindow.js';
describe('office arrival deadline',()=>{
 const event={start_at:'2026-09-30 12:00:00',end_at:'2026-09-30 13:00:00'};
 it('removes a Denver 6am appointment at 6:30am regardless of device timezone',()=>{
  expect(checkinClosesAt(event)).toBe('2026-09-30T12:30:00.000Z');
  expect(canCheckIn(event,Date.parse('2026-09-30T12:29:59.999Z'))).toBe(true);
  expect(canCheckIn(event,Date.parse('2026-09-30T12:30:00Z'))).toBe(false);
 });
 it('keeps later same-day appointments selectable',()=>expect(canCheckIn(event,Date.parse('2026-09-30T10:00:00Z'))).toBe(true));
 it('closes shorter sessions at their end',()=>expect(canCheckIn({...event,end_at:'2026-09-30 12:15:00'},Date.parse('2026-09-30T12:15:00Z'))).toBe(false));
 it('fails closed for invalid timestamps',()=>expect(canCheckIn({start_at:'invalid',end_at:'invalid'})).toBe(false));
 it('handles the repeated daylight-saving hour as UTC instants',()=>expect(checkinClosesAt({start_at:'2026-11-01 07:45:00',end_at:'2026-11-01 09:00:00'})).toBe('2026-11-01T08:15:00.000Z'));
});
