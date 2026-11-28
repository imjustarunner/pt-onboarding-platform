import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../sessionNotification.service.js',()=>({processDueSessionNotifications:vi.fn()}));
vi.mock('../appointmentNoShowReview.service.js',()=>({processDueAppointmentNoShows:vi.fn(async()=>[])}));
import {createSessionNotificationWorker} from '../sessionNotificationWorker.service.js';
let canRun,db,conn,process,processScheduleNotices,run,acquired;
beforeEach(()=>{acquired=1;canRun=vi.fn(async()=>true);process=vi.fn(async()=>({sent:1}));conn={execute:vi.fn(async()=>[[{acquired}]]),release:vi.fn()};db={getConnection:vi.fn(async()=>conn)};processScheduleNotices=vi.fn(async()=>({processed:1,failed:0}));run=createSessionNotificationWorker({db,canRun,process,processScheduleNotices});});
it('drains attendance deadlines independently of the reminder-only dispatcher',async()=>{expect(await run()).toEqual({sent:1,noShowReviews:[],scheduleUpdates:{processed:1,failed:0}});expect(process).toHaveBeenCalledWith({limit:50,includeRelatedQueues:false});expect(conn.execute).toHaveBeenCalledWith("SELECT RELEASE_LOCK('session_notifications:production')");expect(conn.release).toHaveBeenCalled();});
it('does not dispatch from a local API, preview, or retired revision',async()=>{canRun.mockResolvedValue(false);expect(await run()).toMatchObject({skipped:true});expect(db.getConnection).not.toHaveBeenCalled();expect(process).not.toHaveBeenCalled();});
it('does not run a second production dispatcher while the lock is held',async()=>{acquired=0;expect(await run()).toMatchObject({skipped:true,reason:'another_worker'});expect(process).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalled();});
it('releases the dispatcher lock after a transport failure',async()=>{process.mockRejectedValue(new Error('transport failed'));await expect(run()).rejects.toThrow('transport failed');expect(conn.execute).toHaveBeenCalledWith("SELECT RELEASE_LOCK('session_notifications:production')");expect(conn.release).toHaveBeenCalled();});
it('drains pending schedule notices before their reminders',async()=>{
 await run();
 expect(processScheduleNotices).toHaveBeenCalledWith({limit:20});
 expect(processScheduleNotices.mock.invocationCallOrder[0]).toBeLessThan(process.mock.invocationCallOrder[0]);
});
it('still checks unrelated reminders when the schedule-notice worker fails',async()=>{
 processScheduleNotices.mockRejectedValue(new Error('notices unavailable'));
 expect(await run()).toMatchObject({sent:1,scheduleUpdates:{failed:1,coverage:'incomplete'}});
});
