import { it, expect } from 'vitest';
import { officeBookingUntil, officeBookingCount } from '../officeBookingLimits.js';
import { officeBookingAgencyId } from '../officeBookingAgency.js';
it('keeps blank booking limits open-ended instead of inventing six occurrences or one year',()=>{
 expect(officeBookingUntil('2026-10-01',undefined)).toBeNull();expect(officeBookingUntil('2026-10-01','')).toBeNull();
 expect(officeBookingCount(undefined)).toBeNull();expect(officeBookingCount(null)).toBeNull();
 expect(officeBookingUntil('2026-10-01','2029-10-01')).toBe('2029-10-01');
});
it('accepts explicit finite bookings and rejects invalid dates/counts',()=>{
 expect(officeBookingCount(1)).toBe(1);expect(officeBookingUntil('2026-10-01','2026-10-01')).toBe('2026-10-01');
 expect(()=>officeBookingUntil('2026-10-01','2026-09-01')).toThrow();expect(()=>officeBookingUntil('2026-10-01','2027-02-30')).toThrow();expect(()=>officeBookingCount('bad')).toThrow();
});
it('reads the saved booking agency instead of substituting a building owner',()=>{
 expect(officeBookingAgencyId({session_context_json:'{"agencyId":6}',agency_id:1})).toBe(6);
 expect(officeBookingAgencyId({session_context_json:'bad',agency_id:1})).toBeNull();
});
