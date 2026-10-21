import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listClientsForGuardian:vi.fn(),isNoView:p=>!!p?.noView}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../models/LearningProgramClass.model.js',()=>({default:{findById:vi.fn(),listClientMembers:vi.fn()}}));
vi.mock('../../models/LearningClassSession.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../clientServiceEnrollment.service.js',()=>({clientAgencyMembership:vi.fn()}));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import LearningProgramClass from '../../models/LearningProgramClass.model.js';
import LearningClassSession from '../../models/LearningClassSession.model.js';
import {clientAgencyMembership} from '../clientServiceEnrollment.service.js';
import {assertLearningSessionAccess,getGuardianJoinInfoForClassAndSession} from '../../utils/learningClassAccess.js';
beforeEach(()=>{vi.clearAllMocks();LearningClassSession.findById.mockResolvedValue({id:10,learning_class_id:5,mode:'individual',session_subtype:'tutoring'});LearningProgramClass.findById.mockResolvedValue({id:5,organization_id:6});LearningProgramClass.listClientMembers.mockResolvedValue([{client_id:40},{client_id:41}]);ClientGuardian.listClientsForGuardian.mockResolvedValue([{client_id:40,permissions_json:{}}]);pool.execute.mockResolvedValue([[{client_id:41}]]);clientAgencyMembership.mockResolvedValue(true);});
it('does not admit another class member’s guardian to an individual visit',async()=>{
 await expect(assertLearningSessionAccess({user:{id:7,role:'client_guardian'}},10)).rejects.toHaveProperty('status',403);
 expect(await getGuardianJoinInfoForClassAndSession(7,5,10)).toBeNull();
 expect(LearningProgramClass.listClientMembers).not.toHaveBeenCalled();
});
it('admits only the explicitly linked student’s authorized guardian',async()=>{
 pool.execute.mockResolvedValue([[{client_id:40}]]);
 expect(await assertLearningSessionAccess({user:{id:7,role:'client_guardian'}},10)).toMatchObject({canModerate:false,actorRole:'participant'});
 expect(await getGuardianJoinInfoForClassAndSession(7,5,10)).toMatchObject({childIds:[40]});
});
it('revoked appointment permission or agency membership denies the visit',async()=>{
 pool.execute.mockResolvedValue([[{client_id:40}]]);
 ClientGuardian.listClientsForGuardian.mockResolvedValue([{client_id:40,permissions_json:{canViewAppointments:false}}]);
 await expect(assertLearningSessionAccess({user:{id:7,role:'client_guardian'}},10)).rejects.toHaveProperty('status',403);
 ClientGuardian.listClientsForGuardian.mockResolvedValue([{client_id:40,permissions_json:{}}]);clientAgencyMembership.mockResolvedValue(false);
 expect(await getGuardianJoinInfoForClassAndSession(7,5,10)).toBeNull();
});
