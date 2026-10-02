import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { publishOfficeAssignmentEvent } from '../officeAssignmentBookingAvailability.service.js';
const assignment = { id:1,provider_id:9,office_location_id:3,room_id:4,booking_agency_id:6,bookable_in_person:1,bookable_virtual:1 };
const event = { id:10,standing_assignment_id:1,assigned_provider_id:9,start_at:'2099-01-01 17:00:00',end_at:'2099-01-01 18:00:00',status:'RELEASED' };
beforeEach(()=>pool.execute.mockReset().mockResolvedValue([[]]));
it('opens both modalities for new and current clients without releasing the reserved office',async()=>{
 await publishOfficeAssignmentEvent(assignment,event);
 expect(pool.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO'))).toHaveLength(2);
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes("'BOTH'"))).toBe(true);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE office'))).toBe(false);
});
it('never publishes client-linked, borrowed, or cancelled occurrences',async()=>{
 for (const patch of [{client_id:5},{clinical_session_id:8},{billing_context_id:3},{status:'CANCELLED'},{assigned_provider_id:88}]) await publishOfficeAssignmentEvent(assignment,{...event,...patch});
 expect(pool.execute).not.toHaveBeenCalled();
 pool.execute.mockResolvedValue([[{id:11}]]);
 await publishOfficeAssignmentEvent(assignment,event);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('closing online booking preserves the standing room reservation',async()=>{
 await publishOfficeAssignmentEvent({...assignment,bookable_in_person:0,bookable_virtual:0},event);
 expect(pool.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE provider_'))).toHaveLength(2);
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('UPDATE office_standing'))).toBe(false);
});
