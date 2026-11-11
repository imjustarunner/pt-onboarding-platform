import {expect,it} from 'vitest';import {referralSubmissionDate} from '../referralSubmissionDate.js';
it('uses the agency calendar day for missing/invalid paper submission dates after 5 PM Denver',()=>{
 const now=new Date('2026-11-11T03:58:00Z');
 expect(referralSubmissionDate(null,{now})).toBe('2026-11-10');
 expect(referralSubmissionDate('2026-02-31',{now})).toBe('2026-11-10');
 expect(referralSubmissionDate(null,{now,timeZone:'America/New_York'})).toBe('2026-11-10');
 expect(referralSubmissionDate(null,{now,timeZone:'Asia/Tokyo'})).toBe('2026-11-11');
});
it('preserves an explicit valid date and a stored SQL DATE without applying a timezone shift',()=>{
 const now=new Date('2026-11-11T03:58:00Z');
 expect(referralSubmissionDate('2026-11-09',{now})).toBe('2026-11-09');
 expect(referralSubmissionDate(null,{now,storedValue:new Date('2026-11-10T00:00:00Z')})).toBe('2026-11-10');
});
