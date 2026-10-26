import {it,expect,vi,beforeEach} from 'vitest';
const h=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),access:vi.fn(),adjust:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]]),getConnection:vi.fn(async()=>h)},onTableWrite:vi.fn()}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:h.access}));
vi.mock('../../services/providerSlots.service.js',async importOriginal=>({...await importOriginal(),adjustProviderSlots:h.adjust}));
vi.mock('../../services/clientProviderAssignmentSync.service.js',()=>({afterScopedProviderAssignmentChanged:vi.fn(async()=>{})}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>null)}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:vi.fn(async()=>null)}}));
vi.mock('../../services/notificationDispatcher.service.js',()=>({default:{dispatchForNotification:vi.fn(async()=>{})}}));
vi.mock('../../services/clientOnboardingTask.service.js',()=>({createClientOnboardingTaskForProvider:vi.fn(async()=>{})}));
vi.mock('../../services/smartDisclosure.service.js',()=>({syncDisclosureRequiredForProviderAssign:vi.fn(async()=>{})}));
import {upsertClientProviderAssignment} from '../client.controller.js';
let rows,req,res,next;
beforeEach(()=>{
 vi.clearAllMocks();rows=[{id:2588,is_active:0,is_primary:0,service_day:'Tuesday'}];
 req={params:{id:'2152'},body:{organization_id:237,provider_user_id:494,service_day:'Tuesday',is_primary:true},user:{id:501,role:'super_admin'}};
 res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();
 h.access.mockResolvedValue({ok:true,client:{id:2152,agency_id:2,client_status_key:'being_seen'}});h.adjust.mockResolvedValue({ok:true});
 h.execute.mockImplementation(async sql=>{
  if(sql.includes('client_organization_assignments'))return [[{is_active:1}]];
  if(sql.includes('FROM user_agencies'))return [[{id:1}]];
  if(sql.includes('SELECT id, is_active'))return [rows];
  if(sql.includes('COUNT(*)'))return [[{cnt:rows.filter(r=>r.is_active&&r.service_day!=='Tuesday').length}]];
  return [{affectedRows:1}];
 });
});
it('reactivates the historical row without a duplicate insert and consumes one slot',async()=>{
 await upsertClientProviderAssignment(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(h.adjust).toHaveBeenCalledTimes(1);expect(h.adjust).toHaveBeenCalledWith(h,expect.objectContaining({dayOfWeek:'Tuesday',delta:-1}));
 expect(h.execute.mock.calls.some(([s])=>s.includes('INSERT INTO client_provider_assignments'))).toBe(false);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('SET service_day')&&a.at(-1)===2588)).toBe(true);
 expect(h.commit).toHaveBeenCalledOnce();
});
it('does not consume another slot on an active assignment retry',async()=>{
 rows[0].is_active=1;await upsertClientProviderAssignment(req,res,next);expect(next).not.toHaveBeenCalled();expect(h.adjust).not.toHaveBeenCalled();
});
it('moves back to an inactive historical day and preserves the previous primary assignment',async()=>{
 req.body.is_primary=false;rows.push({id:2999,is_active:1,is_primary:1,service_day:'Monday'});
 await upsertClientProviderAssignment(req,res,next);expect(next).not.toHaveBeenCalled();
 expect(h.adjust.mock.calls.map(([,args])=>[args.dayOfWeek,args.delta])).toEqual([['Monday',1],['Tuesday',-1]]);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('SET is_active = FALSE')&&a.at(-1)===2999)).toBe(true);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('SET service_day')&&s.includes('is_primary = TRUE')&&a.at(-1)===2588)).toBe(true);
});
it('does not reserve capacity for a waitlisted client',async()=>{
 h.access.mockResolvedValue({ok:true,client:{id:2152,agency_id:2,client_status_key:'waitlist'}});
 rows.push({id:2999,is_active:1,service_day:'Monday'});await upsertClientProviderAssignment(req,res,next);expect(next).not.toHaveBeenCalled();expect(h.adjust).not.toHaveBeenCalled();
});
it('rolls back if Tuesday is full and rejects unauthorized client access before writes',async()=>{
 h.adjust.mockResolvedValue({ok:false,reason:'No available slots'});await upsertClientProviderAssignment(req,res,next);
 expect(h.rollback).toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(400);
 expect(h.execute.mock.calls.some(([s])=>s.startsWith('UPDATE client_provider_assignments'))).toBe(false);
 h.access.mockResolvedValue({ok:false,status:403,message:'Access denied'});h.beginTransaction.mockClear();
 await upsertClientProviderAssignment(req,res,next);expect(res.status).toHaveBeenLastCalledWith(403);expect(h.beginTransaction).not.toHaveBeenCalled();
});

it('moves an unknown-day assignment to a weekday without refunding a nonexistent slot',async()=>{
 rows=[{id:2588,is_active:1,is_primary:1,service_day:null}];await upsertClientProviderAssignment(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(h.adjust).toHaveBeenCalledTimes(1);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('SET service_day')&&a[0]==='Tuesday'&&a.at(-1)===2588)).toBe(true);
});
