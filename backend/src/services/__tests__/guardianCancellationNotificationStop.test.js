import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {serviceNotificationBlocked} from '../clientServiceNotificationPolicy.service.js';
const appointment={id:1,agencyId:2,providerUserId:7,businessType:'mental_health'};
const input={appointment,clientId:8};
it('stops ended-service messages while leaving other agencies, providers and services unchanged',async()=>{
 const db={execute:vi.fn(async(sql,args)=>[args[0]===8&&args[1]===2&&args[2]===7&&args[3]==='counseling'?[{notification_stop_id:5}]:[]])};
 expect(await serviceNotificationBlocked(input,db)).toBe(true);
 for(const patch of [{agencyId:3},{providerUserId:99},{businessType:'learning'}])expect(await serviceNotificationBlocked({...input,appointment:{...appointment,...patch}},db)).toBe(false);
});
it('allows only the saved termination confirmation after the team has been notified',async()=>{
 const facts={guardianCancellationOperationId:'11111111-1111-4111-8111-111111111111',guardianSummary:{endsService:true},cancellationActorUserId:9};
 const db={execute:vi.fn(async sql=>sql.includes('FROM client_service_enrollments')?[[{notification_stop_id:5}]]:[[]])};
 expect(await serviceNotificationBlocked({...input,facts},db)).toBe(true);
 db.execute.mockImplementation(async sql=>sql.includes('FROM client_service_enrollments')?[[{notification_stop_id:5}]]:[[{confirmation_id:facts.guardianCancellationOperationId}]]);
 expect(await serviceNotificationBlocked({...input,facts},db)).toBe(false);
 expect(db.execute.mock.calls.at(-1)[0]).toContain('team_notified_at IS NOT NULL');
 expect(db.execute.mock.calls.at(-1)[1]).toEqual([facts.guardianCancellationOperationId,8,2,7,1,9]);
});
it('uses the client service type for legacy appointments without a business type',async()=>{
 const db={execute:vi.fn(async(sql,args)=>sql.startsWith('SELECT client_type')?[[{client_type:'learning'}]]:[args[3]==='tutoring'?[{notification_stop_id:5}]:[]])};
 expect(await serviceNotificationBlocked({...input,appointment:{...appointment,businessType:null}},db)).toBe(true);
});
