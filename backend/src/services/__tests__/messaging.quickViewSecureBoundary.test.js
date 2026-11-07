import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ role: 'provider' })) } }));
vi.mock('../../controllers/chat.controller.js', () => ({ assertThreadAccess: vi.fn(), listMyThreads: vi.fn(), listMessages: vi.fn(), sendMessage: vi.fn(), markRead: vi.fn(), listThreadsInbox: vi.fn(), listMentionsInbox: vi.fn(), listFilesInbox: vi.fn(), createOrGetDirectThread: vi.fn() }));
vi.mock('../../controllers/chatAttachments.controller.js', () => ({ uploadChatAttachment: vi.fn() }));
vi.mock('../../controllers/chatReactions.controller.js', () => ({ addReaction: vi.fn(), removeReaction: vi.fn() }));
import pool from '../../config/database.js';
import { assertThreadAccess, listMessages, sendMessage, listMyThreads, createOrGetDirectThread } from '../../controllers/chat.controller.js';
import { qvListChatMessages, qvSendChatMessage, qvMarkChatRead, qvUploadChatAttachment, qvAddChatReaction, qvRemoveChatReaction, qvListChatThreads, qvCreateDirectThread, getQuickDirectory } from '../../controllers/quickViewSurfaces.controller.js';
const req = () => ({ quickView: { userId: 3, agencyId: 2 }, query: {}, headers: {}, params: { threadId: 5 }, body: {} });
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[{ message_channel: 'secure' }]]); });
it('requires the secure workspace before reading, sending, marking read, or uploading', async () => {
  for (const handler of [qvListChatMessages, qvSendChatMessage, qvMarkChatRead, qvUploadChatAttachment]) {
    const response = res(), next = vi.fn(); await handler(req(), response, next);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json.mock.calls[0][0].error.code).toBe('SECURE_WORKSPACE_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  }
  expect(listMessages).not.toHaveBeenCalled(); expect(sendMessage).not.toHaveBeenCalled();
});
it('checks the owning conversation when the request addresses a message directly', async () => {
  for (const handler of [qvAddChatReaction, qvRemoveChatReaction]) {
    const request = req(); request.params = { messageId: 7, code: 'heart' }; const response = res();
    await handler(request, response, vi.fn()); expect(response.status).toHaveBeenCalledWith(409);
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining('m.thread_id = t.id'), [7]);
  }
});
it('continues to use the shared chat handler for internal conversations', async () => {
  pool.execute.mockResolvedValue([[{ message_channel: 'internal' }]]);
  const request = req(), response = res(), next = vi.fn();
  await qvListChatMessages(request, response, next);
  expect(listMessages).toHaveBeenCalledWith(request, response, next);
  expect(response.status).not.toHaveBeenCalled();
});

it('uses the shared secure audience checks for a primary mobile sign-in',async()=>{
 const request=req();request.quickView.mobileDeviceSessionId=9;const response=res(),next=vi.fn();
 await qvListChatMessages(request,response,next);expect(assertThreadAccess).toHaveBeenCalledWith(3,5,{requireActiveAgency:true});expect(listMessages).toHaveBeenCalledWith(request,response,next);expect(response.status).not.toHaveBeenCalled();
});
const qaReq=()=>({...req(),quickView:{userId:1433,agencyId:450,mobileDeviceSessionId:9,qaAgencyIds:[450]}});
it('pins QA list queries to450 even for all and rejects explicit other-tenant selection',async()=>{
 const request=qaReq();request.query.agencyId='all';const next=vi.fn();await qvListChatThreads(request,res(),next);expect(next).not.toHaveBeenCalled();expect(listMyThreads.mock.calls[0][0].query.agencyId).toBe('450');
 listMyThreads.mockClear();request.query.agencyId='456';await qvListChatThreads(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(listMyThreads).not.toHaveBeenCalled();
});
it('denies an otherwise-member QA thread from456 before dispatching message or state handlers',async()=>{
 pool.execute.mockImplementation(async sql=>[[sql.startsWith('SELECT t.id,t.agency_id')?{id:5,agency_id:456,message_channel:'internal'}:{mobile_thread_id:5,message_channel:'internal'}]]);
 for(const handler of [qvListChatMessages,qvSendChatMessage,qvMarkChatRead]){const next=vi.fn();await handler(qaReq(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));}
 expect(listMessages).not.toHaveBeenCalled();expect(sendMessage).not.toHaveBeenCalled();expect(assertThreadAccess).not.toHaveBeenCalled();
});
it('restricts direct creation and directory results to existing approved synthetic staff in450',async()=>{
 const approved={id:1440,email:'qa.provider.supervisor.auricwell@example.com',first_name:'Supervisor',role:'provider',is_demo:1,is_active:1,is_archived:0};
 pool.execute.mockResolvedValue([[approved]]);const request=qaReq();request.body={otherUserId:1440};const next=vi.fn();await qvCreateDirectThread(request,res(),next);expect(next).not.toHaveBeenCalled();expect(createOrGetDirectThread).toHaveBeenCalledTimes(1);expect(request.body.agencyId).toBe(450);
 createOrGetDirectThread.mockClear();pool.execute.mockResolvedValue([[{...approved,is_demo:0}]]);await qvCreateDirectThread(qaReq(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(createOrGetDirectThread).not.toHaveBeenCalled();
 pool.execute.mockResolvedValue([[approved,{...approved,id:99,email:'live@example.com',is_demo:0}]]);const response=res();await getQuickDirectory(qaReq(),response,vi.fn());expect(response.json.mock.calls[0][0].providers.map(row=>row.id)).toEqual([1440]);expect(response.json.mock.calls[0][0].schoolStaff).toEqual([]);
});
