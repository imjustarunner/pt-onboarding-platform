import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebsiteChatService,localWebsiteVisitor,validChatMessageId,websiteQuickReplies} from '../publicWebsiteChat.service.js';
import {itscoWebsiteRouting} from '../publicWebsiteTicketRouting.service.js';
const site={slug:'itsco',name:'ITSCO',website_url:'https://www.itsco.health',support_agency_id:2,chat_enabled:1};
test('unknown and non-Colorado regions do not trigger chat',()=>{assert.equal(localWebsiteVisitor('USCO'),true);for(const r of ['',null,'USCA','Colorado','US'])assert.equal(localWebsiteVisitor(r),false);});
test('ITSCO topics route to the requested staff and billing category',()=>{assert.deepEqual(itscoWebsiteRouting('Insurance and billing'),{firstName:'Hannah',lastName:'Inyart',topic:'billing'});assert.equal(itscoWebsiteRouting('School partnership').firstName,'Rachel');assert.equal(itscoWebsiteRouting('careers').firstName,'Rachel');assert.equal(itscoWebsiteRouting('Website help').firstName,'Michael');assert.equal(itscoWebsiteRouting('Finding a provider'),null);});
test('quick replies use public website enrollment, not app login',()=>{assert.match(websiteQuickReplies(site)[1].body,/https:\/\/www.itsco.health\/join\/itsco\/counseling/);assert.match(websiteQuickReplies({...site,slug:'kimi',website_url:'https://kimicain.com'})[1].body,/kimi-coaching-inquiry/);});
test('valid message ids support idempotent retries',()=>{assert.equal(validChatMessageId('a93fb9bb-0a3f-4a11-a124-fcb5e6f99901'),true);assert.equal(validChatMessageId('1 OR 1=1'),false);});
function dbFor(role,agencyIds){return {execute:async(sql)=>sql.includes('FROM users')?[[{id:7,role}]]:[agencyIds.map(agency_id=>({agency_id}))]};}
test('staff cannot open another agency website chat',async()=>{const service=createWebsiteChatService(dbFor('support',[6]),async()=>site);await assert.rejects(()=>service.authorize({id:7},'itsco'),e=>e.status===403);});
test('agency staff and central management support can open their scoped chats',async()=>{for(const agencies of [[2],[1]]){const service=createWebsiteChatService(dbFor('support',agencies),async()=>site);assert.equal((await service.authorize({id:7},'itsco')).slug,'itsco');}});
test('providers cannot access website support messages even with membership',async()=>{const service=createWebsiteChatService(dbFor('provider',[2]),async()=>site);await assert.rejects(()=>service.authorize({id:7},'itsco'),e=>e.status===403);});
test('anonymous users cannot access staff chat APIs',async()=>{const service=createWebsiteChatService(dbFor('super_admin',[1]),async()=>site);await assert.rejects(()=>service.queue(null),e=>e.status===401);});
test('visitor session lookup binds the token to both site and session',async()=>{let captured;const db={execute:async(sql,params)=>{captured={sql,params};return [[]];}};const service=createWebsiteChatService(db,async()=>site);await assert.rejects(()=>service.read('nlu','session-id','a'.repeat(64)),e=>e.status===404);assert.match(captured.sql,/id=\? AND site_slug=\? AND token_hash=\?/);assert.deepEqual(captured.params.slice(0,2),['session-id','nlu']);assert.notEqual(captured.params[2],'a'.repeat(64));});

test('website replies never borrow another agency sender',async()=>{
 const {sendWebsiteTicketReply}=await import('../publicWebsiteTicketReply.service.js');
 const looked=[];let sent=false;const result=await sendWebsiteTicketReply({source_channel:'public_web',source_email_from:'test@example.com',agency_id:6},'Test',{identities:{findByAgencyAndIdentityKey:async(id,key)=>{looked.push(id);return null;}},send:async()=>{sent=true;}});
 assert.deepEqual([...new Set(looked)],[6]);assert.equal(sent,false);assert.equal(result.sent,false);
});
test('manual website reply reports delivery without exposing ticket metadata in the email',async()=>{
 const {sendWebsiteTicketReply}=await import('../publicWebsiteTicketReply.service.js');let mail;
 const result=await sendWebsiteTicketReply({id:3,subject:'Question',question:'Original private text',source_channel:'public_web',source_email_from:'test@example.com',agency_id:2},'A staff reply',{identities:{findByAgencyAndIdentityKey:async()=>({id:5})},send:async args=>{mail=args;return {skipped:false};}});
 assert.equal(result.sent,true);assert.equal(mail.text,'A staff reply');assert.equal(mail.senderIdentityId,5);assert.equal(mail.source,'manual');
});
