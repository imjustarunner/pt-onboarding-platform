import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {createAppointmentSeriesCancellation} from '../appointmentSeriesCancellation.service.js';
let d,rows,appointments,workflows,operation,service,role;
const user={id:7,role:'provider',is_active:1},requestId='11111111-1111-4111-8111-111111111111';
const input={eventType:'canceled',cancellationScope:'future',officeReservationDisposition:'keep',clientId:31,initiator:'provider',reasons:['provider_unavailable'],clientFacingReason:'The provider is unavailable.',notificationMode:'send',waiver:{action:'no'}};
beforeEach(()=>{
 operation=null;role=user;workflows=new Map();
 appointments=new Map(Array.from({length:3},(_,i)=>[i+1,{id:i+1,agencyId:2,providerUserId:7,source:'reserved_office_session:monthly',businessType:'mental_health',status:'scheduled',roomId:10,officeEventId:40+i,sourceTimezone:'America/Denver',startAt:`2027-0${i+1}-03 18:00:00`,endAt:`2027-0${i+1}-03 19:00:00`}]));
 rows=[...appointments.values()].map(a=>({id:a.id,source:a.source,businessType:a.businessType,officeBookingPlanId:30}));
 rows.push({id:90,source:'reserved_office_session:unrelated',businessType:'mental_health',officeBookingPlanId:30});
 d={execute:vi.fn(),getConnection:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),access:vi.fn(async(actor,id)=>appointments.get(Number(id))),participants:vi.fn(async()=>[{clientId:31}]),
  user:vi.fn(async()=>role),preview:vi.fn(async(id)=>({appointment:{id,displayWhen:appointments.get(id).startAt},classification:'advance_cancel',consequence:{model:'none',feeCents:0},insuranceClaim:{willCreatePrimarySessionClaim:false},narrative:'Reviewed cancellation note.'})),
  complete:vi.fn(async(id,facts)=>{appointments.get(id).status='canceled_by_provider';workflows.set(id,{status:'completed',facts});return {ok:true};}),
  workflow:vi.fn(async id=>workflows.get(id)),officeCheck:vi.fn(),documentation:vi.fn(),validate:vi.fn(),requestAccess:vi.fn()};
 d.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('p.recurrence_series_id AS recurrenceSeriesId')&&sql.includes('WHERE a.id=?'))return[[{officeBookingPlanId:30}]];
  if(sql.startsWith('SELECT DISTINCT a.id'))return[rows.filter(row=>appointments.get(row.id)?.status==='scheduled'||row.id===90)];
  if(sql.startsWith('SELECT * FROM guardian_service_cancellations'))return[[...(operation&&(!sql.includes('lease_token')||operation.lease_token===args[0])&&(!sql.includes('actor_user_id=?')||Number(operation.actor_user_id)===Number(args[2]||args[1]))?[operation]:[])]];
  if(sql.startsWith('SELECT id,review_json'))return[operation?[operation]:[]];
  if(sql.startsWith('INSERT INTO guardian_service_cancellations'))operation={id:args[0],agency_id:args[1],client_id:args[2],provider_user_id:args[3],actor_user_id:args[4],appointment_id:args[5],scope:'future',service_kind:args[6],series_kind:args[7],series_key:args[8],request_hash:args[9],payload_encrypted:args[10],review_json:args[11],confirmed_at:args[12],status:'queued',completed_count:0,attempts:0};
  if(sql.includes("SET status='processing'")){if(!operation||operation.status!=='queued')return[{affectedRows:0}];operation.status='processing';operation.lease_token=args[0];operation.attempts++;}
  if(sql.startsWith('UPDATE guardian_service_cancellations SET completed_count'))operation.completed_count=args[0];
  if(sql.includes("SET status='completed'")){operation.status='completed';operation.lease_token=null;}
  if(sql.includes('SET status=?,error_message=')){operation.status=args[0];operation.error_message=args[1];operation.lease_token=null;}
  return[{affectedRows:1}];
 });
 d.getConnection.mockResolvedValue(d);
 service=createAppointmentSeriesCancellation({...d,db:d,encrypt:JSON.stringify,decrypt:JSON.parse,clientLock:async(ids,work)=>work(),seriesLock:async work=>work(),now:()=>new Date('2026-11-14T20:00:00Z')});
});
async function submit(overrides={}) {const facts={...input,...overrides},preview=await service.preview(user,1,facts);return service.submit(user,1,{...facts,cancellationReviewToken:preview.seriesChange.reviewToken,cancellationRequestId:requestId,signatureConfirmed:true});}
it('reviews only this client’s series and keeps every date’s note available before signing',async()=>{
 const preview=await service.preview(user,1,input);expect(preview.seriesChange.count).toBe(3);expect(preview.seriesChange.appointments.map(a=>a.id)).toEqual([1,2,3]);expect(preview.seriesChange.appointments.every(a=>a.narrative==='Reviewed cancellation note.')).toBe(true);expect(d.complete).not.toHaveBeenCalled();expect(operation).toBeNull();
});
it('freezes a reviewed request, stops its reminders, preserves enrollment and queues durable progress',async()=>{
 expect(await submit()).toMatchObject({status:'queued',count:3,completed:0,officeReservationDisposition:'keep'});
 expect(JSON.parse(operation.review_json).staffAppointmentChange).toBe(true);expect(d.complete).not.toHaveBeenCalled();
 expect(d.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments'))).toBe(false);
 expect(d.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE appointment_reminders'))[1]).toEqual([1,2,3]);
 expect(d.execute.mock.calls.find(([sql])=>sql.includes("'$.clientUnscheduleFromDate'"))[1]).toEqual(['2027-01-03','2027-01-03','keep',30,'31','2']);
});
it('processes through the signed per-appointment workflow with the actual signing staff actor',async()=>{
 await submit({officeReservationDisposition:'release'});await service.processPending();expect(operation.status).toBe('completed');expect(d.complete).toHaveBeenCalledTimes(3);
 for(const [,facts,actor] of d.complete.mock.calls){expect(facts).toMatchObject({signatureConfirmed:true,staffSeriesOperationId:requestId,officeReservationDisposition:'release'});expect(actor).toMatchObject({actorUserId:7,actorRole:'provider',cancellationAt:'2026-11-14 20:00:00.000'});}
 expect(operation.completed_count).toBe(3);expect(appointments.has(90)).toBe(false);
});
it('resumes remaining work after a temporary failure without signing completed visits twice',async()=>{
 await submit();const complete=d.complete.getMockImplementation();let stopped=false;d.complete.mockImplementation(async(id,...args)=>{if(id===2&&!stopped){stopped=true;throw new Error('temporary database outage');}return complete(id,...args);});
 await service.processPending();expect(operation.status).toBe('queued');expect(operation.completed_count).toBe(1);
 await service.processPending();expect(operation.status).toBe('completed');expect(d.complete.mock.calls.filter(([id])=>id===1)).toHaveLength(1);
});
it('rejects stale reviewed consequences and group changes before queueing any mutation',async()=>{
 const preview=await service.preview(user,1,input);d.preview.mockResolvedValue({appointment:{id:1,displayWhen:'Changed'},classification:'late_cancel',consequence:{model:'fee',feeCents:8000}});
 await expect(service.submit(user,1,{...input,cancellationReviewToken:preview.seriesChange.reviewToken,cancellationRequestId:requestId,signatureConfirmed:true})).rejects.toMatchObject({status:409});expect(operation).toBeNull();
 d.participants.mockResolvedValue([{clientId:31},{clientId:32}]);await expect(service.preview(user,1,input)).rejects.toThrow('shared or group');
});
it('stops safely when a visit or actor changes after signing, preserving remaining appointments',async()=>{
 await submit();appointments.get(2).startAt='2027-02-04 18:00:00';await service.processPending();expect(operation.status).toBe('failed');expect(operation.completed_count).toBe(1);expect(appointments.get(2).status).toBe('scheduled');
});
it('validates documentation, authority and unsupported waiver choices before accepting a series request',async()=>{
 d.documentation.mockRejectedValue(Object.assign(new Error('Signed clinical documentation exists'),{status:409}));await expect(submit()).rejects.toThrow('Signed clinical');expect(operation).toBeNull();
 d.documentation.mockResolvedValue();await expect(submit({waiver:{action:'recommend'}})).rejects.toThrow('individual appointment changes');
});
