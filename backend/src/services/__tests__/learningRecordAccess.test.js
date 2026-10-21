import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{isNoView:()=>false}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../clientServiceEnrollment.service.js',()=>({clientAgencyMembership:vi.fn(),guardianServiceContext:vi.fn()}));
import Client from '../../models/Client.model.js';
import User from '../../models/User.model.js';
import pool from '../../config/database.js';
import {clientAgencyMembership} from '../clientServiceEnrollment.service.js';
import {assertLearningWriteAccess} from '../../utils/learningAccess.js';
beforeEach(()=>{vi.clearAllMocks();Client.findById.mockResolvedValue({id:40,agency_id:2});User.getAgencies.mockResolvedValue([{id:2},{id:6}]);clientAgencyMembership.mockResolvedValue(true);pool.execute.mockResolvedValue([[{assigned:1}]]);});
it.each(['client','guardian','client_guardian'])('does not let %s accounts edit the learning team’s records',async role=>{
 await expect(assertLearningWriteAccess({user:{id:8,role}},40)).rejects.toHaveProperty('status',403);
 expect(Client.findById).not.toHaveBeenCalled();
});
it('keeps older records with their original agency despite a second enrollment',async()=>{
 await expect(assertLearningWriteAccess({user:{id:9,role:'provider'},query:{agencyId:6}},40,{metadata_json:{}})).rejects.toHaveProperty('status',403);
});
it('allows the assigned tutor to edit a record from the selected agency',async()=>{
 expect(await assertLearningWriteAccess({user:{id:9,role:'provider'},query:{agencyId:6}},40,{metadata_json:{agencyId:6}})).toMatchObject({agencyId:6,clientId:40});
});
it('denies an unassigned tutor despite agency membership',async()=>{
 pool.execute.mockResolvedValue([[]]);await expect(assertLearningWriteAccess({user:{id:9,role:'provider'},query:{agencyId:6}},40)).rejects.toHaveProperty('status',403);
});
