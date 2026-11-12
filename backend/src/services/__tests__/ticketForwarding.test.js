import test from 'node:test';import assert from 'node:assert/strict';import pool from '../../config/database.js';
import {forwardTicketToProviderInboxes} from '../ticketForwarding.service.js';import {decryptTicketMessageRow} from '../../utils/supportTicketCrypto.js';
test.after(()=>pool.end());
function fixture({actorRole='support',owner=5,mailboxFailure=false,candidates=[{id:8,first_name:'Pat',last_name:'Provider'}]}={}){
 const events=[],notifications=[],messages=[];let saved,conversations=0;
 const db={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release(){},async execute(sql,args=[]){
  assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);events.push(sql);
  if(sql.startsWith('SELECT * FROM support_tickets'))return [[{id:1,agency_id:2,source_channel:'public_web',question:'Original inquiry',subject:'Website inquiry',source_email_from:'visitor@example.org',claimed_by_user_id:owner,status:'open'}]];
  if(sql.startsWith('SELECT metadata FROM user_activity_log'))return [saved?[{metadata:JSON.stringify(saved)}]:[]];
  if(sql.startsWith('SELECT u.id,u.role'))return [['admin','super_admin','support'].includes(actorRole) ? [{id:5,role:actorRole,first_name:'Sam',last_name:'Support',work_email:'sam@agency.test'}] : []];
  if(sql.startsWith('SELECT u.id FROM users'))return [[{id:8}]];
  if(sql.startsWith('SELECT a.file_name'))return [[]];
  if(sql.startsWith('INSERT INTO support_ticket_messages')){messages.push(args);return [{insertId:40}];}
  if(sql.startsWith('INSERT INTO communication_conversations'))return [{insertId:++conversations+100}];
  if(sql.startsWith('INSERT INTO user_activity_log')){saved=JSON.parse(args[2]);return [{insertId:80}];}
  return [{affectedRows:1}];
 }};
 return {events,notifications,messages,get conversations(){return conversations;},dependencies:{database:{getConnection:async()=>db},providerCandidates:async()=>candidates,ensureMailbox:async()=>{if(mailboxFailure)throw Error('Unavailable');return{id:20,from_email:'pat@agency.test'};},notify:async n=>notifications.push(n)}};
}
const input={ticketId:1,actorUserId:5,providerUserIds:[8],note:'Hi Pat, this inquiry came through for you.',requestId:'forward-1'};
test('forwards privately, preserves the support owner, records the handoff and closes only after storage commits',async()=>{
 const key=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,9).toString('base64');
 try{const f=fixture(),result=await forwardTicketToProviderInboxes(input,f.dependencies);
  assert.equal(result.closed,true);assert.equal(f.notifications[0].relatedEntityType,'communication_conversation');assert.equal(f.notifications[0].userId,8);
  const m=f.messages[0];assert.equal(m[2],null);const body=decryptTicketMessageRow({body:m[2],body_ciphertext:m[3],body_iv:m[4],body_auth_tag:m[5],encryption_key_id:m[6]}).body;
  assert.match(body,/Hi Pat/);assert.match(body,/Original inquiry/);assert.match(body,/visitor@example.org/);
  assert.equal(f.events.some(sql=>typeof sql==='string'&&sql.startsWith('UPDATE support_tickets')&&sql.includes('claimed_by_user_id')),false);
  assert.equal(f.events.includes('commit'),true);
  const retry=await forwardTicketToProviderInboxes(input,f.dependencies);assert.equal(retry.duplicate,true);assert.equal(f.conversations,1);assert.equal(f.notifications.length,1);
  await assert.rejects(forwardTicketToProviderInboxes({...input,note:'Different note'},f.dependencies),{status:409});
 }finally{if(key==null)delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=key;}
});
test('unauthorized provider, wrong owner, and missing inbox never close or forward a ticket',async()=>{
 for(const args of [{actorRole:'provider'},{owner:9},{candidates:[]},{mailboxFailure:true}]){
  const f=fixture(args);await assert.rejects(forwardTicketToProviderInboxes(input,f.dependencies));
  assert.equal(f.events.some(sql=>typeof sql==='string'&&sql.startsWith('UPDATE support_tickets')),false);assert.equal(f.notifications.length,0);assert.equal(f.events.includes('rollback'),true);
 }
});
test('the encrypted private forward remains readable to its recipient without making the support note public',async()=>{
 const {default:Conversation}=await import('../../models/CommunicationConversation.model.js');const execute=pool.execute;
 try{
  pool.execute=async sql=>sql.includes('FROM communication_messages')?[[{id:101,conversation_id:20,support_ticket_message_id:40,send_status:'received',auto_reply_kind:'support_ticket_forward',is_internal_note:0,from_json:JSON.stringify({email:'sam@agency.test',originalSenderEmail:'visitor@example.org'})}]]:[[{id:40,body:'Private introduction and original inquiry',is_internal:1}]];
  const message=await Conversation.findMessageById(101);assert.equal(message.body_text,'Private introduction and original inquiry');assert.equal(message.is_internal_note,false);assert.equal(message.from.originalSenderEmail,'visitor@example.org');
 }finally{pool.execute=execute;}
});
