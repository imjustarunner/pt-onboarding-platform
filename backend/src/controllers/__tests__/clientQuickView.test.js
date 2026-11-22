import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),sessions:vi.fn(),tasks:vi.fn()}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../services/clientServiceEnrollment.service.js',()=>({clientAgencyMembership:vi.fn(async(id,agencyId)=>agencyId===2)}));
vi.mock('../../services/clientSessionSnapshot.service.js',()=>({clientSessionSnapshots:m.sessions}));
vi.mock('../../services/clientUnreadFamilyMessages.service.js',()=>({clientUnreadFamilyCounts:vi.fn(async()=>new Map()),clientUnreadCorrespondenceCounts:vi.fn(async()=>({counts:new Map()}))}));
vi.mock('../../models/Task.model.js',()=>({default:{findByUser:m.tasks}}));
import {caseloadSessionDates,clientQuickViewTasks} from '../clientQuickView.controller.js';
function response(){const res={set:vi.fn(),json:vi.fn(),status:vi.fn()};res.set.mockReturnValue(res);res.status.mockReturnValue(res);return res;}
it('omits unauthorized charts before querying dates, and passes the agency to every access check',async()=>{
 m.access.mockImplementation(async({clientId})=>clientId===13?{ok:false,status:403,message:'denied'}:{ok:true});
 m.sessions.mockResolvedValue([]);const res=response(),next=vi.fn();
 await caseloadSessionDates({user:{id:9,role:'staff'},body:{agencyId:2,clientIds:[12,13]}},res,next);
 expect(m.sessions).toHaveBeenCalledWith(2,[12],undefined,undefined,null);expect(next).not.toHaveBeenCalled();
});
it('returns only open tasks that the actor can already view for the exact client and agency',async()=>{
 m.access.mockResolvedValue({ok:true});m.tasks.mockResolvedValue([
  {id:1,title:'Call client',status:'pending',metadata:{clientId:12,agencyId:2}},
  {id:2,title:'Other agency',status:'pending',metadata:{clientId:12,agencyId:3}},
  {id:3,title:'Done',status:'completed',metadata:{clientId:12,agencyId:2}},
  {id:4,title:'Other client',status:'pending',metadata:{clientId:13,agencyId:2}}]);
 const res=response();await clientQuickViewTasks({user:{id:9,role:'staff'},params:{id:'12'},query:{agencyId:'2'}},res,vi.fn());
 expect(m.tasks).toHaveBeenCalledWith(9,{});expect(res.json.mock.calls[0][0].tasks.map(t=>t.id)).toEqual([1]);
});

it('rejects a selected agency outside the authenticated scope before querying calendar dates',async()=>{
 const res=response(),next=vi.fn();
 await caseloadSessionDates({user:{id:9,role:'provider',scopedAgencyId:3},body:{agencyId:2,clientIds:[12]}},res,next);
 expect(res.json).toHaveBeenCalledWith({items:[]});
});
