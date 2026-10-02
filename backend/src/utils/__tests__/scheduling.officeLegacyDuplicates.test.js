import { expect, it } from 'vitest';
import { legacyOfficeAvailabilityDuplicates } from '../officeLegacyDuplicates.js';
const assignment={id:1,weekday:4,hour:13};
const legacy={id:1,standing_assignment_id:1,start_at:'2026-10-22 13:00:00',end_at:'2026-10-22 14:00:00',status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE'};
const canonical={...legacy,id:2,start_at:'2026-10-22 19:00:00',end_at:'2026-10-22 20:00:00'};
it('identifies only the proven wall-time duplicate, preserving the canonical event',()=>{
 expect(legacyOfficeAvailabilityDuplicates([legacy,canonical],[assignment],'America/Denver')).toEqual([1]);
});
it('does not infer a duplicate without a matching canonical occurrence',()=>{
 expect(legacyOfficeAvailabilityDuplicates([legacy],[assignment],'America/Denver')).toEqual([]);
});
it.each([{status:'BOOKED'},{client_id:9},{clinical_session_id:8},{booking_plan_id:3},{booked_provider_id:5}])('protects linked or booked duplicate records: %j', fields=>{
 expect(legacyOfficeAvailabilityDuplicates([{...legacy,...fields},canonical],[assignment],'America/Denver')).toEqual([]);
});
