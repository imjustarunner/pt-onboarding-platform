import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),tx:{execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()},manage:vi.fn(),request:vi.fn(),cancel:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:vi.fn(async()=>m.tx)},onTableWrite:vi.fn()}));
vi.mock('../../services/companyEventAccess.service.js',()=>({canManageProgramEvent:m.manage,canRequestEventShifts:m.request,canViewProgramEvent:vi.fn(async()=>true)}));
vi.mock('../../services/providerAssignmentGoogleSync.service.js',()=>({cancelCompanySessionProvidersBeforeDelete:m.cancel,syncCompanySessionProviderBySlotBestEffort:vi.fn()}));
vi.mock('../../services/notificationDispatcher.service.js',()=>({createNotificationAndDispatch:vi.fn()}));
import {createCompanyEventSessionRequest,unassignProviderFromSession} from '../companyEventStaffing.controller.js';
const req=()=>({params:{eventId:'339'},body:{agencyId:2,sessionDateId:635,providerUserId:596},user:{id:539,role:'super_admin'}});
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
let approved,assigned;
beforeEach(()=>{
 vi.clearAllMocks();approved=true;assigned=true;m.manage.mockResolvedValue(true);m.request.mockResolvedValue(true);
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM company_events'))return [[{id:339,agency_id:2,event_type:'school_outreach',staffing_config_json:'{}',title:'Synthetic event'}]];
  if(sql.includes('FROM company_event_session_dates'))return [[{id:635}]];
  if(sql.includes('SELECT id, status FROM company_event_session_provider_requests'))return [[{id:50,status:approved?'approved':'withdrawn'}]];
  if(sql.includes('SELECT 1 FROM company_event_session_providers'))return [assigned?[{id:596}]:[]];
  if(sql.includes("SET request_type = ?, status = 'pending'")){approved=false;return [{affectedRows:1}];}
  return [[]];
 });
 m.tx.execute.mockImplementation(async sql=>{if(sql.includes('DELETE'))assigned=false;if(sql.includes('UPDATE'))approved=false;return [{affectedRows:1}];});
});
it('removes the assignment and retires its approval atomically, then reuses the same request ID',async()=>{
 const response=res(),next=vi.fn();await unassignProviderFromSession(req(),response,next);
 expect(next).not.toHaveBeenCalled();expect(assigned).toBe(false);expect(approved).toBe(false);
 expect(m.tx.execute.mock.calls[1][1]).toEqual([539,339,2,635,596]);expect(m.tx.commit).toHaveBeenCalledOnce();expect(m.tx.release).toHaveBeenCalledOnce();
 const r=req();r.user={id:596,role:'provider'};const posted=res();await createCompanyEventSessionRequest(r,posted,next);
 expect(next).not.toHaveBeenCalled();expect(posted.json).toHaveBeenCalledWith({ok:true,id:50,status:'pending'});
 expect(m.execute.mock.calls.some(([s])=>s.includes('INSERT INTO company_event_session_provider_requests'))).toBe(false);
});
it('rolls back the assignment deletion if retiring the approval fails',async()=>{
 m.tx.execute.mockImplementation(async sql=>{if(sql.includes('UPDATE'))throw new Error('write failed');return [{affectedRows:1}];});
 const next=vi.fn();await unassignProviderFromSession(req(),res(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'write failed'}));expect(m.tx.rollback).toHaveBeenCalledOnce();expect(m.tx.commit).not.toHaveBeenCalled();expect(m.tx.release).toHaveBeenCalledOnce();
});
it('recovers an older stranded approval and preserves a real approved assignment',async()=>{
 const r=req();r.user={id:596,role:'provider'};let response=res(),next=vi.fn();
 await createCompanyEventSessionRequest(r,response,next);expect(response.json).toHaveBeenCalledWith({ok:true,id:50,status:'approved'});
 assigned=false;response=res();await createCompanyEventSessionRequest(r,response,next);
 expect(next).not.toHaveBeenCalled();expect(response.json).toHaveBeenCalledWith({ok:true,id:50,status:'pending'});
});
it('denies unauthorized unassignment before cancellation or database writes',async()=>{
 m.manage.mockResolvedValue(false);const response=res();await unassignProviderFromSession(req(),response,vi.fn());
 expect(response.status).toHaveBeenCalledWith(403);expect(m.cancel).not.toHaveBeenCalled();expect(m.tx.beginTransaction).not.toHaveBeenCalled();
});
