import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {clientUnreadCorrespondenceCounts} from '../clientUnreadFamilyMessages.service.js';
it('uses the existing inbox access and unread rules before counting filed conversations',async()=>{
 const list=vi.fn(async()=>[{id:10,is_unread:true},{id:11,is_unread:false}]);const db={execute:vi.fn(async()=>[[{client_id:12,unread_count:1}]])};
 const result=await clientUnreadCorrespondenceCounts({agencyId:2,clientIds:[12,13],userId:9},{db,list});
 expect(list).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,scopeToUserId:9,userId:9,isAdminViewer:false,filter:'unread',linkedClientIds:[12,13]}));
 expect(db.execute.mock.calls[0][1]).toEqual([12,13,10]);expect(result.counts.get(12)).toBe(1);expect(result.partial).toBe(false);
});
it('does not query filing links when no visible inbox conversations are unread',async()=>{
 const db={execute:vi.fn()},list=vi.fn(async()=>[]);const result=await clientUnreadCorrespondenceCounts({agencyId:2,clientIds:[12],userId:9},{db,list});expect(result.counts.size).toBe(0);expect(db.execute).not.toHaveBeenCalled();
});
