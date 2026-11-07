import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {hasMobileThreadActivity,mobileMessagePreview,mobileThreadItem} from '../conversa.service.js';
const thread={thread_id:10,thread_type:'direct',message_channel:'internal',participants:[{id:2,first_name:'Avery',last_name:'Example',profile_photo_url:'photos/avery.png'}],updated_at:'2026-11-07T12:00:00Z',last_message:{id:70,body:' Latest\n update ',sender_user_id:2,created_at:'2026-11-06T12:00:00Z'}};
it('uses the actual message timestamp, participant and bounded preview instead of membership updates',()=>{
 expect(mobileThreadItem(thread,1)).toMatchObject({title:'Avery Example',sender:'Avery Example',preview:'Latest update',at:'2026-11-06T12:00:00Z',avatar:'photos/avery.png'});
 expect(mobileMessagePreview('a'.repeat(600))).toHaveLength(240);
 expect(hasMobileThreadActivity(thread)).toBe(true);
 const empty={...thread,last_message:null};expect(hasMobileThreadActivity(empty)).toBe(false);expect(mobileThreadItem(empty,1).at).toBeNull();
});
it('describes attachment-only and unavailable text without exposing encrypted field objects',()=>{
 expect(mobileThreadItem({...thread,last_message:{...thread.last_message,body:' ',attachment_count:2}},1).preview).toBe('2 attachments · open to view');
 expect(mobileMessagePreview(null,1)).toBe('Attachment · open to view');
 expect(mobileMessagePreview({ciphertext:'PRIVATE-CIPHERTEXT'})).toBe('Message · open to read');
 expect(mobileMessagePreview('Message unavailable')).toBe('Message unavailable');
 expect(mobileMessagePreview('<style>.hidden{display:none}</style><script>private()</script><p>Hello</p>')).toBe('Hello');
});
it('retains secure masking even for attachment-only messages and preserves no sensitive extra fields',()=>{
 const item=mobileThreadItem({...thread,message_channel:'secure',last_message:{...thread.last_message,body:'PRIVATE BODY',attachment_count:2,filename:'PRIVATE NAME.pdf',body_ciphertext:'CIPHER'}},1);
 expect(item).toMatchObject({title:'Av••• Ex•••',preview:'Secure message · tap to unlock',avatar:null});
 expect(JSON.stringify(item)).not.toMatch(/PRIVATE|CIPHER|photos\/avery|Avery Example/);
});
it('uses an available participant email when names are missing and avoids a blank direct title',()=>{
 const unnamed={...thread,participants:[{id:2,email:'avery@example.test'}]};expect(mobileThreadItem(unnamed,1)).toMatchObject({title:'avery@example.test',sender:'avery@example.test'});
 expect(mobileThreadItem({...thread,participants:[]},1).title).toBe('Direct conversation');
});
