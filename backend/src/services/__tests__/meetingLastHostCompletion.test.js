import { expect, it, vi } from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
vi.mock('../../models/AgencyMeetingAttendanceRollup.model.js',()=>({default:{}}));
import { completeMeetingSession } from '../meetingAttendanceSegments.service.js';
it('leaves attendance, presence, and payroll untouched when closure permission changes',async()=>{
  execute.mockImplementation(async sql=>sql.startsWith('UPDATE provider_schedule_events e')?[{affectedRows:0}]:[[{id:101,status:'CONFIRMED',meeting_completed_at:null}]]);
  await expect(completeMeetingSession({eventId:101,actorUserId:7})).rejects.toMatchObject({status:409});
  // Additional authority reads must not make this permission-race test brittle.
  // The rejected close may attempt its guarded event write, but must never
  // change attendance, presence or compensation after that write loses authority.
  const writes=execute.mock.calls.filter(([sql])=>/^\s*(UPDATE|INSERT|DELETE|REPLACE)\b/i.test(sql));
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toMatch(/^UPDATE provider_schedule_events e/);
  expect(writes[0][0]).toContain('AND EXISTS (SELECT 1 FROM users u');
});
