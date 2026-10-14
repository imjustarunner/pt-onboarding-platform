import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../smsConsentRequest.service.js',()=>({reviewSmsConsentRequest:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
import {processStaffSmsEnrollments} from '../staffSmsEnrollmentAutomation.service.js';
it('runs only explicitly authorized agencies and claims once before review',async()=>{
 const database={execute:vi.fn().mockResolvedValueOnce([[{id:1,agency_id:2,authorized_by_user_id:501}]]).mockResolvedValue([{affectedRows:1}])},review=vi.fn(),sendConfirmation=vi.fn();
 const result=await processStaffSmsEnrollments({database,review,sendConfirmation});
 expect(database.execute.mock.calls[0][0]).toContain('s.enabled=1');expect(database.execute.mock.calls[0][0]).toContain('staff_communications');
 expect(review).toHaveBeenCalledWith({agencyId:2,requestId:1,actorUserId:501,signerVerified:true,sendConfirmation});expect(result).toEqual([{requestId:1,status:'complete'}]);
});
it('does not send when another worker claimed enrollment',async()=>{
 const database={execute:vi.fn().mockResolvedValueOnce([[{id:1,agency_id:2,authorized_by_user_id:501}]]).mockResolvedValue([{affectedRows:0}])},review=vi.fn();
 await processStaffSmsEnrollments({database,review});expect(review).not.toHaveBeenCalled();
});
it('leaves ambiguous confirmation failures for review rather than repeating texts',async()=>{
 const database={execute:vi.fn().mockResolvedValueOnce([[{id:1,agency_id:2,authorized_by_user_id:501}]]).mockResolvedValue([{affectedRows:1}])},review=vi.fn().mockRejectedValue(new Error('connection closed'));
 expect(await processStaffSmsEnrollments({database,review})).toEqual([{requestId:1,status:'needs_review',reason:'connection closed'}]);
 const audit=JSON.parse(database.execute.mock.calls.at(-1)[1][0]);expect(audit.mode).toBe('agency_authorized_automation');expect(audit.authorizedBy).toBe(501);
});
