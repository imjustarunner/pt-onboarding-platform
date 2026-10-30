import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/LearningProgramClass.model.js',()=>({default:{}}));
import { listLearningSessionStudents } from '../learningSessionRoster.service.js';

const session={id:90,learning_class_id:30,organization_id:6};
function fixture(scope,students=[]) {
 const db={execute:vi.fn().mockResolvedValueOnce([scope?[scope]:[]]).mockResolvedValueOnce([students])};
 const listClassMembers=vi.fn().mockResolvedValue([{client_id:99,membership_status:'active'},{client_id:98,membership_status:'removed'}]);
 return {db,listClassMembers};
}
it('uses only the current appointment students with current tenant membership',async()=>{
 const f=fixture({has_appointment:1,has_session_roster:1,class_code:'private_tutoring_20'},[{client_id:40,client_name:'Current student'}]);
 expect(await listLearningSessionStudents(session,f)).toEqual([{client_id:40,client_name:'Current student'}]);
 expect(f.db.execute.mock.calls[0][1]).toEqual([90,30,6]);
 expect(f.db.execute.mock.calls[1][1]).toEqual([90,6,6]);
 expect(f.db.execute.mock.calls[1][0]).toMatch(/assignment.is_active=1/);
 expect(f.listClassMembers).not.toHaveBeenCalled();
});
it.each([{has_appointment:1},{has_session_roster:1},{class_code:'private_tutoring_20'}])('never borrows another class student when a private roster is empty: %j',async scope=>{
 const f=fixture(scope);expect(await listLearningSessionStudents(session,f)).toEqual([]);expect(f.listClassMembers).not.toHaveBeenCalled();
});
it('preserves active class enrollment for an ordinary group class',async()=>{
 const f=fixture({class_code:'group_math'});expect(await listLearningSessionStudents(session,f)).toEqual([{client_id:99,membership_status:'active'}]);
 expect(f.listClassMembers).toHaveBeenCalledWith(30);expect(f.db.execute).toHaveBeenCalledTimes(1);
});
it('does not return students when the session, class and agency do not match',async()=>{
 const f=fixture(null);expect(await listLearningSessionStudents(session,f)).toEqual([]);expect(f.listClassMembers).not.toHaveBeenCalled();
 expect(await listLearningSessionStudents({...session,organization_id:null},f)).toEqual([]);expect(f.db.execute).toHaveBeenCalledTimes(1);
});
