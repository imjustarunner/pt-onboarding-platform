import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {tutoringMakeupContext,tutoringMakeupDetails} from '../tutoringMakeup.service.js';
const original={id:420,agencyId:453,businessType:'tutoring',status:'no_show',learningContext:{serviceEnrollmentId:1038}};
const input={makeupForAppointmentId:420,agencyId:453,clientId:2545,learningContext:{serviceEnrollmentId:1038,subjectLabel:'Math'}};
const deps=(changed={})=>({find:vi.fn(async()=>({...original,...changed})),participants:vi.fn(async()=>[{clientId:2545}])});
it('links a makeup to the same missed student and service without changing the source outcome',async()=>{
 const d=deps();expect(await tutoringMakeupContext(input,d)).toEqual({...input.learningContext,makeupForAppointmentId:420});
 expect(original.status).toBe('no_show');
});
it.each([{agencyId:6},{status:'scheduled'},{learningContext:{serviceEnrollmentId:1042}},{businessType:'mental_health'}])('rejects a different agency, unmissed event, service or clinical original %j',async patch=>{
 await expect(tutoringMakeupContext(input,deps(patch))).rejects.toThrow('same organization');
});
it('denies an original with a different child',async()=>{
 await expect(tutoringMakeupContext(input,{...deps(),participants:async()=>[{clientId:2547}]})).rejects.toThrow();
});
it('returns only scoped shared-child links and actual recorded fee data',async()=>{
 const db={execute:vi.fn(async()=>[[{id:420,status:'no_show',cancellation_fee_cents:1500}]])};
 const result=await tutoringMakeupDetails({id:480,agencyId:453,businessType:'tutoring',learningContext:{makeupForAppointmentId:420}},db);
 expect(result[0]).toMatchObject({appointmentId:420,relation:'original',feeCents:1500});
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('current_p.client_id=p.client_id'),[453,420,480,480,480]);
});

import {makeupFeeStatus} from '../tutoringMakeup.service.js';
it('distinguishes a signed waiver, a recommendation and a pending correction window',()=>{
 expect(makeupFeeStatus({workflow_status:'completed',facts_json:{waiver:{action:'waive'}}})).toContain('waived');
 expect(makeupFeeStatus({workflow_status:'completed',facts_json:{waiver:{action:'recommend'}}})).toContain('review pending');
 expect(makeupFeeStatus({status:'no_show_pending'})).toContain('on hold');
 expect(makeupFeeStatus({workflow_status:'draft',facts_json:{waiver:{action:'waive'}}})).not.toContain('waived');
});

it('supports saved JSON string contexts in the family appointment query',async()=>{
 const db={execute:vi.fn(async()=>[[{id:420,status:'no_show',cancellation_fee_cents:0}]])};
 const details=await tutoringMakeupDetails({id:480,agencyId:453,businessType:'tutoring',status:'scheduled',learningContext:JSON.stringify({makeupForAppointmentId:420})},db);
 expect(details[0]).toMatchObject({appointmentId:420,relation:'original'});
});
