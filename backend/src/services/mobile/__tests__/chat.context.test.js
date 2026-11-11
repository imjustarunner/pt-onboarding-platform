import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:db,onTableWrite:vi.fn()}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../../clientSecureConversation.service.js',()=>({refreshClientSecureAccess:vi.fn(),ensureClientSecureConversation:vi.fn(),resolveClientForSecureRecipients:vi.fn()}));
vi.mock('../../secureMessageBoundary.service.js',()=>({recordSecureThreadOpen:vi.fn(async()=> 'secure'),recordSecureMessageEvent:vi.fn(),defaultChatChannel:vi.fn()}));
vi.mock('../../agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn(async()=>({role:'provider'}))}));
import {listMessages} from '../../../controllers/chat.controller.js';
const root={id:77,thread_id:55,parent_message_id:null,sender_user_id:2,sender_first_name:'Jordan',body:'ORIGINAL CONTEXT',created_at:'2026-11-06T12:00:00Z'};
const reply={id:88,thread_id:55,parent_message_id:77,sender_user_id:1,sender_first_name:'Taylor',body:'EXACT NOTIFICATION REPLY',created_at:'2026-11-06T12:30:00Z'};
let parentAvailable, audienceAllowed;
beforeEach(()=>{vi.clearAllMocks();parentAvailable=true;audienceAllowed=true;db.execute.mockImplementation(async sql=>{
 if(sql.includes("column_name = 'parent_message_id'"))return [[{present:1}]];
 if(sql.includes('SELECT id,thread_id FROM chat_messages WHERE id=?'))return [parentAvailable?[{id:root.id,thread_id:root.thread_id}]:[]];
 if(sql.includes('SELECT m.id FROM chat_messages m'))return [audienceAllowed?[{id:root.id}]:[]];
 if(sql.includes('JOIN users actor'))return [[{allowed:1}]];
 if(sql.includes('WHERE m.id=? AND m.thread_id=?'))return [parentAvailable?[{...root}]:[]];
 if(sql.includes('ORDER BY m.id DESC'))return [[{...reply}]];
 return [[]];
});});
const request=()=>({user:{id:1,role:'provider'},quickView:{userId:1,agencyId:10,mobileDeviceSessionId:9},params:{threadId:'55'},query:{parentMessageId:'77',beforeId:'89'}});
const response=()=>({set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()});
it('includes the original message when a notification opens a reply with an exact history cursor',async()=>{
 const res=response(),next=vi.fn();await listMessages(request(),res,next);expect(next).not.toHaveBeenCalled();const body=res.json.mock.calls[0][0];expect(body.messages.map(message=>message.id)).toEqual([77,88]);expect(body.messages[0].body).toBe('ORIGINAL CONTEXT');expect(body.messages[1].body).toBe('EXACT NOTIFICATION REPLY');
});
it('does not return orphaned reply content if the original message is unavailable to the viewer',async()=>{
 parentAvailable=false;const res=response(),next=vi.fn();await listMessages(request(),res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(JSON.stringify(res.json.mock.calls)).not.toContain('EXACT NOTIFICATION REPLY');
});

it('rejects a quoted original outside the historical audience even with current thread membership',async()=>{
 audienceAllowed=false;const res=response(),next=vi.fn();await listMessages(request(),res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404,code:'SECURE_MESSAGE_NOT_AVAILABLE'}));expect(JSON.stringify(res.json.mock.calls)).not.toContain('ORIGINAL CONTEXT');expect(db.execute.mock.calls.some(([sql])=>sql.includes('ORDER BY m.id DESC'))).toBe(false);
});
