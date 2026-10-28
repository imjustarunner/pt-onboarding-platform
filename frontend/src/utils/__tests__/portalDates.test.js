import {beforeEach,it,expect} from 'vitest';
import {portalDateTime,portalCalendarDate,portalTimeZone} from '../portalDates';
beforeEach(()=>localStorage.clear());
it('uses the account timezone with daylight saving instead of the device zone',()=>{
 localStorage.setItem('user',JSON.stringify({timezone:'America/Denver'}));
 expect(portalDateTime('2026-10-28T12:20:00Z',{locale:'en-US'})).toContain('6:20 AM MDT');
 expect(portalDateTime('2026-11-02T12:20:00Z',{locale:'en-US'})).toContain('5:20 AM MST');
 expect(portalDateTime('2026-10-28 12:20:00',{locale:'en-US'})).toContain('6:20 AM MDT');
});
it('uses the organization zone for a new account and preserves date-only fields',()=>{
 localStorage.setItem('currentAgency',JSON.stringify({timezone:'America/Denver'}));
 expect(portalTimeZone()).toBe('America/Denver');
 expect(portalCalendarDate('2026-10-28T00:00:00.000Z','en-US')).toBe('Oct 28, 2026');
 expect(portalCalendarDate('2026-10-28','en-US')).toBe('Oct 28, 2026');
});
it('handles invalid dates and timezone settings without breaking the page',()=>{
 localStorage.setItem('user',JSON.stringify({timezone:'invalid'}));
 expect(portalDateTime('invalid')).toBe('—');expect(()=>portalDateTime('2026-10-28T12:00:00Z')).not.toThrow();
});
