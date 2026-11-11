vi.mock('../../../models/CommunicationConversation.model.js',()=>({default:{markRead:vi.fn(),markUnread:vi.fn()}}));
vi.mock('../../../models/UserCommunicationContact.model.js',()=>({default:{upsertSafe:vi.fn(),findByEmail:vi.fn(),block:vi.fn()}}));
import Conversation from '../../../models/CommunicationConversation.model.js';
import Contact from '../../../models/UserCommunicationContact.model.js';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),conversationAccess:vi.fn(),archive:vi.fn(),emails:vi.fn(),emailCounts:vi.fn(),archives:vi.fn(),extraCounts:vi.fn(),threads:vi.fn(),drafts:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../agencyScope.service.js',()=>({listMobileAgencies:vi.fn(async()=>({agencies:[]}))}));
vi.mock('../../../services/emailDraft.service.js',()=>({listEmailDrafts:mocks.drafts}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../../controllers/chat.controller.js',()=>({assertThreadAccess:mocks.access,markRead:vi.fn(),markUnread:vi.fn()}));
vi.mock('../../../controllers/quickViewSurfaces.controller.js',()=>({qvListChatThreads:mocks.threads,qvListChatChannels:vi.fn((req,res)=>res.json({channels:[]})),qvListThreadsInbox:vi.fn(),qvListMentions:vi.fn(),qvListFiles:vi.fn()}));
vi.mock('../../../services/communicationAccess.service.js',()=>({requireConversationAccess:mocks.conversationAccess}));
vi.mock('../../../services/unifiedInbox.service.js',()=>({updateConversation:vi.fn()}));
vi.mock('../conversa.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,mobileConversaStore:{emailInbox:async(id,options)=>Promise.all([mocks.emails(id,options),options.includeCounts===false?[]:mocks.emailCounts(id,options.includeArchived,options.agencyId)]),archive:mocks.archive,emails:mocks.emails,emailCounts:mocks.emailCounts,archives:mocks.archives,extraCounts:mocks.extraCounts}};});
vi.mock('../../../controllers/chatAttachments.controller.js',()=>({downloadSecureChatAttachment:vi.fn()}));
vi.mock('../documentationQueue.service.js',()=>({getMobileDocumentationQueue:vi.fn()}));
vi.mock('../../../services/storage.service.js',()=>({default:{}}));
import {listMobileAgencies} from '../agencyScope.service.js';
import {qvListChatChannels} from '../../../controllers/quickViewSurfaces.controller.js';
import {getMobileWorkspaceCounts,postMobileSpam,postMobileKnownSender,patchMobileMessageState,getMobileInbox,patchMobileArchive,getMobileChatContext,getMobileFile} from '../../../controllers/mobileConversa.controller.js';
const request=()=>({quickView:{userId:3,agencyId:2,mobileDeviceSessionId:7},params:{id:'10',kind:'chat',threadId:'10'},query:{},headers:{},body:{archived:true,userId:999}});
const response=()=>({set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();listMobileAgencies.mockResolvedValue({agencies:[]});qvListChatChannels.mockImplementation((req,res)=>res.json({channels:[]}));mocks.access.mockResolvedValue(true);mocks.emails.mockResolvedValue([]);mocks.emailCounts.mockResolvedValue([]);mocks.archives.mockResolvedValue(new Map());mocks.extraCounts.mockResolvedValue({threads:{total:0,unread:0,needs:0},mentions:{total:0,unread:0,needs:0},files:{total:0,unread:0,needs:0}});mocks.threads.mockImplementation((req,res)=>res.json([{thread_id:10,thread_type:'client_secure',message_channel:'secure',participants:[{id:5,first_name:'Private',last_name:'Person'}],last_message:{id:50,body:'SENSITIVE MESSAGE',sender_user_id:5,created_at:'2026-11-06T10:00:00Z'},unread_count:1}]));});
it('does not let a legacy Quick View PIN session open the new mobile features',async()=>{for(const handler of [getMobileWorkspaceCounts,getMobileInbox,patchMobileArchive,getMobileChatContext,getMobileFile]){const req=request();delete req.quickView.mobileDeviceSessionId;const res=response();await handler(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.access).not.toHaveBeenCalled();});
it('archives only as the session user and checks current active agency access',async()=>{const req=request(),res=response();await patchMobileArchive(req,res,vi.fn());expect(mocks.access).toHaveBeenCalledWith(3,10,{requireActiveAgency:true});expect(mocks.archive).toHaveBeenCalledWith(3,'chat',10,true);});
it('rechecks secure membership before returning names or file bytes',async()=>{mocks.access.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));const res=response();await getMobileChatContext(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(mocks.execute).not.toHaveBeenCalled();});
it('does not put secure body text or full names in the combined inbox',async()=>{const res=response();await getMobileInbox(request(),res,vi.fn());const body=res.json.mock.calls[0][0];expect(body.items[0]).toMatchObject({category:'secure',title:'Pr••• Pe•••',preview:'Secure message · tap to unlock'});expect(JSON.stringify(body)).not.toContain('Private Person');expect(JSON.stringify(body)).not.toContain('SENSITIVE MESSAGE');expect(body.counts.all.unread).toBe(1);});
it('excludes provisioned empty threads from rows and counts and orders conversations by real messages',async()=>{
 mocks.threads.mockImplementation((req,res)=>res.json([
  {thread_id:10,thread_type:'client_secure',message_channel:'secure',updated_at:'2026-11-07T15:00:00Z',last_message:null},
  {thread_id:11,thread_type:'direct',updated_at:'2026-11-07T14:00:00Z',participants:[{id:5,first_name:'Avery'}],last_message:{id:90,body:'Earlier message',sender_user_id:5,created_at:'2026-11-06T11:00:00Z'}},
  {thread_id:12,thread_type:'direct',updated_at:'2026-11-06T12:00:00Z',participants:[{id:5,first_name:'Avery'}],last_message:{id:91,body:'',attachment_count:1,sender_user_id:5,created_at:'2026-11-06T12:00:00Z'}}
 ]));
 const res=response();await getMobileInbox(request(),res,vi.fn());const body=res.json.mock.calls[0][0];
 expect(body.items.map(item=>item.id)).toEqual([12,11]);expect(body.items[0].preview).toBe('Attachment · open to view');expect(body.counts.all.total).toBe(2);expect(body.counts.secure.total).toBe(0);expect(mocks.extraCounts).toHaveBeenCalledWith(3,[11,12]);
});
it('passes the approved QA tenant to every inbox source and rejects other-tenant thread rows defensively',async()=>{
 const req=request();req.quickView.agencyId=450;req.quickView.qaAgencyIds=[450];
 mocks.threads.mockImplementation((request,res)=>{expect(request.query.agencyId).toBe(450);res.json([450,456].map(agency_id=>({thread_id:agency_id,agency_id,thread_type:'direct',last_message:{id:agency_id,body:'Synthetic',created_at:'2026-11-06T12:00:00Z'}})));});
 const res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].items.map(item=>item.id)).toEqual([450]);expect(mocks.emails).toHaveBeenCalledWith(3,expect.objectContaining({agencyId:450}));expect(mocks.emailCounts).toHaveBeenCalledWith(3,false,450);expect(mocks.extraCounts).toHaveBeenCalledWith(3,[450]);
});

it('counts only unread conversations in the combined badge, including the visible Unknown folder',async()=>{
 mocks.threads.mockImplementation((req,res)=>res.json([{thread_id:10,thread_type:'direct',participants:[{id:5,first_name:'Jordan'}],unread_count:12,last_message:{id:50,body:'Unread',sender_user_id:5,created_at:'2026-11-06T10:00:00Z'}},{thread_id:11,thread_type:'direct',participants:[{id:5,first_name:'Jordan'}],unread_count:0,last_message:{id:51,body:'Read',sender_user_id:5,created_at:'2026-11-06T11:00:00Z'}}]));
 mocks.emailCounts.mockResolvedValue([{category:'email',unknown:false,total:100,unread:3,needs:4},{category:'email',unknown:true,total:20,unread:1,needs:2}]);
 const req=request();req.query={suite:'all',filter:'unread'};const res=response();await getMobileInbox(req,res,vi.fn());const body=res.json.mock.calls[0][0];expect(body.counts.all).toMatchObject({total:122,unread:5});expect(body.counts.email.unread).toBe(3);expect(body.counts.unknown.unread).toBe(1);expect(body.counts.direct.unread).toBe(1);expect(body.items.map(item=>item.id)).toEqual([10]);
});

it('includes an authored conversation in Sent even when its newest message is inbound',async()=>{
 mocks.threads.mockImplementation((req,res)=>res.json([{thread_id:10,has_sent:true,thread_type:'direct',last_message:{id:50,body:'Later inbound',sender_user_id:5,created_at:'2026-11-06T10:00:00Z'}},{thread_id:11,thread_type:'direct',last_message:{id:51,body:'Only inbound',sender_user_id:5,created_at:'2026-11-06T11:00:00Z'}}]));const req=request();req.query={suite:'direct',filter:'sent'};const res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].items.map(i=>i.id)).toEqual([10]);expect(res.json.mock.calls[0][0].counts.direct.sent).toBe(1);
});
it('browses available channels including an empty joined channel, while Unread filters them out',async()=>{
 listMobileAgencies.mockResolvedValue({agencies:[{id:2,name:'ITSCO',slug:'itsco'}]});qvListChatChannels.mockImplementation((req,res)=>res.json({channels:[{id:60,name:'Available',is_member:false},{id:61,name:'Joined',is_member:true}]}));
 const req=request();req.query={suite:'channels',filter:'all'};let res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].items).toEqual(expect.arrayContaining([expect.objectContaining({id:60,join:true}),expect.objectContaining({id:61,join:false,agencyLogoUrl:'https://auricwell.com/email-signatures/staff-html/itsco-main-logo.png'})]));
 req.query.filter='unread';res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].items).toEqual([]);expect(res.json.mock.calls[0][0].counts.channels.total).toBe(2);
});

