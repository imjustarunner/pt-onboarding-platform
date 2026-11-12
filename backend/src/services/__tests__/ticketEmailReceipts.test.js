import test from 'node:test';import assert from 'node:assert/strict';import pool from '../../config/database.js';
import {listTicketEmailReceipts,ticketEmailPreview} from '../ticketEmailReceipts.service.js';test.after(()=>pool.end());
test('shows a legacy website send receipt without claiming it was delivered or opened',async()=>{
 const db={execute:async sql=>sql.includes('FROM support_ticket_email_messages e LEFT')?[[]]:[[{communication_id:8,delivery_status:'sent',recipient_address:'visitor@test.example',metadata:JSON.stringify({fromEmail:'support@agency.test'}),has_preview:1}]]};
 const [receipt]=await listTicketEmailReceipts({id:692,agency_id:2,source_channel:'public_web'},db);
 assert.equal(receipt.send_status,'sent');assert.equal(receipt.delivered_at,undefined);assert.equal(receipt.opened_at,undefined);assert.equal(receipt.from_email,'support@agency.test');assert.equal(receipt.has_preview,true);
});
test('does not expose another receipt body through a ticket the user can read',async()=>{
 let bodyRead=false;const db={execute:async sql=>{if(sql.includes('SELECT subject,body'))bodyRead=true;return [[]];}};
 await assert.rejects(ticketEmailPreview({id:1,agency_id:2,source_channel:'email'},999,db),{status:404});assert.equal(bodyRead,false);
});

test('a draft preview uses authorized branding and cannot enter a send path',async()=>{
 const {previewTicketReply}=await import('../ticketEmailReceipts.service.js');let rendered;
 const dependencies={senderOptions:async()=>[{id:81,fromEmail:'support@innerstrengthin.com',staffDisplayName:'Michael · Inner Strength'}],findIdentity:async()=>({id:81,agency_id:377}),finalize:async input=>{rendered=input;return {html:'<p>Draft</p>',text:'Draft'};}};
 const preview=await previewTicketReply({ticket:{source_email_from:'visitor@example.org'},actorUserId:501,senderIdentityId:81,senderMode:'staff',body:'Draft'},dependencies);
 assert.equal(preview.previewOnly,true);assert.equal(rendered.previewOnly,true);assert.equal(rendered.agencyId,377);assert.equal(preview.fromEmail,'support@innerstrengthin.com');
 await assert.rejects(previewTicketReply({ticket:{},actorUserId:501,senderIdentityId:999,body:'Draft'},dependencies),{status:403});
});
