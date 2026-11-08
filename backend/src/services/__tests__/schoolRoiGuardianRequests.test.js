import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../schoolRoiEmail.service.js', () => ({ sendSchoolRoiEmail: vi.fn(), schoolRoiDelivery: r => ({ sent: !!r?.id && !r?.pendingApproval }) }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: vi.fn() }));
vi.mock('../clientPortalContext.service.js', () => ({ clientPortalInviteUrl: () => 'https://example.test/demo/login' }));
import { requestSchoolRoiForGuardians } from '../schoolRoiGuardianRequests.service.js';
const guardian = id => ({ guardian_user_id: id, access_enabled: 1, email: `guardian${id}@example.test`, first_name: `Parent ${id}` });
function fixture() {
 const issueLink = vi.fn(async args => ({ ok:true, issuedLink:{id:args.recipientGuardianUserId} }));
 const sendEmail = vi.fn(async () => ({id:'synthetic-message'}));
 const recordSent = vi.fn();
 return {client:{id:10,agency_id:20},schoolOrganizationId:30,actorUserId:40,
 listGuardians:async()=>[guardian(1),guardian(2),{...guardian(3),permissions_json:{noView:true}}],
 findExisting:vi.fn(async()=>null),issueLink,sendEmail,recordSent,
 emailContext:async()=>({portal:{},url:()=> 'https://example.test/demo/guardian'})};
}
it('prepares distinct guardian links and sends separate portal prompts',async()=>{
 const deps=fixture();const result=await requestSchoolRoiForGuardians(deps);
 expect(result.ok).toBe(true);expect(result.deliveries.map(row=>row.guardianUserId)).toEqual([1,2]);
 expect(deps.issueLink.mock.calls.map(([args])=>args.recipientGuardianUserId)).toEqual([1,2]);
 expect(deps.sendEmail.mock.calls.map(([args])=>args.to)).toEqual(['guardian1@example.test','guardian2@example.test']);
 for(const [args] of deps.sendEmail.mock.calls){expect(args.cc).toBeUndefined();expect(args.text).toContain('Each guardian needs to respond separately');expect(args.linkUrl).toContain('redirect=');}
 expect(deps.recordSent).toHaveBeenCalledTimes(2);
});
it('attempts the second guardian if the first email fails and never marks a queued request sent',async()=>{
 const deps=fixture();deps.sendEmail.mockRejectedValueOnce(new Error('Synthetic transport failure')).mockResolvedValueOnce({pendingApproval:true});
 const result=await requestSchoolRoiForGuardians(deps);
 expect(result.deliveries.map(row=>row.status)).toEqual(['failed','pending']);expect(result.ok).toBe(false);expect(deps.recordSent).not.toHaveBeenCalled();
});
it('reuses a recent delivery instead of resending or resetting a completed signature',async()=>{
 const deps=fixture();deps.findExisting.mockResolvedValue({status:'completed',last_email_sent_at:new Date()});
 const result=await requestSchoolRoiForGuardians(deps);
 expect(result.deliveries.map(row=>row.status)).toEqual(['recently_sent','recently_sent']);expect(deps.issueLink).not.toHaveBeenCalled();expect(deps.sendEmail).not.toHaveBeenCalled();
});

it('sends only to a selected authorized guardian and rejects a foreign or restricted selection before any send',async()=>{
 const deps=fixture();
 const result=await requestSchoolRoiForGuardians({...deps,guardianUserIds:[2]});
 expect(result.deliveries.map(r=>r.guardianUserId)).toEqual([2]);
 expect(deps.sendEmail).toHaveBeenCalledTimes(1);
 deps.sendEmail.mockClear();deps.issueLink.mockClear();
 for(const selected of [[99],[3],[2,99],[]]) await expect(requestSchoolRoiForGuardians({...deps,guardianUserIds:selected})).rejects.toMatchObject({status:selected.length?403:400});
 expect(deps.sendEmail).not.toHaveBeenCalled();expect(deps.issueLink).not.toHaveBeenCalled();
});