it('uses per-user read markers for authorized group email without changing its ticket',async()=>{
 mocks.conversationAccess.mockResolvedValue({id:10,agency_id:2,channel:'email',support_ticket_id:77});const req=request();req.params.kind='email';req.body={read:true};const res=response();await patchMobileMessageState(req,res,vi.fn());expect(Conversation.markRead).toHaveBeenCalledWith(10,3);expect(res.json).toHaveBeenCalledWith({ok:true});
 req.body.read=false;await patchMobileMessageState(req,response(),vi.fn());expect(Conversation.markUnread).toHaveBeenCalledWith(10,3);
 mocks.conversationAccess.mockRejectedValue(Object.assign(new Error('Not authorized'),{status:403}));Conversation.markRead.mockClear();await patchMobileMessageState(req,response(),vi.fn());expect(Conversation.markRead).not.toHaveBeenCalled();
});
it('saves the authorized conversation sender for this owner and rejects blocked contacts',async()=>{
 mocks.conversationAccess.mockResolvedValue({id:10,agency_id:2,channel:'email'});mocks.execute.mockResolvedValue([[{email:'outside@example.invalid',display_name:'External sender'}]]);Contact.upsertSafe.mockResolvedValue({id:9,email:'outside@example.invalid',trust_status:'safe'});const res=response();await postMobileKnownSender(request(),res,vi.fn());expect(Contact.upsertSafe).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:3,agencyId:2,email:'outside@example.invalid',source:'mark_known'}));
 Contact.upsertSafe.mockResolvedValue({trust_status:'blocked'});const blocked=response();await postMobileKnownSender(request(),blocked,vi.fn());expect(blocked.status).toHaveBeenCalledWith(409);
});
it('returns startup unread counts without loading email rows, channel discovery, or secondary message folders',async()=>{const req=request(),res=response();req.query={countsOnly:'1'};mocks.emailCounts.mockResolvedValue([{category:'email',total:8,unread:4,needs:0,sent:1}]);await getMobileInbox(req,res,vi.fn());expect(res.json).toHaveBeenCalledWith({counts:expect.objectContaining({all:expect.objectContaining({unread:5}),email:expect.objectContaining({unread:4})})});expect(mocks.emails).not.toHaveBeenCalled();expect(mocks.extraCounts).not.toHaveBeenCalled();expect(qvListChatChannels).not.toHaveBeenCalled();});

