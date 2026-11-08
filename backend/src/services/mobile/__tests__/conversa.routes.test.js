import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),conversationAccess:vi.fn(),archive:vi.fn(),emails:vi.fn(),emailCounts:vi.fn(),archives:vi.fn(),extraCounts:vi.fn(),threads:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../../controllers/chat.controller.js',()=>({assertThreadAccess:mocks.access,markRead:vi.fn(),markUnread:vi.fn()}));
vi.mock('../../../controllers/quickViewSurfaces.controller.js',()=>({qvListChatThreads:mocks.threads,qvListChatChannels:vi.fn((req,res)=>res.json({channels:[]})),qvListThreadsInbox:vi.fn(),qvListMentions:vi.fn(),qvListFiles:vi.fn()}));
vi.mock('../../../services/communicationAccess.service.js',()=>({requireConversationAccess:mocks.conversationAccess}));
vi.mock('../../../services/unifiedInbox.service.js',()=>({updateConversation:vi.fn()}));
vi.mock('../conversa.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,mobileConversaStore:{archive:mocks.archive,emails:mocks.emails,emailCounts:mocks.emailCounts,archives:mocks.archives,extraCounts:mocks.extraCounts}};});
vi.mock('../../../controllers/chatAttachments.controller.js',()=>({downloadSecureChatAttachment:vi.fn()}));
vi.mock('../documentationQueue.service.js',()=>({getMobileDocumentationQueue:vi.fn()}));
vi.mock('../../../services/storage.service.js',()=>({default:{}}));
import {getMobileInbox,patchMobileArchive,getMobileChatContext,getMobileFile} from '../../../controllers/mobileConversa.controller.js';
const request=()=>({quickView:{userId:3,agencyId:2,mobileDeviceSessionId:7},params:{id:'10',kind:'chat',threadId:'10'},query:{},headers:{},body:{archived:true,userId:999}});
const response=()=>({set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();mocks.access.mockResolvedValue(true);mocks.emails.mockResolvedValue([]);mocks.emailCounts.mockResolvedValue([]);mocks.archives.mockResolvedValue(new Map());mocks.extraCounts.mockResolvedValue({threads:{total:0,unread:0,needs:0},mentions:{total:0,unread:0,needs:0},files:{total:0,unread:0,needs:0}});mocks.threads.mockImplementation((req,res)=>res.json([{thread_id:10,thread_type:'client_secure',message_channel:'secure',participants:[{id:5,first_name:'Private',last_name:'Person'}],last_message:{id:50,body:'SENSITIVE MESSAGE',sender_user_id:5,created_at:'2026-11-06T10:00:00Z'},unread_count:1}]));});
it('does not let a legacy Quick View PIN session open the new mobile features',async()=>{for(const handler of [getMobileInbox,patchMobileArchive,getMobileChatContext,getMobileFile]){const req=request();delete req.quickView.mobileDeviceSessionId;const res=response();await handler(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.access).not.toHaveBeenCalled();});
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
