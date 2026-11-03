import {beforeEach,expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute},onTableWrite:vi.fn()}));
vi.mock('../../services/meetingWindowConflict.service.js',()=>({withMeetingWindow:vi.fn()}));
vi.mock('../../services/meetingExpiry.service.js',()=>({expireEmptyMeeting:vi.fn()}));
vi.mock('../../services/supervisionReviewTime.service.js',()=>({withSupervisorTimeLock:vi.fn(),assertNoReviewTimeOverlap:vi.fn()}));
import SupervisionSession from '../SupervisionSession.model.js';
beforeEach(()=>{vi.clearAllMocks();execute.mockResolvedValue([[]]);});
it('pages one supervisee within one agency with stable ordering and retained cancellations',async()=>{
 await SupervisionSession.listSessionsForSuperviseeWithArtifacts({superviseeUserId:20,agencyId:2,limit:51,offset:50,includeCancelled:true});
 const sql=execute.mock.calls[0][0];expect(sql).toContain('ss.agency_id = 2');expect(sql).toContain('ssar.user_id = 20');expect(sql).toContain('ORDER BY ss.start_at DESC, ss.id DESC');expect(sql).toContain('LIMIT 51 OFFSET 50');expect(sql).not.toContain("ss.status <> 'CANCELLED'");
});
it('returns the supervisee-specific audited absence reason and preserves unknown attendance',async()=>{
 execute.mockResolvedValue([[{id:1,agency_id:2,status:'FINALIZED',total_seconds:0,attendance_correction_type:'MISSED',attendance_reason:'Did not attend after reminder.'},{id:2,agency_id:2,status:'FINALIZED',total_seconds:null}]]);
 const rows=await SupervisionSession.listSessionsForSuperviseeWithArtifacts({superviseeUserId:20,agencyId:2});
 expect(rows[0]).toMatchObject({attendanceCorrectionType:'MISSED',attendanceReason:'Did not attend after reminder.',totalSeconds:0});expect(rows[1].totalSeconds).toBeNull();
 expect(execute.mock.calls[0][0]).toContain("correction.id = ssar.manual_correction_id AND correction.session_id = ssar.session_id AND correction.user_id = ssar.user_id AND correction.status = 'approved'");
});
it('aggregates complete history in one agency-scoped query without loading artifact content',async()=>{
 execute.mockResolvedValue([[{total:'80',attended:'60',missed:'10',excused:'3',cancelled:'4',unknown:'3'}]]);
 expect(await SupervisionSession.getSuperviseeAttendanceSummary({superviseeUserId:20,agencyId:2})).toEqual({total:80,attended:60,missed:10,excused:3,cancelled:4,unknown:3});
 expect(execute).toHaveBeenCalledOnce();const [sql,args]=execute.mock.calls[0];expect(args).toEqual([20,2,20,20]);expect(sql).toContain('WHERE ss.agency_id=? AND ss.start_at<=UTC_TIMESTAMP()');expect(sql).toContain("correction.status='approved'");expect(sql).not.toContain('artifacts');expect(sql).not.toContain('LIMIT');
 expect(sql.indexOf("modality)='MISSED'")).toBeLessThan(sql.indexOf('ssar.total_seconds>0'));expect(sql.indexOf("('CANCELLED','RESCHEDULED')")).toBeLessThan(sql.indexOf('ssar.total_seconds>0'));expect(sql).toContain("ELSE 'unknown'");
});
it('refuses an unscoped attendance aggregate and normalizes an empty result',async()=>{
 expect(await SupervisionSession.getSuperviseeAttendanceSummary({superviseeUserId:20,agencyId:null})).toBeNull();expect(execute).not.toHaveBeenCalled();
 execute.mockResolvedValue([[{total:0,attended:null,missed:null,excused:null,cancelled:null,unknown:null}]]);
 expect(await SupervisionSession.getSuperviseeAttendanceSummary({superviseeUserId:20,agencyId:2})).toEqual({total:0,attended:0,missed:0,excused:0,cancelled:0,unknown:0});
});
