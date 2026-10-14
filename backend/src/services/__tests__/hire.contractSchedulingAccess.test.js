import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),read:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../contractSchedulingExpectation.service.js',()=>({readContractSchedulingExpectation:mocks.read}));
import {getContractSchedulingExpectation} from '../../controllers/contractSchedulingExpectation.controller.js';
let res,next;
beforeEach(()=>{vi.clearAllMocks();res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};next=vi.fn();mocks.execute.mockResolvedValue([[{ok:1}]]);mocks.read.mockResolvedValue({showNotice:true});});
const req=(user,providerId=9,agencyId=2)=>({user,params:{providerId:String(providerId)},query:{agencyId:String(agencyId)}});
it('allows an employee to read their own agency-scoped expectation',async()=>{
 await getContractSchedulingExpectation(req({id:9,role:'provider'}),res,next);
 expect(mocks.read).toHaveBeenCalledWith({providerId:9,agencyId:2});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('does not let an employee inspect a coworker’s contract expectations',async()=>{
 await getContractSchedulingExpectation(req({id:8,role:'provider'}),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects staff outside the selected agency before reading contracts',async()=>{
 mocks.execute.mockResolvedValue([[]]);await getContractSchedulingExpectation(req({id:8,role:'staff'}),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(mocks.read).not.toHaveBeenCalled();
});
it('allows authorized staff and checks target agency membership',async()=>{
 await getContractSchedulingExpectation(req({id:8,role:'admin'}),res,next);expect(mocks.read).toHaveBeenCalledWith({providerId:9,agencyId:2});expect(mocks.execute.mock.calls.at(-1)[1]).toEqual([9,2]);
});
it('requires an assigned supervisee for supervisor access',async()=>{
 mocks.execute.mockImplementation(async sql=>[sql.includes('supervisor_assignments')?[]:[{ok:1}]]);
 await getContractSchedulingExpectation(req({id:8,role:'supervisor'}),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects malformed agency identifiers',async()=>{
 await getContractSchedulingExpectation(req({id:9,role:'provider'},9,'bad'),res,next);expect(res.status).toHaveBeenCalledWith(400);expect(mocks.execute).not.toHaveBeenCalled();
});
