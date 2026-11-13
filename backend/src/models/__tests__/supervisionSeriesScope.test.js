import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn().mockResolvedValue([[]])}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
import Session from '../SupervisionSession.model.js';
it('uses a valid UTC boundary and limits future edits to unfinished dates for the same host and agency',async()=>{
 await Session.listActiveSeriesFromPoint({recurrenceSeriesId:'weekly',agencyId:2,supervisorUserId:507,fromStartAt:new Date('2026-10-13T18:00:00Z')});
 const [sql,args]=m.execute.mock.calls[0];
 expect(args).toEqual(['weekly',2,507,'2026-10-13 18:00:00','2026-10-13 18:00:00']);
 expect(sql).toContain('finalized_at IS NULL');expect(sql).toContain('live_ended_at IS NULL');expect(sql).toContain("status = 'SCHEDULED'");
});

it('shows regular agency group supervision to current staff without requiring a manual invite',async()=>{
 m.execute.mockClear();
 await Session.listForUserInWindow({agencyId:2,userId:501,windowStart:'2026-11-12 00:00:00',windowEnd:'2026-11-14 00:00:00'});
 const [sql,args]=m.execute.mock.calls[0];
 expect(args).toEqual([501,501,501,2,501,501,501,501,501,'2026-11-14 00:00:00','2026-11-12 00:00:00']);
 expect((sql.match(/\?/g)||[])).toHaveLength(args.length);
 expect(sql).toContain("ss.session_type='group'");expect(sql).toContain("<>'signup_only'");
 expect(sql).toContain('member.agency_id=ss.agency_id');expect(sql).toContain('viewer.is_assistant_account');
 expect(sql).toContain("'school_staff'");expect(sql).toContain('ss.calendar_deleted_at IS NULL');
});
