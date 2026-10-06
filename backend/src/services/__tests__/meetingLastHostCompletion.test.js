import { expect, it, vi } from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
vi.mock('../../models/AgencyMeetingAttendanceRollup.model.js',()=>({default:{}}));
import { completeMeetingSession } from '../meetingAttendanceSegments.service.js';
it('leaves attendance, presence, and payroll untouched when another host blocks completion',async()=>{
  execute.mockImplementation(async sql=>sql.startsWith('UPDATE provider_schedule_events e')?[{affectedRows:0}]:[[{id:101,status:'CONFIRMED',meeting_completed_at:null}]]);
  await expect(completeMeetingSession({eventId:101,actorUserId:7})).rejects.toMatchObject({status:409});
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[1][0]).toContain('AND NOT EXISTS');
});
