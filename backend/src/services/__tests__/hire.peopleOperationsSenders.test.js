import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),relay:vi.fn(),verify:vi.fn(),alias:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../workspaceRelayConfig.js',()=>({relaySelected:m.relay}));
vi.mock('../workspaceRelaySender.js',()=>({verifyWorkspaceRelaySender:m.verify}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({buildImpersonatedJwtClient:vi.fn(async()=>({})),GOOGLE_WORKSPACE_SCOPES:['existing-app-scope']}));
vi.mock('googleapis',()=>({google:{gmail:()=>({users:{settings:{sendAs:{get:m.alias}}}})}}));
import {peopleOperationsSenders} from '../peopleOperationsSubmissionNotifications.service.js';
let row,sequence=0;
beforeEach(()=>{vi.clearAllMocks();row={id:13,agency_id:2,identity_key:'people_operations',from_email:`po${++sequence}@tenant.test`,is_active:1};m.execute.mockImplementation(async()=>[[row]]);m.relay.mockReturnValue(false);m.alias.mockImplementation(async()=>({data:{sendAsEmail:row.from_email,verificationStatus:'accepted'}}));m.verify.mockResolvedValue({transport:'workspace_smtp_relay'});});
it('reports a legitimate existing Gmail identity as ready without changing its route or aliases',async()=>{
 expect(await peopleOperationsSenders(2)).toEqual([expect.objectContaining({id:13,transport:'gmail_send_as',ready:true})]);
 expect(m.alias).toHaveBeenCalledWith({userId:'me',sendAsEmail:row.from_email});expect(m.verify).not.toHaveBeenCalled();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=? AND is_active=1'),[2]);
});
it('verifies an explicitly configured Group relay identity with its current agency DB scope',async()=>{
 row.identity_key='people_operations_notifications';row.reply_to='po@tenant.test';m.relay.mockReturnValue(true);
 expect(await peopleOperationsSenders(2)).toEqual([expect.objectContaining({transport:'workspace_smtp_relay',ready:true,replyTo:'po@tenant.test'})]);
 expect(m.verify).toHaveBeenCalledWith(row.from_email,{db:expect.anything()});expect(m.alias).not.toHaveBeenCalled();
});
it.each(['unverified','lookup failure'])('shows actual mailbox readiness failure without switching to another transport: %s',async reason=>{
 if(reason==='unverified')m.alias.mockResolvedValue({data:{sendAsEmail:row.from_email,verificationStatus:'pending'}});else m.alias.mockRejectedValue(new Error('Not available'));
 expect(await peopleOperationsSenders(2)).toEqual([expect.objectContaining({transport:'gmail_send_as',ready:false,reason:expect.any(String)})]);expect(m.verify).not.toHaveBeenCalled();
});
it('holds an unverified Group sender without attempting Gmail fallback',async()=>{
 m.relay.mockReturnValue(true);m.verify.mockRejectedValue(new Error('Not a verified Group'));
 expect(await peopleOperationsSenders(2)).toEqual([expect.objectContaining({transport:'workspace_smtp_relay',ready:false})]);expect(m.alias).not.toHaveBeenCalled();
});
