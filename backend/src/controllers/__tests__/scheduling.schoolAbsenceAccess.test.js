import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),list:vi.fn()}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../services/schoolAbsenceHistory.service.js',()=>({schoolAbsenceHistory:{list:m.list}}));
import {listSchoolAbsenceHistory} from '../schoolAbsenceHistory.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const req=role=>({params:{id:'2337'},user:{id:1433,role}});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({ok:true,client:{agency_id:450}});m.list.mockResolvedValue([]);});
it('requires client record authorization before reading any cancellation evidence',async()=>{
 m.access.mockResolvedValue({ok:false,status:403,message:'Assigned provider access is required'});const response=res();
 await listSchoolAbsenceHistory(req('provider'),response,vi.fn());expect(response.status).toHaveBeenCalledWith(403);expect(m.list).not.toHaveBeenCalled();
});
it.each(['client','client_guardian','school_staff'])('does not disclose staff cancellation evidence to %s',async role=>{
 const response=res();await listSchoolAbsenceHistory(req(role),response,vi.fn());expect(response.status).toHaveBeenCalledWith(403);expect(m.access).not.toHaveBeenCalled();expect(m.list).not.toHaveBeenCalled();
});
it('derives the agency from the authorized client rather than a caller-supplied agency',async()=>{
 await listSchoolAbsenceHistory({...req('provider'),query:{agencyId:2}},res(),vi.fn());expect(m.list).toHaveBeenCalledWith({agencyId:450,clientId:2337});
});
