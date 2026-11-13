import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {createGuardianServiceExitFeedback,exitFeedbackAnswers} from '../guardianServiceExitFeedback.service.js';
let m,service,saved,operation;
const input={userId:9,clientId:8,operationId:'11111111-1111-4111-8111-111111111111',rating:4,comments:'Please offer later appointments.',contactRequested:false};
beforeEach(()=>{
 saved=null;operation={id:input.operationId,agency_id:2,client_id:8,actor_user_id:9,provider_user_id:7,appointment_id:1,scope:'end_services',status:'completed'};
 m={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM guardian_service_cancellations'))return [[...(args[0]===operation.id&&args[1]===9&&args[2]===8?[operation]:[])]];
  if(sql.startsWith('SELECT operation_id'))return [[...(saved?[{operation_id:operation.id}]:[])]];
  if(sql.startsWith('INSERT IGNORE INTO guardian_service_exit_feedback')){if(saved)return[{affectedRows:0}];saved={hash:args[4],encrypted:args[5]};return[{affectedRows:1}];}
  if(sql.startsWith('SELECT request_hash'))return [[{request_hash:saved.hash}]];
  return [{affectedRows:1}];
 }),authorize:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),encrypt:vi.fn((answers,context)=>JSON.stringify({answers,context}))};
 service=createGuardianServiceExitFeedback({db:{execute:m.execute,getConnection:async()=>m},authorize:m.authorize,encrypt:m.encrypt});
});
it('accepts a short optional response once, encrypts it, and notifies the assigned team without sending another email or text',async()=>{
 expect(await service.read(input)).toEqual({submitted:false});await service.submit(input);await service.submit(input);
 expect(await service.read(input)).toEqual({submitted:true});expect(m.encrypt).toHaveBeenCalledWith({rating:4,comments:input.comments,contactRequested:false},`guardian-exit-feedback:2:${input.operationId}`);
 const alerts=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO notifications'));expect(alerts).toHaveLength(1);
 expect(alerts[0][1][0]).toContain(input.comments);expect(alerts[0][1][0]).toContain('No follow-up contact was requested');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_'))).toBe(false);
});
it('does not disclose another actor’s feedback, or accept feedback until termination finishes',async()=>{
 await expect(service.read({...input,userId:10})).rejects.toMatchObject({status:404});
 operation.status='processing';await expect(service.submit(input)).rejects.toMatchObject({status:409});expect(saved).toBeNull();
});
it('rechecks current access and records contact permission only when explicitly selected',async()=>{
 m.authorize.mockRejectedValueOnce(Object.assign(new Error('Access removed'),{status:403}));await expect(service.submit(input)).rejects.toMatchObject({status:403});
 await service.submit({...input,contactRequested:true});expect(m.encrypt.mock.calls[0][0].contactRequested).toBe(true);
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO notifications'))[1][0]).toContain('asked our team to contact');
});
it('validates the form and prevents a retry from replacing already-submitted feedback',async()=>{
 for(const patch of [{rating:0},{rating:true},{rating:6},{comments:'a'.repeat(1001)},{contactRequested:'yes'},{rating:null,comments:'',contactRequested:false}])expect(()=>exitFeedbackAnswers({...input,...patch})).toThrow();
 await service.submit(input);await expect(service.submit({...input,rating:1})).rejects.toMatchObject({status:409});
 expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO notifications'))).toHaveLength(1);
});
