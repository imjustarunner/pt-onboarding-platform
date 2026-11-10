import {test,after} from 'node:test';import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {emailedPacketClientName,packetFileIsSupported,packetHasOtherRequest} from '../../utils/schoolEmailPacketIntake.shared.js';
import {processSchoolEmailPacket,sendSchoolEmailPacketReceipt} from '../schoolEmailPacketIntake.service.js';
const oldKey=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
after(async()=>{if(oldKey==null)delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=oldKey;await pool.end();});
test('requires an explicit single client name and keeps quoted names/signatures separate',()=>{
 assert.deepEqual(emailedPacketClientName('Referral packet for Jordan Example','Attached.'),{firstName:'Jordan',lastName:'Example'});
 assert.deepEqual(emailedPacketClientName('Referral packet','Client name: Jordan Example\nThanks, Alex'),{firstName:'Jordan',lastName:'Example'});
 assert.equal(emailedPacketClientName('Referral Packet','Attached.'),null);
 assert.equal(emailedPacketClientName('Referral packet','Thanks!\nOn Tue Someone wrote:\nClient name: Jordan Example'),null);
 assert.equal(emailedPacketClientName('Referral packet','Client name: Jordan Example\nStudent name: Taylor Example'),null);
 assert.equal(emailedPacketClientName('Packet for Jordan Example and Taylor Example','Attached.'),null);
 assert.equal(emailedPacketClientName('Packet for Jordan Example, Taylor Example','Attached.'),null);
});
test('validates actual file bytes and keeps a separate portal problem actionable',()=>{
 assert.equal(packetFileIsSupported(Buffer.from('%PDF-1.7'),'application/pdf'),true);
 assert.equal(packetFileIsSupported(Buffer.from('not a pdf'),'application/pdf'),false);
 assert.equal(packetHasOtherRequest('Attached packet for Jordan Example. The portal will not let me sign in.'),true);
 assert.equal(packetHasOtherRequest('Attached packet for Jordan Example.'),false);
});
function fixture(){
 let receipt;const calls={upload:0,submit:0,send:0};
 const input={agencyId:2,ticketId:10,sourceMessageId:20,fromEmail:'staff@example.test',subject:'Referral packet for Jordan Example',bodyText:'Attached packet for Jordan Example.',receivedAt:'2026-11-10T15:00:00Z',messageId:'<source@example.test>',recipients:['school@itsco.health']};
 const db={getConnection:async()=>conn,execute:async(sql,args=[])=>{
  assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);
  if(sql.startsWith('SELECT feature_flags'))return [[{feature_flags:{schoolEmailPacketIntakeEnabled:true,schoolEmailPacketIntakeEnabledAt:'2026-11-10T14:00:00Z'}}]];
  if(sql.includes('FROM school_profiles'))return [[{email:'school@itsco.health'}]];
  if(sql.startsWith('SELECT * FROM support_tickets'))return [[{id:10,agency_id:2,school_organization_id:30,source_channel:'email'}]];
  throw Error(sql);
 }};
 const conn={release(){},execute:async(sql,args=[])=>{
  assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('INSERT IGNORE')){receipt||={id:1,ticket_id:10,source_message_id:20,status:'pending',ack_status:'pending'};return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM school_email_packet_receipts'))return [[receipt]];
  if(sql.includes('FROM support_ticket_action_items'))return [[]];
  if(sql.includes("status='upload_started'")){receipt.status='upload_started';return [{affectedRows:1}];}
  if(sql.includes('SET referral_draft_id=')){Object.assign(receipt,{referral_draft_id:args[0],phi_document_id:args[1],processing_task_id:args[2],status:'uploaded'});return [{affectedRows:1}];}
  if(sql.includes('SET client_id=')){receipt.client_id=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE support_tickets')||sql.includes('SET error_code='))return [{affectedRows:1}];
  throw Error(sql);
 }};
 const dependencies={database:db,lookupStaff:async()=>({id:9,school_id:30,school_slug:'example',role:'school_staff'}),listAttachments:async()=>[{id:40,support_ticket_message_id:20,mime_type:'application/pdf',file_name:'packet.pdf'}],readAttachment:async()=>Buffer.from('%PDF-1.7'),upload:async()=>{calls.upload++;return {draftId:50,phiDocumentId:60,taskId:70,user:{id:9,role:'school_staff'}};},submit:async()=>{calls.submit++;return {clientId:80};},sendReceipt:async()=>{calls.send++;receipt.ack_status='sent';return {sent:true};}};
 return {input,dependencies,calls,receipt:()=>receipt};
}
test('one normal upload, processing task and acknowledgement survive an intake retry',async()=>{const f=fixture();const a=await processSchoolEmailPacket(f.input,f.dependencies);const b=await processSchoolEmailPacket(f.input,f.dependencies);assert.equal(a.uploaded,true);assert.equal(a.ackSent,true);assert.equal(a.needsReply,false);assert.equal(b.ackSent,true);assert.deepEqual(f.calls,{upload:1,submit:1,send:1});});
test('a repeated file in another message never creates another child or acknowledgement',async()=>{const f=fixture();await processSchoolEmailPacket(f.input,f.dependencies);f.dependencies.listAttachments=async()=>[{id:41,support_ticket_message_id:21,mime_type:'application/pdf',file_name:'packet.pdf'}];const result=await processSchoolEmailPacket({...f.input,sourceMessageId:21},f.dependencies);assert.equal(result.duplicate,true);assert.equal(result.ackSent,true);assert.deepEqual(f.calls,{upload:1,submit:1,send:1});});
test('unknown senders, multiple files and files from earlier messages stay for human review',async()=>{for(const kind of ['unknown','multiple','earlier']){const f=fixture();if(kind==='unknown')f.dependencies.lookupStaff=async()=>null;else f.dependencies.listAttachments=async()=>kind==='multiple'?[{id:1,mime_type:'application/pdf',support_ticket_message_id:20},{id:2,mime_type:'application/pdf',support_ticket_message_id:20}]:[{id:1,mime_type:'application/pdf',support_ticket_message_id:19}];assert.equal((await processSchoolEmailPacket(f.input,f.dependencies)).handled,false);assert.equal(f.calls.upload,0);assert.equal(f.calls.send,0);}});
test('an upload with an uncertain result never claims success or uploads again on retry',async()=>{const f=fixture();f.dependencies.upload=async()=>{f.calls.upload++;throw Error('storage interrupted');};await assert.rejects(processSchoolEmailPacket(f.input,f.dependencies));const retry=await processSchoolEmailPacket(f.input,f.dependencies);assert.equal(retry.reason,'packet_upload_outcome_needs_review');assert.equal(f.calls.upload,1);assert.equal(f.calls.send,0);});
test('existing-client ambiguity preserves the uploaded packet for review without forcing a match',async()=>{const f=fixture();f.dependencies.submit=async()=>({needsReview:true,reason:'packet_client_match_review'});const result=await processSchoolEmailPacket(f.input,f.dependencies);assert.equal(result.uploaded,true);assert.equal(result.clientId,undefined);assert.equal(f.calls.send,1);});
test('upload confirmation does not suppress a separate login/support request',async()=>{const f=fixture();const result=await processSchoolEmailPacket({...f.input,bodyText:'Packet for Jordan Example. I cannot log in to the portal.'},f.dependencies);assert.equal(result.ackSent,true);assert.equal(result.needsReply,true);});
test('files predating activation are never backfilled automatically',async()=>{const f=fixture();const result=await processSchoolEmailPacket({...f.input,receivedAt:'2026-11-01T00:00:00Z'},f.dependencies);assert.equal(result.handled,false);assert.equal(f.calls.upload,0);});
test('unrelated receiving departments never trigger automatic packet intake',async()=>{const f=fixture();const result=await processSchoolEmailPacket({...f.input,recipients:['billing@itsco.health']},f.dependencies);assert.equal(result.reason,'packet_recipient_needs_review');assert.equal(f.calls.upload,0);assert.equal(f.calls.send,0);});
test('a missing timestamp never grants permission to backfill an email',async()=>{const f=fixture();const result=await processSchoolEmailPacket({...f.input,receivedAt:undefined},f.dependencies);assert.equal(result.handled,false);assert.equal(f.calls.upload,0);});
test('receipt uses Schools for school-group mail and retains durable history without claiming ownership',async()=>{
 let sentPayload,claimed=false;const updates=[];
 const db={getConnection:async()=>conn,execute:async(sql,args=[])=>{assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);updates.push(sql);if(sql.startsWith('SELECT * FROM email_sender_identities'))return [[{id:12,from_email:'schools@itsco.health',display_name:'Schools'},{id:11,from_email:'support@itsco.health',display_name:'Support'}]];if(sql.includes('FROM school_profiles'))return [[{email:'example@itsco.health'}]];return [{affectedRows:1}];}};
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args=[])=>{assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);if(sql.includes("SET ack_status='sending'")){if(claimed)return [{affectedRows:0}];claimed=true;return [{affectedRows:1}];}return [{insertId:44,affectedRows:1}];}};
 const result=await sendSchoolEmailPacketReceipt({receipt:{id:1,agency_id:2,school_organization_id:30,status:'uploaded'},ticket:{id:10},source:{sourceMessageId:20,fromEmail:'staff@example.test',subject:'Packet',messageId:'<source@example.test>',recipients:['example@itsco.health']},database:db},{send:async payload=>{sentPayload=payload;return {id:'gmail-proof',communicationId:7};},review:{captureSentReview:async()=>{}}});
 assert.equal(result.sent,true);assert.equal(sentPayload.senderIdentityId,12);assert.equal(sentPayload.generatedByUserId,null);assert.equal(sentPayload.fromDisplayNameOverride,'Schools');assert.match(sentPayload.text,/uploaded.*intake queue for review/);assert.doesNotMatch(sentPayload.text,/assigned|approved|ready for scheduling|ticket/i);assert.equal(updates.some(sql=>sql.includes('claimed_by_user_id')),false);
});
