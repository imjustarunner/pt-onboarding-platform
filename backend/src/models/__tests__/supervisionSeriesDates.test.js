import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),window:vi.fn(),agenda:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../services/meetingWindowConflict.service.js',()=>({withMeetingWindow:m.window}));
vi.mock('../../services/meetingExpiry.service.js',()=>({expireEmptyMeeting:vi.fn()}));
vi.mock('../../services/supervisionReviewTime.service.js',()=>({withSupervisorTimeLock:async(ids,fn)=>fn({}),assertNoReviewTimeOverlap:vi.fn()}));
vi.mock('../../services/supervisionAgenda.service.js',()=>({syncSupervisionAgenda:m.agenda}));
import SupervisionSession from '../SupervisionSession.model.js';
const input={agencyId:2,supervisorUserId:1,superviseeUserId:7,sessionType:'group',recurrenceSeriesId:'series',startAt:'2026-11-26 18:00:00',endAt:'2026-11-26 19:00:00',eventTimezone:'America/Denver'};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));m.execute.mockResolvedValue([{insertId:22}]);vi.spyOn(SupervisionSession,'findById').mockResolvedValue({id:22});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('creates canceled dates without reserving the time or briefly inserting a scheduled row',async()=>{
 await SupervisionSession.create({...input,initialStatus:'CANCELLED'});
 expect(m.window).not.toHaveBeenCalled();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO supervision_sessions'),expect.arrayContaining(['CANCELLED','series']));
 expect(m.execute.mock.calls[0][0]).not.toContain("'SCHEDULED'");
});
it('checks hosts, mandatory attendees, and presenters, without blocking optional attendees',async()=>{
 await SupervisionSession.create({...input,requiredAttendeeUserIds:[8],presenterUserIds:[9]});
 expect(m.window).toHaveBeenCalledWith(expect.objectContaining({userIds:[1,undefined,8,9]}),expect.any(Function));
});
it('keeps canceled dates with reasons visible while excluding silent horizon holds',async()=>{
 m.execute.mockResolvedValue([[]]);
 await SupervisionSession.listForUserInWindow({agencyId:2,userId:7,windowStart:'2026-11-20',windowEnd:'2026-11-29'});
 expect(m.execute.mock.calls[0][0]).toContain('ss.cancel_reason IS NOT NULL');
 expect(m.execute.mock.calls[0][0]).toContain('COALESCE(ss.recurrence_horizon_held,0)=0');
});

it('synchronizes generated agenda items after changing presenters',async()=>{
 vi.spyOn(SupervisionSession,'setPresentersWithReviewTimeChecked').mockResolvedValue();
 await SupervisionSession.setPresenters({sessionId:22,presenterUserIds:[7,8]});
 expect(m.agenda).toHaveBeenCalledWith(22);
});
