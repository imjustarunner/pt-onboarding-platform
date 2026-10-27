import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientSecureConversation.service.js',()=>({refreshClientSecureAccess:vi.fn()}));
vi.mock('../secureMessageNotify.service.js',()=>({sendSecureMessageNotification:vi.fn()}));
vi.mock('../secureMessageBoundary.service.js',()=>({recordSecureMessageEvent:vi.fn()}));
import {notifySecureThreadParticipants} from '../secureThreadNotifications.service.js';
const input={agencyId:450,threadId:20,clientId:2277,senderUserId:1459,messageId:77};
let d;
beforeEach(()=>{
 d={refresh:vi.fn(),database:{execute:vi.fn(async()=>[[{id:1460,email:'parent-b@example.test'},{id:1433,email:'provider@example.test'}]])},send:vi.fn(async()=>({sent:true})),audit:vi.fn()};
});
it('notifies the other parent and care team after a parent posts, without notifying the sender',async()=>{
 await notifySecureThreadParticipants(input,d);
 expect(d.refresh).toHaveBeenCalledWith(20,1459);
 expect(d.send.mock.calls.map(([v])=>v.recipientUserId)).toEqual([1460,1433]);
 expect(d.send.mock.calls.every(([v])=>v.messageId===77&&v.chatThreadId===20&&v.clientId===2277)).toBe(true);
 expect(d.database.execute).toHaveBeenCalledWith(expect.stringContaining("t.message_channel = 'secure'"),[20,450,2277,1459]);
});
it('also notifies the first parent when the second parent posts',async()=>{
 d.database.execute.mockResolvedValue([[{id:1459,email:'parent-a@example.test'},{id:1460,email:'parent-b@example.test'}]]);
 await notifySecureThreadParticipants({...input,senderUserId:1460},d);
 expect(d.send).toHaveBeenCalledOnce();expect(d.send.mock.calls[0][0].recipientUserId).toBe(1459);
});
it('notifies both parents when the provider posts',async()=>{
 d.database.execute.mockResolvedValue([[{id:1459,email:'parent-a@example.test'},{id:1460,email:'parent-b@example.test'}]]);
 await notifySecureThreadParticipants({...input,senderUserId:1433},d);
 expect(d.send.mock.calls.map(([v])=>v.recipientUserId)).toEqual([1459,1460]);
});
it('continues notifying the other parent if an earlier recipient fails',async()=>{
 d.database.execute.mockResolvedValue([[{id:1433,email:'provider@example.test'},{id:1460,email:'parent-b@example.test'}]]);
 d.send.mockRejectedValueOnce(Error('Transport unavailable'));
 const result=await notifySecureThreadParticipants(input,d);
 expect(result).toEqual([{userId:1433,sent:false,reason:'delivery_failed'},{userId:1460,sent:true,reason:null}]);
 expect(d.audit).toHaveBeenCalledWith({agencyId:450,threadId:20,messageId:77,userId:1433,eventType:'notification_failed'});
 expect(d.send).toHaveBeenCalledTimes(2);
});
it('does not notify anyone when the sender has lost access',async()=>{
 d.refresh.mockRejectedValue(Object.assign(Error('Access revoked'),{status:403}));
 await expect(notifySecureThreadParticipants(input,d)).rejects.toMatchObject({status:403});
 expect(d.database.execute).not.toHaveBeenCalled();expect(d.send).not.toHaveBeenCalled();
});
it('preserves individual notifications when the parents share an email address',async()=>{
 d.database.execute.mockResolvedValue([[{id:1459,email:'shared@example.test'},{id:1460,email:'shared@example.test'}]]);
 await notifySecureThreadParticipants({...input,senderUserId:1433},d);
 expect(d.send.mock.calls.map(([v])=>v.recipientUserId)).toEqual([1459,1460]);
});
