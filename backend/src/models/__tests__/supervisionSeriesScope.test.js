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
