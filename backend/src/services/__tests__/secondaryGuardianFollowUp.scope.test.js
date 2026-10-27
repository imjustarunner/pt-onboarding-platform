import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Task.model.js',()=>({default:{}}));
vi.mock('../../models/TaskList.model.js',()=>({default:{}}));
vi.mock('../../models/TaskListMember.model.js',()=>({default:{}}));
vi.mock('../taskNotifications.service.js',()=>({notifyTaskAddedToList:vi.fn()}));
import {scopedFollowUpMembers} from '../secondaryGuardianFollowUp.service.js';
beforeEach(()=>{vi.unstubAllEnvs();});
it('never carries configured staff from another agency into a school follow-up',async()=>{
 vi.stubEnv('SECONDARY_GUARDIAN_FOLLOWUP_USER_IDS','8,501');
 const db={execute:vi.fn(async()=>[[{id:1434},{id:1435}]])};
 expect(await scopedFollowUpMembers(450,db)).toEqual([1434,1435]);
 expect(db.execute.mock.calls[0][1]).toEqual([450]);
 expect(db.execute.mock.calls[0][0]).toContain('ua.agency_id=? AND ua.is_active=1');
});
it('retains configured assignees only when they are active staff in the same agency',async()=>{
 vi.stubEnv('SECONDARY_GUARDIAN_FOLLOWUP_USER_IDS','501,1434');
 expect(await scopedFollowUpMembers(450,{execute:async()=>[[{id:1434},{id:1435}]]})).toEqual([1434]);
});
it('fails closed if no authorized staff exist instead of using a global fallback',async()=>{
 expect(await scopedFollowUpMembers(450,{execute:async()=>[[]]})).toEqual([]);
});
