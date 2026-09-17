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
 assert.equal(result.sent,true);assert.match(mail.text,/^A staff reply/);assert.match(mail.text,/community-standards/);assert.doesNotMatch(mail.text,/Original private text/);assert.equal(mail.senderIdentityId,5);assert.equal(mail.source,'manual');
});

import {moderateWebsiteChat,websitePagePath} from '../../utils/websiteChatPolicy.js';
import {decryptChatText} from '../chatEncryption.service.js';
test('profanity is masked without changing emoji or ordinary words',()=>{assert.deepEqual(moderateWebsiteChat('Your class is fantastic 👍'),{body:'Your class is fantastic 👍',filtered:false});assert.deepEqual(moderateWebsiteChat('This is FUCKING bullshit!'),{body:'This is **** ****!',filtered:true});});
test('page presence excludes query strings and fragments',()=>{assert.equal(websitePagePath('/services?email=private@example.com#details'),'/services');assert.equal(websitePagePath('https://external.example/a'),'/');assert.equal(websitePagePath('//external.example'),'/');});
function sessionDb(overrides={}){
 const state={id:'chat',site_slug:'itsco',state:'open',initiated_at:null,claimed_by:null,...overrides};
 const calls=[],stored=[];let lock=Promise.resolve();
 const execute=async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('FROM users WHERE'))return [[{id:7,role:'support'}]];
  if(sql.includes('FROM user_agencies WHERE'))return [[{agency_id:2}]];
  if(sql.includes('FROM public_website_chat_sessions WHERE'))return [[{...state}]];
  if(sql.includes('SELECT id FROM public_website_chat_messages'))return [[]];
  if(sql.includes('COUNT(*) n'))return [[{n:stored.length,recent:0}]];
  if(sql.includes('COUNT(*) viewing'))return [[{viewing:0,typing:0}]];
  if(sql.includes('SELECT member_number,viewing_at'))return [[{member_number:1,viewing_at:new Date()}]];
  if(sql.includes('INSERT INTO public_website_chat_messages')){stored.push({sender:args[1],encrypted:JSON.parse(args.at(-1))});return [{insertId:stored.length}];}
  if(sql.includes('SET claimed_by=?'))state.claimed_by=args[0];
  if(sql.includes('SET standards_flagged_at='))state.standards_flagged_at=new Date();
  if(sql.includes('SET claimed_by=IF')){if(state.claimed_by===args[0])state.claimed_by=null;}
  if(sql.includes("SET state='open',initiated_at")){state.state='open';if(args[0]==='staff')state.initiated_at=new Date();}
  if(sql.includes('SELECT website_url'))return [[{website_url:site.website_url}]];
  return [[]];
 };
 return {state,calls,stored,execute,getConnection:async()=>{let unlock;return {execute,beginTransaction:async()=>{const previous=lock;lock=new Promise(r=>{unlock=r;});await previous;},commit:async()=>unlock?.(),rollback:async()=>unlock?.(),release:()=>{}};}};
}
const payload={body:'Hello 😊',clientMessageId:'a93fb9bb-0a3f-4a11-a124-fcb5e6f99901'};
test('visitor cannot initiate even by calling the API directly',async()=>{const db=sessionDb(),service=createWebsiteChatService(db,async()=>site);await assert.rejects(()=>service.visitorSend('itsco','chat','a'.repeat(64),payload),e=>e.status===409);assert.equal(db.stored.length,0);assert.ok(db.calls.some(c=>c.sql.includes('FOR UPDATE')));});
test('staff invitation unlocks visitor replies and persists encrypted emoji',async()=>{process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,5).toString('base64');const db=sessionDb(),service=createWebsiteChatService(db,async()=>site);await service.staffSend({id:7},'chat',payload);assert.ok(db.state.initiated_at);await service.visitorSend('itsco','chat','a'.repeat(64),payload);assert.equal(db.stored.length,2);assert.equal(decryptChatText(db.stored[1].encrypted),'Hello 😊');});
test('only the claiming support member can reply or take ownership',async()=>{const db=sessionDb({claimed_by:8,initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await assert.rejects(()=>service.staffSend({id:7},'chat',payload),e=>e.status===409);await assert.rejects(()=>service.claim({id:7},'chat'),e=>e.status===409);assert.equal(db.state.claimed_by,8);assert.equal(db.stored.length,0);});
test('close preserves session, releases own claim, and sends a departure notice',async()=>{const db=sessionDb({claimed_by:7,initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await service.close({id:7},'chat');assert.equal(db.state.claimed_by,null);assert.equal(db.state.state,'open');assert.equal(db.stored[0].sender,'system');assert.match(decryptChatText(db.stored[0].encrypted),/Support team member 1 left chat/);assert.ok(!db.calls.some(c=>/DELETE|SET state='closed'/.test(c.sql)));});
test('explicit visitor end prevents staff and visitor replies',async()=>{const db=sessionDb({visitor_ended_at:new Date(),initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await assert.rejects(()=>service.staffSend({id:7},'chat',payload),e=>e.status===409);await assert.rejects(()=>service.visitorSend('itsco','chat','a'.repeat(64),payload),e=>e.status===409);});
test('flagging requires confirmation and emits the standards notice once',async()=>{const db=sessionDb({initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await assert.rejects(()=>service.flag({id:7},'chat',false),e=>e.status===400);assert.equal(db.stored.length,0);await service.flag({id:7},'chat',true);assert.match(decryptChatText(db.stored[0].encrypted),/https:\/\/www.itsco.health\/community-standards/);await service.flag({id:7},'chat',true);assert.equal(db.stored.length,1);});
test('server stores masked text and emits a linked reminder',async()=>{const db=sessionDb({initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await service.visitorSend('itsco','chat','a'.repeat(64),{...payload,body:'This is bullshit'});assert.equal(decryptChatText(db.stored[0].encrypted),'This is ****');assert.match(decryptChatText(db.stored[1].encrypted),/Community Standards/);});
import {resolveChatReferral} from '../websiteChatReferral.service.js';
test('referrals are hashed, site-bound and expire, and clicks are recorded',async()=>{const calls=[];const db={execute:async(sql,args)=>{calls.push({sql,args});return [[{sessionId:'chat',category:'billing',authorUserId:7}]];}};const ref=await resolveChatReferral('itsco','a'.repeat(64),{clicked:true,db});assert.equal(ref.category,'billing');assert.match(calls[0].sql,/s.site_slug=\?/);assert.match(calls[0].sql,/INTERVAL 30 DAY/);assert.equal(calls[0].args[1],'itsco');assert.notEqual(calls[0].args[0],'a'.repeat(64));assert.match(calls[1].sql,/clicked_at/);assert.equal(await resolveChatReferral('itsco','invalid',{db}),null);assert.equal(await resolveChatReferral('nlu','a'.repeat(64),{db:{execute:async()=>[[]]}}),null);});
test('simultaneous claims produce one responsible support member',async()=>{const db=sessionDb({initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);const results=await Promise.allSettled([service.claim({id:7},'chat'),service.claim({id:8},'chat')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.ok([7,8].includes(db.state.claimed_by));});
test('a viewing member closing the chat cannot release someone else’s claim',async()=>{const db=sessionDb({claimed_by:8,initiated_at:new Date()}),service=createWebsiteChatService(db,async()=>site);await service.close({id:7},'chat');assert.equal(db.state.claimed_by,8);});
