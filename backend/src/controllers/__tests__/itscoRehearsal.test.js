import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import {rehearsalAgency} from '../itscoRehearsal.controller.js';
beforeEach(()=>{vi.clearAllMocks();Agency.findById.mockResolvedValue({id:2,slug:'itsco'});User.getAgencies.mockResolvedValue([{id:2}]);});
describe('ITSCO rehearsal authorization',()=>{
 it.each([null,{id:7,role:'provider'},{id:7,role:'admin',demoMode:true},{id:7,role:'admin',switchedFromUserId:8}])('denies unapproved actor before document access',async user=>{await expect(rehearsalAgency({user,query:{agencyId:2}})).rejects.toMatchObject({status:403});expect(Agency.findById).not.toHaveBeenCalled();});
 it('requires agency membership and ITSCO identity',async()=>{User.getAgencies.mockResolvedValue([{id:3}]);await expect(rehearsalAgency({user:{id:7,role:'admin'},query:{agencyId:2}})).rejects.toMatchObject({status:403});User.getAgencies.mockResolvedValue([{id:2}]);Agency.findById.mockResolvedValue({id:2,slug:'nlu'});await expect(rehearsalAgency({user:{id:7,role:'admin'},query:{agencyId:2}})).rejects.toMatchObject({status:404});});
 it('allows an authorized administrator without creating an applicant',async()=>{await expect(rehearsalAgency({user:{id:7,role:'admin'},query:{agencyId:2}})).resolves.toMatchObject({id:2,slug:'itsco'});});
});
