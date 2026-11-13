import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:()=>{}}));
vi.mock('../unifiedEmail/gmailInboundRetry.js',()=>({deferredInboundMessages:vi.fn(async()=>new Set()),deferInboundMessage:vi.fn(),clearInboundRetry:vi.fn()}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getGmailClient:vi.fn(),getImpersonatedUser:()=> 'ai@agency.test'}));
vi.mock('../unifiedEmail/gmailLabels.js',()=>({ensureLabelId:async name=>name}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByInboundAddress:vi.fn(),findByFromEmail:vi.fn(),findById:vi.fn()}}));
vi.mock('../unsolicitedOutreach.service.js',()=>({filterSharedMailboxOutreach:vi.fn()}));
vi.mock('../unmonitoredMailbox.service.js',()=>({handleUnmonitoredMailboxReply:vi.fn()}));
vi.mock('../credentialingOperations.service.js',()=>({ingestCredentialingEmail:vi.fn()}));
vi.mock('../coGuardianBounce.service.js',()=>({reconcileGuardianDeliveryReport:vi.fn()}));
vi.mock('../groupMailboxRouting.service.js',()=>({resolvePersonalMailRecipients:vi.fn()}));
vi.mock('../personalMailbox.service.js',()=>({ingestPersonalMailboxInbound:vi.fn(),isPersonalMailboxIdentity:vi.fn()}));
import pool from '../../config/database.js';
import identities from '../../models/EmailSenderIdentity.model.js';
import {getGmailClient} from '../unifiedEmail/gmailClient.js';
import {filterSharedMailboxOutreach} from '../unsolicitedOutreach.service.js';
import {handleUnmonitoredMailboxReply} from '../unmonitoredMailbox.service.js';
import {ingestCredentialingEmail} from '../credentialingOperations.service.js';
import {ingestPersonalMailboxInbound} from '../personalMailbox.service.js';
import {runInboundEmailAgentOnce} from '../unifiedEmail/inboundEmailAgent.service.js';
let gmail;
const identity={id:90,agency_id:2,identity_key:'support',kind:'shared',is_active:1};
beforeEach(()=>{
 vi.clearAllMocks();pool.execute.mockImplementation(async sql=>[sql.includes('SELECT from_email')?[{from_email:'support@agency.test'}]:[]]);
 identities.findByInboundAddress.mockResolvedValue(identity);identities.findByFromEmail.mockResolvedValue(null);identities.findById.mockResolvedValue(identity);
 filterSharedMailboxOutreach.mockResolvedValue({filtered:true});
 handleUnmonitoredMailboxReply.mockResolvedValue({handled:true});
 gmail={users:{messages:{list:vi.fn(async()=>({data:{messages:[{id:'incoming-1'}]}})),get:vi.fn(async()=>({data:{payload:{headers:[
  {name:'From',value:'vendor@outside.test'},{name:'To',value:'support@agency.test'},{name:'Subject',value:'SEO Report'},{name:'Message-ID',value:'<external@outside.test>'}
 ],body:{data:Buffer.from('We provide SEO services with prices. Schedule a call.').toString('base64url')}}}})),modify:vi.fn(async()=>({}))}}};
 getGmailClient.mockResolvedValue(gmail);
});
it('removes pitches from group processing before any inbox copy, ticket or department handler',async()=>{
 expect((await runInboundEmailAgentOnce()).ignored).toBe(1);
 expect(filterSharedMailboxOutreach).toHaveBeenCalledWith(expect.objectContaining({identity,fromEmail:'vendor@outside.test',subject:'SEO Report',bodyText:expect.stringContaining('SEO services'),ourFromEmails:expect.arrayContaining(['support@agency.test'])}));
 expect(handleUnmonitoredMailboxReply).not.toHaveBeenCalled();expect(ingestCredentialingEmail).not.toHaveBeenCalled();expect(ingestPersonalMailboxInbound).not.toHaveBeenCalled();
 expect(pool.execute.mock.calls.some(([sql])=>/INSERT INTO (support_tickets|communications|communication_conversations)/.test(sql))).toBe(false);
 expect(gmail.users.messages.modify).toHaveBeenCalledWith({userId:'me',id:'incoming-1',requestBody:{removeLabelIds:['UNREAD'],addLabelIds:['AI_PROCESSED','AI_IGNORED']}});
});
it('continues ordinary mailbox processing when outreach is not filtered',async()=>{
 filterSharedMailboxOutreach.mockResolvedValue({filtered:false});await runInboundEmailAgentOnce();
 expect(handleUnmonitoredMailboxReply).toHaveBeenCalledOnce();
 expect(gmail.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({requestBody:{removeLabelIds:['UNREAD'],addLabelIds:['AI_PROCESSED']}}));
});
