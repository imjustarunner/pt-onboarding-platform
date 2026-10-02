import { it, expect } from 'vitest';
import { legacyOfficeWallTimeTarget } from '../officeLegacyWallTime.js';
const row={ assignment_active:1,assignment_weekday:1,assignment_hour:14,room_id:3,assignment_room_id:3,office_timezone:'America/Denver',start_at:'2026-10-05 14:00:00',end_at:'2026-10-05 15:00:00' };
it('recognizes the exact old local-wall-clock-in-UTC fingerprint',()=>expect(legacyOfficeWallTimeTarget(row)).toEqual({startAt:'2026-10-05 20:00:00',endAt:'2026-10-05 21:00:00'}));
it('uses the offset of the scheduled date across daylight saving',()=>expect(legacyOfficeWallTimeTarget({...row,start_at:'2026-11-02 14:00:00',end_at:'2026-11-02 15:00:00'})).toEqual({startAt:'2026-11-02 21:00:00',endAt:'2026-11-02 22:00:00'}));
it('does not change correct UTC times, patient records, inactive assignments or arbitrary mismatches',()=>{
 for(const patch of [{start_at:'2026-10-05 20:00:00',end_at:'2026-10-05 21:00:00'},{client_id:4},{clinical_session_id:4},{billing_context_id:4},{note_context_id:4},{assignment_active:0},{assignment_hour:15},{room_id:8}]) expect(legacyOfficeWallTimeTarget({...row,...patch})).toBeNull();
});
