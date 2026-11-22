import {beforeEach,expect,it,vi} from 'vitest';
import Client from '../../models/Client.model.js';
import pool from '../../config/database.js';
import {requireAssignmentService} from '../providerServiceOfferings.service.js';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../providerServiceOfferings.service.js',()=>({requireAssignmentService:vi.fn()}));
vi.mock('../insuranceDemographicsAutomation.service.js',()=>({syncInsuranceDemographicsForEligibility:vi.fn()}));
const payload={agency_id:2,organization_id:2,client_type:'learning',learning_provider_user_id:9,created_by_user_id:8,initials:'QA'};
let db;
beforeEach(()=>{
 vi.clearAllMocks();
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValue([{insertId:51}])};
 pool.getConnection.mockResolvedValue(db);
});
it('creates the learning chart and tutoring assignment in one transaction without clinical ownership',async()=>{
 expect(await Client.create(payload,{hydrate:false})).toEqual({id:51});
 expect(requireAssignmentService).toHaveBeenCalledWith(2,9,'tutoring',db);
 const [insert,enroll]=db.execute.mock.calls;
 expect(insert[0]).toContain('INSERT INTO clients');
 expect(insert[1][2]).toBeNull();
 expect(enroll[0]).toContain('INSERT INTO client_service_enrollments');
 expect(enroll[1]).toEqual([51,2,9,0,8,8]);
 expect(db.commit).toHaveBeenCalledOnce();
});
it('rolls back a partial creation and leaves transaction ownership with an existing caller',async()=>{
 db.execute.mockResolvedValueOnce([{insertId:51}]).mockRejectedValueOnce(new Error('Enrollment failed'));
 await expect(Client.create(payload,{hydrate:false})).rejects.toThrow('Enrollment failed');
 expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
 await Client.create(payload,{executor:db,hydrate:false});expect(db.beginTransaction).toHaveBeenCalledTimes(1);
});
