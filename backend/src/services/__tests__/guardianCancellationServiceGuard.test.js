import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import {assertClientServiceSchedulingActive} from '../clientServiceSchedulingGuard.service.js';
const input={agencyId:377,providerUserId:501,clientId:81,businessType:'mental_health',source:'reserved_office_session:abc'};
beforeEach(()=>{vi.resetAllMocks();m.execute.mockImplementation(async(sql,args)=>[
 sql.includes('FROM client_service_enrollments') && args[0]===81&&args[1]===377&&args[2]===501&&args[3]==='counseling'?[{id:9}]:[]]);});
it('blocks resumed background booking of the ended service without blocking another agency, provider or service',async()=>{
 await expect(assertClientServiceSchedulingActive(input)).rejects.toMatchObject({status:409,code:'CLIENT_SERVICE_ENDED'});
 for(const patch of [{agencyId:2},{providerUserId:502},{businessType:'learning'}])await expect(assertClientServiceSchedulingActive({...input,...patch})).resolves.toBeUndefined();
});
it('stops a canceled series without preventing an unrelated new series or tutoring service',async()=>{
 m.execute.mockImplementation(async(sql,args)=>[sql.includes('FROM guardian_service_cancellations')&&args[3]==='counseling'&&args[4]===input.source?[{id:'11111111-1111-4111-8111-111111111111'}]:[]]);
 await expect(assertClientServiceSchedulingActive(input)).rejects.toMatchObject({code:'CLIENT_SERIES_ENDED'});
 await expect(assertClientServiceSchedulingActive({...input,source:'reserved_office_session:new'})).resolves.toBeUndefined();
 await expect(assertClientServiceSchedulingActive({...input,businessType:'learning'})).resolves.toBeUndefined();
});
