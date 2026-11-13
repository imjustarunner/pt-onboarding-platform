import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {createGuardianServiceCancellationService} from '../guardianServiceCancellation.service.js';
let service,m,appointments,operation;
const input={userId:9,clientId:8,agencyId:2,appointmentId:1,scope:'end_services',reason:'Changing provider',personalNote:'Thank you for your help.',confirmed:true,requestId:'11111111-1111-4111-8111-111111111111'};
beforeEach(()=>{
 operation=null;appointments=new Map(Array.from({length:26},(_,i)=>[i+1,{id:i+1,agencyId:2,providerUserId:7,businessType:'mental_health',status:'scheduled',source:'reserved_office_session:abc',startAt:`2027-01-${String(i+1).padStart(2,'0')} 16:00:00`,endAt:`2027-01-${String(i+1).padStart(2,'0')} 17:00:00`,sourceTimezone:'America/Denver'}]));
 appointments.set(90,{...appointments.get(1),id:90,businessType:'learning',source:'another-service'});
 m={execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),authorize:vi.fn(async()=>({agency_id:2,client_type:'clinical'})),
  requireCancellation:vi.fn(),authorizeEnd:vi.fn(),evaluate:vi.fn(async({appointment:a})=>({allowed:true,policy:{id:3,name:'Counseling policy',noticeHours:24},recommendedFeeCents:0,recommendedPackageAction:'release',isLate:false,cancelDeadlineAt:'2026-12-31T16:00:00.000Z'})),cancel:vi.fn(),notify:vi.fn(),calendar:vi.fn()};
 m.cancel.mockImplementation(async(id,options)=>{const a=appointments.get(id);a.status='canceled_by_client';a.cancellationFeeCents=options.expectedFeeCents;return a;});
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.startsWith('SELECT p.recurrence'))return [[{officeBookingPlanId:350}]];
  if(sql.startsWith('SELECT DISTINCT a.id'))return [[...appointments.values()].filter(a=>a.status==='scheduled').map(a=>({...a,officeBookingPlanId:350}))];
  if(sql.startsWith('SELECT id,review_json'))return [[]];
  if(sql.startsWith('SELECT id FROM client_service_enrollments'))return [[]];
  if(sql.startsWith('SELECT team_notified_at'))return [[{team_notified_at:operation.team_notified_at||null}]];
  if(sql.startsWith('UPDATE guardian_service_cancellations SET team_notified_at='))operation.team_notified_at='2026-11-13 16:00:01';
  if(sql.startsWith('SELECT * FROM guardian_service_cancellations'))return [[...(operation
    && (!sql.includes('lease_token')||operation.lease_token===args[0])
    && (!sql.includes('AND actor_user_id=?')||operation.actor_user_id===args[1])?[operation]:[])]];
  if(sql.startsWith('INSERT INTO guardian_service_cancellations'))operation={id:args[0],agency_id:args[1],client_id:args[2],provider_user_id:args[3],actor_user_id:args[4],appointment_id:args[5],scope:args[6],service_kind:args[7],series_kind:args[8],series_key:args[9],request_hash:args[10],payload_encrypted:args[11],review_json:args[12],confirmed_at:args[13],completed_count:0,status:'queued',attempts:0};
  if(sql.includes("SET status='processing'")){if(!operation||operation.status!=='queued')return [{affectedRows:0}];operation.status='processing';operation.attempts++;operation.lease_token=args[0];}
  if(sql.includes('SET completed_count='))operation.completed_count=args[0];
  if(sql.includes("SET status='completed'")){operation.status='completed';operation.lease_token=null;}
  if(sql.includes('SET status=?,error_message=')){operation.status=args[0];operation.error_message=args[1];operation.lease_token=null;}
  return [{affectedRows:1}];
 });
 service=createGuardianServiceCancellationService({db:{execute:m.execute,getConnection:async()=>m},appointment:async id=>appointments.get(id),authorize:m.authorize,
  requireCancellation:m.requireCancellation,authorizeEnd:m.authorizeEnd,evaluate:m.evaluate,cancel:m.cancel,notify:m.notify,calendarCleanup:m.calendar,
  encrypt:JSON.stringify,decrypt:JSON.parse,now:()=>new Date('2026-11-13T16:00:00.123Z'),clientLock:async(ids,work)=>work()});
});
async function submit(extra={}){const request={...input,...extra};const review=await service.preview(request);return service.submit({...request,reviewToken:review.reviewToken});}
it('reviews all 26 dates beyond the six-card window without changing a booking or enrollment',async()=>{
 const result=await service.preview(input);expect(result.count).toBe(26);expect(result.endsService).toBe(true);expect(result.fees).toHaveLength(26);
 expect(m.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE)/.test(sql))).toBe(false);expect(m.cancel).not.toHaveBeenCalled();
});
it('stops only this agency/provider/service, suppresses future reminders, and never releases the provider assignment',async()=>{
 const result=await submit();expect(result).toMatchObject({status:'queued',count:26,endsService:true});
 const stop=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE client_service_enrollments'));
 expect(stop[1]).toEqual([9,8,2,7,'counseling']);expect(operation.service_kind).toBe('counseling');
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE appointment_reminders'))[1]).toHaveLength(26);
 expect(m.execute.mock.calls.some(([sql])=>/^UPDATE (clients|office_standing_assignments)\b/.test(sql))).toBe(false);
 expect(m.cancel).not.toHaveBeenCalled();
});
it('recognizes an owned-room source series even though its standing room plan belongs to the provider',async()=>{
 appointments.set(89,{...appointments.get(1),id:89,source:'reserved_office_session:other'});
 const review=await service.preview({...input,scope:'future'});expect(review.count).toBe(26);
 await submit({scope:'future'});expect(operation.series_kind).toBe('source');expect(operation.series_key).toBe('reserved_office_session:abc');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments'))).toBe(false);
});
it('requires explicit confirmation and rejects stale fees or an enlarged selection before any mutation',async()=>{
 await expect(service.submit({...input,confirmed:false})).rejects.toMatchObject({status:400});
 const review=await service.preview(input);m.evaluate.mockResolvedValue({allowed:true,policy:{id:3},recommendedFeeCents:8000,recommendedPackageAction:'release'});
 await expect(service.submit({...input,reviewToken:review.reviewToken})).rejects.toMatchObject({status:409});expect(operation).toBeNull();expect(m.beginTransaction).not.toHaveBeenCalled();
});
it('makes a repeated confirmation idempotent and keeps private notes out of progress responses',async()=>{
 const review=await service.preview(input),request={...input,reviewToken:review.reviewToken};
 await service.submit(request);const result=await service.submit(request);
 expect(result.count).toBe(26);expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO guardian_service_cancellations'))).toHaveLength(1);
 expect(JSON.stringify(result)).not.toContain(input.personalNote);expect(JSON.stringify(result)).not.toContain(input.reason);
});
it('processes each cancellation quietly and queues only one summary after all 26 are canceled',async()=>{
 await submit();await service.processPending();expect(m.cancel).toHaveBeenCalledTimes(26);
 for(const[,options]of m.cancel.mock.calls)expect(options).toMatchObject({deferNotification:true,cancellationAt:'2026-11-13 16:00:00.123',expectedPolicyId:3,expectedPackageAction:'release'});
 expect(m.notify).toHaveBeenCalledTimes(1);expect(m.notify.mock.calls[0][1]).toMatchObject({guardianSummary:{count:26,endsService:true,totalFeeCents:0},personalNote:input.personalNote});
 expect(appointments.get(90).status).toBe('scheduled');expect(operation.status).toBe('completed');expect(m.calendar).toHaveBeenCalledTimes(26);
 expect(m.notify.mock.calls[0][1]).toMatchObject({emailOnly:true,guardianSummary:{teamNotified:true,notificationsDisabled:true}});
 expect(operation.team_notified_at).toBeTruthy();
 const teamInsert=m.execute.mock.calls.findIndex(([sql])=>sql.startsWith('INSERT INTO notifications'));
 expect(m.execute.mock.invocationCallOrder[teamInsert]).toBeLessThan(m.notify.mock.invocationCallOrder[0]);
});
it('does not repeat the team alert when a confirmation queue attempt needs retrying',async()=>{
 m.notify.mockRejectedValueOnce(new Error('Temporary queue failure'));
 await submit();await service.processPending();expect(operation.status).toBe('queued');
 await service.processPending();expect(operation.status).toBe('completed');
 expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO notifications'))).toHaveLength(1);
});
it('resumes partial work without canceling the first nine twice or emailing an incomplete series',async()=>{
 const cancel=m.cancel.getMockImplementation();let failed=false;
 m.cancel.mockImplementation(async(id,options)=>{if(id===10&&!failed){failed=true;throw new Error('temporary dependency failure');}return cancel(id,options);});
 await submit();await service.processPending();expect(operation.status).toBe('queued');expect(m.notify).not.toHaveBeenCalled();
 await service.processPending();expect(operation.status).toBe('completed');expect(m.notify).toHaveBeenCalledTimes(1);
 expect(m.cancel.mock.calls.filter(([id])=>id===1)).toHaveLength(1);expect(appointments.get(26).status).toBe('canceled_by_client');
});
it('denies a different actor reading the request and rejects shared/group cancellation before changes',async()=>{
 await submit();await expect(service.status({userId:10,clientId:8,operationId:input.requestId})).rejects.toMatchObject({status:404});
 operation=null;m.requireCancellation.mockRejectedValue(Object.assign(new Error('Contact your care team to leave a shared/group appointment.'),{status:403}));
 await expect(submit()).rejects.toMatchObject({status:403});expect(operation).toBeNull();
});
it('can end a service from cancellation history even if no future appointments remain',async()=>{
 for(const a of appointments.values())a.status='canceled_by_client';
 const result=await submit();expect(result).toMatchObject({count:0,endsService:true,status:'queued'});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('IN ()'))).toBe(false);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments'))).toBe(true);
 await service.processPending();expect(operation.status).toBe('completed');expect(m.cancel).not.toHaveBeenCalled();expect(m.notify).toHaveBeenCalledTimes(1);
 expect(m.notify.mock.calls[0][1]).toMatchObject({guardianSummary:{count:0,endsService:true}});
});
it('requires clinical care-plan authority to end counseling while keeping ordinary cancellation separate',async()=>{
 m.authorizeEnd.mockRejectedValue(Object.assign(new Error('Care-plan access required'),{status:403}));
 await expect(submit()).rejects.toMatchObject({status:403});expect(operation).toBeNull();
 await expect(submit({scope:'single'})).resolves.toMatchObject({count:1,endsService:false});
});