it('marks a confirmed unknown sender as spam for the signed-in recipient only',async()=>{
 mocks.conversationAccess.mockResolvedValue({id:10,agency_id:2,channel:'email',is_unknown_sender:1,support_ticket_id:77});mocks.execute.mockResolvedValueOnce([[{email:'unknown@example.invalid',display_name:'Synthetic sender'}]]).mockResolvedValueOnce([[]]);Contact.findByEmail.mockResolvedValue(null);Contact.block.mockResolvedValue({});const req=request();req.body={confirmed:true,userId:999};const res=response(),next=vi.fn();await postMobileSpam(req,res,next);expect(next).not.toHaveBeenCalled();expect(Contact.block).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:3,blockedByUserId:3,agencyId:2,email:'unknown@example.invalid'}));expect(res.json).toHaveBeenCalledWith({ok:true});expect(Conversation.markRead).not.toHaveBeenCalled();expect(mocks.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('rejects unconfirmed, known, internal, revoked and legacy-PIN spam operations',async()=>{
 let req=request(),res=response();await postMobileSpam(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(400);expect(Contact.block).not.toHaveBeenCalled();
 req=request();req.body={confirmed:true};mocks.conversationAccess.mockResolvedValue({agency_id:2,channel:'email',is_unknown_sender:0});res=response();await postMobileSpam(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);
 mocks.conversationAccess.mockResolvedValue({agency_id:2,channel:'email',is_unknown_sender:1});mocks.execute.mockResolvedValueOnce([[{email:'staff@example.invalid'}]]).mockResolvedValueOnce([[{id:4}]]);res=response();await postMobileSpam(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);
 mocks.conversationAccess.mockRejectedValue(Object.assign(new Error('Not authorized'),{status:403}));res=response();await postMobileSpam(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
 delete req.quickView.mobileDeviceSessionId;res=response();await postMobileSpam(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(Contact.block).not.toHaveBeenCalled();
});
it('excludes spam from the combined badge while retaining its separate folder',async()=>{mocks.emailCounts.mockResolvedValue([{category:'spam',unknown:false,total:12,unread:12},{category:'email',unknown:false,total:1,unread:1}]);mocks.emails.mockResolvedValue([{id:2,key:'email:2',category:'spam',unread:true},{id:3,key:'email:3',category:'email',unread:true}]);const req=request(),res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].counts.spam.unread).toBe(12);expect(res.json.mock.calls[0][0].counts.all.unread).toBe(2);expect(res.json.mock.calls[0][0].items.some(item=>item.category==='spam')).toBe(false);req.query.suite='spam';const spam=response();await getMobileInbox(req,spam,vi.fn());expect(spam.json.mock.calls[0][0].items.map(item=>item.id)).toEqual([2]);});

it('loads Email and Sent rows without unrelated chats, counts, archives, or channel discovery',async()=>{
 const req=request();req.query={suite:'email',filter:'sent',includeCounts:'0'};mocks.emails.mockResolvedValue([{key:'email:7',id:7,kind:'email',category:'email',title:'Sent fixture',hasSent:true,at:'2026-11-06T12:00:00Z'}]);
 const res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0]).toMatchObject({items:[{id:7}],counts:{},nextCursor:null});expect(mocks.emails).toHaveBeenCalledWith(3,expect.objectContaining({suite:'email',filter:'sent',includeCounts:false}));
 for(const spy of [mocks.threads,mocks.emailCounts,mocks.archives,mocks.extraCounts,qvListChatChannels])expect(spy).not.toHaveBeenCalled();
});
it('loads Direct without fetching any email rows or unused counters',async()=>{
 const req=request();req.query={suite:'direct',filter:'all',includeCounts:'0'};const res=response();await getMobileInbox(req,res,vi.fn());expect(mocks.threads).toHaveBeenCalledTimes(1);expect(mocks.archives).toHaveBeenCalledWith(3);for(const spy of [mocks.emails,mocks.emailCounts,mocks.extraCounts,qvListChatChannels])expect(spy).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].counts).toEqual({});
});
it('does not discover empty available channels for All unread',async()=>{
 const req=request();req.query={suite:'all',filter:'unread'};const res=response();await getMobileInbox(req,res,vi.fn());expect(res.json.mock.calls[0][0].items).toHaveLength(1);expect(qvListChatChannels).not.toHaveBeenCalled();
});
it('loads drafts in bounded parallel batches without waiting on inbox history or counts',async()=>{
 listMobileAgencies.mockResolvedValue({agencies:[{id:2,name:'Agency two'},{id:4,name:'Agency four'}]});let resolveFirst;const first=new Promise(resolve=>{resolveFirst=resolve;});mocks.drafts.mockImplementation((_user,id)=>id===2?first:Promise.resolve([{id:'newer',subject:'Second agency draft',updated_at:'2026-11-06T13:00:00Z'}]));
 const req=request();req.query={suite:'drafts'};const res=response(),pending=getMobileInbox(req,res,vi.fn());for(let i=0;i<10 && mocks.drafts.mock.calls.length<2;i++)await new Promise(resolve=>setImmediate(resolve));expect(mocks.drafts.mock.calls.map(call=>call[1])).toEqual([2,4]);resolveFirst([{id:'older',subject:'First agency draft',updated_at:'2026-11-06T12:00:00Z'}]);await pending;
 expect(res.json.mock.calls[0][0].items.map(item=>item.id)).toEqual(['newer','older']);expect(mocks.drafts).toHaveBeenCalledWith({id:3,role:'provider',mobileDevice:true},2);for(const spy of [mocks.emails,mocks.threads,mocks.archives,mocks.emailCounts,mocks.extraCounts,qvListChatChannels])expect(spy).not.toHaveBeenCalled();
});
it('clamps the draft lookup to the approved QA tenant',async()=>{
 listMobileAgencies.mockResolvedValue({agencies:[{id:450},{id:456}]});mocks.drafts.mockResolvedValue([]);const req=request();req.quickView.agencyId=450;req.quickView.qaAgencyIds=[450];req.query={suite:'drafts'};const res=response();await getMobileInbox(req,res,vi.fn());expect(mocks.drafts.mock.calls.map(call=>call[1])).toEqual([450]);
});
