import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),adjust:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]]),getConnection:async()=>m},onTableWrite:vi.fn()}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../services/providerSlots.service.js',async original=>({...await original(),adjustProviderSlots:m.adjust}));
import {removeClientAffiliation} from '../client.controller.js';
let linkedServices,primary,roster;
beforeEach(()=>{vi.clearAllMocks();linkedServices=[];primary=[{is_primary:1}];roster=[];
 m.access.mockResolvedValue({ok:true,client:{id:8,agency_id:2,organization_id:12,provider_id:30}});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT is_primary')?[primary]:sql.includes('SELECT id FROM client_service_enrollments')?[linkedServices]:sql.includes('SELECT id, provider_user_id')?[roster]:[{affectedRows:1}]);
});
const req=()=>({params:{id:'8',organizationId:'12'},user:{id:40,role:'admin'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it('removes the only primary affiliation, clears its legacy organization and preserves the office service provider',async()=>{
 const res=response(),next=vi.fn();await removeClientAffiliation(req(),res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ok:true});expect(m.commit).toHaveBeenCalledOnce();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('organization_id=NULL'),[40,8,12]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('is_primary = FALSE'),[8,12]);
 expect(m.execute.mock.calls.some(([sql])=>/UPDATE clients SET provider_id|UPDATE client_service_enrollments|DELETE FROM/.test(sql))).toBe(false);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_status_history'),[8,40,'12']);
});
it('ends only this affiliation’s roster assignments and refunds their slots',async()=>{
 roster=[{id:55,provider_user_id:30,service_day:'Monday'}];await removeClientAffiliation(req(),response(),vi.fn());
 expect(m.adjust).toHaveBeenCalledWith(m,{providerUserId:30,schoolId:12,dayOfWeek:'Monday',delta:1});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE client_provider_assignments'),[40,55]);
});
it('requires an explicit service move before removing an affiliation that is still a care context',async()=>{
 linkedServices=[{id:65}];const res=response();await removeClientAffiliation(req(),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(409);expect(m.rollback).toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();expect(m.adjust).not.toHaveBeenCalled();
});
it('keeps unauthorized and nonexistent affiliations unchanged',async()=>{
 m.access.mockResolvedValueOnce({ok:false,status:403,message:'No access'});const res=response();await removeClientAffiliation(req(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.beginTransaction).not.toHaveBeenCalled();
 primary=[];const missing=response();await removeClientAffiliation(req(),missing,vi.fn());expect(missing.status).toHaveBeenCalledWith(404);expect(m.commit).not.toHaveBeenCalled();
});
