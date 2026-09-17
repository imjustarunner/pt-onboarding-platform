import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import pool from '../config/database.js';
import config from '../config/config.js';
import {getPublicWebsiteIdentity} from './publicWebsiteIdentity.service.js';
import {encryptChatText,decryptChatText,isChatEncryptionConfigured} from './chatEncryption.service.js';
import {moderateWebsiteChat,websitePagePath,standardsNotice} from '../utils/websiteChatPolicy.js';
import {PUBLIC_SUPPORT_CATEGORIES} from './publicAgencySupport.service.js';
import {verifyRecaptchaV3} from './captcha.service.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=token=>createHash('sha256').update(String(token||'')).digest('hex');
const roles=['admin','support','super_admin'];
export const localWebsiteVisitor=(region,expected='USCO')=>String(region||'').trim().toUpperCase()===expected;
export const validChatMessageId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
export function websiteQuickReplies(site) {
 const root=site.website_url;
 const join=site.slug==='kimi'?`${root}/intake/kimi-coaching-inquiry`:['itsco','nlu','tisi'].includes(site.slug)?`${root}/join/${site.slug}/counseling`:`${root}/contact`;
 return [
  {label:'Welcome',body:`Hi! Thanks for visiting ${site.name}. How can we help you today?`},
  {label:'Get started',body:`You can get started here: ${join} . We’re happy to help with questions along the way.`},
  ...(site.slug==='nlu'?[{label:'Tutoring enrollment',body:`For tutoring and learning services, start here: ${root}/join/nlu/learning?program=tutoring`}]:[]),
  {label:'Find support',body:`Tell us what kind of support you’re looking for. Please do not share protected health information in Live Chat.`},
  {label:'Follow up',body:`If you need to leave, please use our contact form at ${root}/contact so our team has your email for follow-up.`}
 ];
}
export function createWebsiteChatService(db=pool,identity=getPublicWebsiteIdentity) {
 async function site(slug){const s=await identity(slug);if(!s||!s.chat_enabled||s.coming_soon)throw fail('Live Chat unavailable',404);return s;}
 async function actor(user){
  if(!user?.id||user.demoMode)throw fail('Sign in required',401);
  const [rows]=await db.execute(`SELECT id,role FROM users WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0 AND UPPER(status) IN ('ACTIVE','ACTIVE_EMPLOYEE')`,[user.id]);
  if(!roles.includes(String(rows[0]?.role||'').toLowerCase()))throw fail('Support access required',403);
  const [members]=await db.execute("SELECT agency_id FROM user_agencies WHERE user_id=? AND COALESCE(is_active,1)=1 AND COALESCE(NULLIF(agency_role,''),?) IN ('admin','support','super_admin')",[user.id,rows[0].role]);
  return {id:user.id,global:rows[0].role==='super_admin',agencies:members.map(r=>Number(r.agency_id))};
 }
 async function authorize(user,slug){const a=await actor(user),s=await site(slug);if(!a.global&&!a.agencies.includes(1)&&!a.agencies.includes(Number(s.support_agency_id)))throw fail('Website not in your support scope',403);return s;}
 async function online(s){const [rows]=await db.execute(`SELECT 1 FROM public_website_chat_staff c JOIN users u ON u.id=c.user_id
 JOIN user_presence p ON p.user_id=u.id LEFT JOIN user_presence_status ps ON ps.user_id=u.id
 WHERE c.last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND AND p.last_heartbeat_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND
 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_active,1)=1 AND u.role IN ('admin','support','super_admin')
 AND COALESCE(ps.status,'in_available') IN ('in_available','in_available_for_phone')
 AND (u.role='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND COALESCE(ua.is_active,1)=1 AND ua.agency_id IN (1,?) AND COALESCE(NULLIF(ua.agency_role,''),u.role) IN ('admin','support','super_admin'))) LIMIT 1`,[s.support_agency_id]);return rows.length>0;}
 async function publicConfig(slug,region){const s=await site(slug);return {eligible:localWebsiteVisitor(region,s.local_region)&&isChatEncryptionConfigured(),online:await online(s),site:{slug:s.slug,name:s.name,logoUrl:s.logoUrl,color:s.accent_color},captchaSiteKey:config.recaptcha?.siteKey||null};}
 async function start(slug,{region,ip,captchaToken,honeypot,userAgent}){
  const s=await site(slug);if(honeypot||!localWebsiteVisitor(region,s.local_region)||!await online(s))throw fail('Live chat is unavailable. Please use the contact form.',409);
  if(!isChatEncryptionConfigured())throw fail('Live chat is temporarily unavailable',503);
  const verification=await verifyRecaptchaV3({token:String(captchaToken||''),expectedAction:'public_website_chat',remoteip:ip,userAgent});
  if(!verification.ok||(verification.score!=null&&verification.score<Number(config.recaptcha?.minScore||.3)))throw fail('Human verification failed. Please use the contact form.',400);
  const ipHash=createHmac('sha256',config.jwt.secret).update(`${new Date().toISOString().slice(0,10)}:${ip}`).digest('hex');
  // Database limit survives Cloud Run replicas. No raw IP or precise location is stored.
  const [count]=await db.execute('SELECT COUNT(*) n FROM public_website_chat_sessions WHERE ip_hash=? AND created_at>UTC_TIMESTAMP()-INTERVAL 1 DAY',[ipHash]);
  if(Number(count[0].n)>=20)throw fail('Please use the contact form for more help today.',429);
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await db.execute(`INSERT INTO public_website_chat_sessions(id,site_slug,token_hash,ip_hash,last_seen_at,created_at,expires_at) VALUES(?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 2 HOUR)`,[id,s.slug,hash(token),ipHash]);

  return {id,token};
 }
 async function session(slug,id,token){if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw fail('Chat session unavailable',404);
  const [rows]=await db.execute(`SELECT * FROM public_website_chat_sessions WHERE id=? AND site_slug=? AND token_hash=? AND expires_at>UTC_TIMESTAMP()`,[id,slug,hash(token)]);if(!rows[0])throw fail('Chat session expired. Please use the contact form.',404);return rows[0];}
 async function messages(id){
  const [rows]=await db.execute(`SELECT m.id,m.sender,m.encrypted_json,m.created_at,p.member_number FROM public_website_chat_messages m
   LEFT JOIN public_website_chat_participants p ON p.session_id=m.session_id AND p.user_id=m.author_user_id WHERE m.session_id=? ORDER BY m.id DESC LIMIT 500`,[id]);
  return rows.reverse().map(r=>({id:r.id,sender:r.sender,memberNumber:r.member_number,createdAt:r.created_at,body:decryptChatText(typeof r.encrypted_json==='string'?JSON.parse(r.encrypted_json):r.encrypted_json)}));
 }
 async function event(connection,id,body){await connection.execute('INSERT INTO public_website_chat_messages(session_id,sender,client_message_id,encrypted_json) VALUES(?,?,?,?)',[id,'system',randomUUID(),JSON.stringify(encryptChatText(body))]);}
 async function transaction(id,fn,allowExpired=false){const c=await db.getConnection();try{await c.beginTransaction();const [rows]=await c.execute('SELECT * FROM public_website_chat_sessions WHERE id=? AND (expires_at>UTC_TIMESTAMP() OR ?) FOR UPDATE',[id,allowExpired]);if(!rows[0])throw fail('Chat session expired',404);const result=await fn(c,rows[0]);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
 async function participant(c,id,userId){
  await c.execute(`INSERT IGNORE INTO public_website_chat_participants(session_id,user_id,member_number)
   SELECT ?,?,COALESCE(MAX(member_number),0)+1 FROM public_website_chat_participants WHERE session_id=?`,[id,userId,id]);
 }
 async function read(slug,id,token){const s=await session(slug,id,token);
  const [presence]=await db.execute(`SELECT COUNT(*) viewing,SUM(typing_at>UTC_TIMESTAMP()-INTERVAL 20 SECOND) typing FROM public_website_chat_participants WHERE session_id=? AND viewing_at>UTC_TIMESTAMP()-INTERVAL 30 SECOND`,[id]);
  return {state:s.state,initiated:!!s.initiated_at,ended:!!s.visitor_ended_at,staffViewing:Number(presence[0].viewing)>0,staffTyping:Number(presence[0].typing)>0,standardsFlagged:!!s.standards_flagged_at,messages:await messages(id)};
 }
 async function visitorPresence(slug,id,token,payload={}){await session(slug,id,token);
  const prefix=`/p/${slug}`,rawPath=websitePagePath(payload.pagePath),pagePath=rawPath===prefix?'/':rawPath.startsWith(`${prefix}/`)?rawPath.slice(prefix.length):rawPath;
  await db.execute(`UPDATE public_website_chat_sessions SET last_seen_at=UTC_TIMESTAMP(),visitor_left_at=NULL,page_path=?,visitor_typing_at=IF(?,UTC_TIMESTAMP(),NULL) WHERE id=?`,[pagePath,payload.typing===true,id]);
  return read(slug,id,token);
 }
 async function visitorLeave(slug,id,token,end=false){await session(slug,id,token);await transaction(id,async(c,s)=>{
  if(end&&!s.visitor_ended_at)await event(c,id,'Visitor ended the chat.');
  await c.execute(`UPDATE public_website_chat_sessions SET visitor_left_at=UTC_TIMESTAMP(),visitor_typing_at=NULL,visitor_ended_at=IF(?,UTC_TIMESTAMP(),visitor_ended_at),state=IF(?,'closed',state),claimed_by=IF(?,NULL,claimed_by) WHERE id=?`,[end,end,end,id]);
 });}
 async function append(id,sender,userId,{body,clientMessageId}){
  const raw=String(body||'').trim();if(!raw||raw.length>2000||!validChatMessageId(clientMessageId))throw fail('Enter a message of 1–2,000 characters.');
  const moderated=moderateWebsiteChat(raw);
  await transaction(id,async(c,s)=>{
   if(s.visitor_ended_at)throw fail('The visitor ended this chat.',409);
   if(sender==='visitor'&&!s.initiated_at)throw fail('A support member must send the first message.',409);
   if(sender==='staff'&&s.claimed_by&&Number(s.claimed_by)!==Number(userId))throw fail('Another support member has claimed this chat.',409);
   const [existing]=await c.execute('SELECT id FROM public_website_chat_messages WHERE session_id=? AND client_message_id=?',[id,clientMessageId]);
   if(existing.length)return;
   const [counts]=await c.execute("SELECT COUNT(*) n,SUM(created_at>UTC_TIMESTAMP()-INTERVAL 1 MINUTE) recent FROM public_website_chat_messages WHERE session_id=? AND sender<>'system'",[id]);
   if(Number(counts[0].n)>=400||Number(counts[0].recent)>=20)throw fail('Please wait before sending another message.',429);
   if(sender==='staff'){await participant(c,id,userId);await c.execute('UPDATE public_website_chat_participants SET viewing_at=UTC_TIMESTAMP(),typing_at=NULL WHERE session_id=? AND user_id=?',[id,userId]);}
   await c.execute('INSERT INTO public_website_chat_messages(session_id,sender,author_user_id,client_message_id,encrypted_json) VALUES(?,?,?,?,?)',[id,sender,userId,clientMessageId,JSON.stringify(encryptChatText(moderated.body))]);
   await c.execute("UPDATE public_website_chat_sessions SET state='open',initiated_at=IF(?='staff',COALESCE(initiated_at,UTC_TIMESTAMP()),initiated_at),visitor_typing_at=IF(?='visitor',NULL,visitor_typing_at) WHERE id=?",[sender,sender,id]);
   if(moderated.filtered){const [sites]=await c.execute('SELECT website_url FROM public_website_support_sites WHERE slug=?',[s.site_slug]);await event(c,id,`Our chats are protected by Community Standards. Obscene language is automatically replaced with ****. Please keep this conversation respectful. ${sites[0].website_url}/community-standards`);}
  });
 }
 async function visitorSend(slug,id,token,payload){await session(slug,id,token);await append(id,'visitor',null,payload);return read(slug,id,token);}
 async function staffHeartbeat(user,available){const a=await actor(user);if(!available){await db.execute('DELETE FROM public_website_chat_staff WHERE user_id=?',[a.id]);return;}
 await db.execute('INSERT INTO public_website_chat_staff(user_id,last_seen_at) VALUES(?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()',[a.id]);}
 async function queue(user){const a=await actor(user);const params=[];let scope='';if(!a.global&&!a.agencies.includes(1)){if(!a.agencies.length)return [];scope=` AND s.support_agency_id IN (${a.agencies.map(()=>'?').join(',')})`;params.push(...a.agencies);}
 const [rows]=await db.execute(`SELECT c.id,c.site_slug AS siteSlug,c.created_at AS createdAt,c.last_seen_at AS lastSeen,c.page_path AS pagePath,c.state,c.claimed_by AS claimedBy,
 (c.expires_at<=UTC_TIMESTAMP()) AS expired,c.visitor_ended_at AS endedAt,c.visitor_left_at AS leftAt,c.initiated_at AS initiatedAt,
 (c.visitor_left_at IS NOT NULL OR c.last_seen_at<UTC_TIMESTAMP()-INTERVAL 40 SECOND) AS visitorLeft,
 (c.visitor_typing_at>UTC_TIMESTAMP()-INTERVAL 20 SECOND AND c.last_seen_at>UTC_TIMESTAMP()-INTERVAL 40 SECOND) AS visitorTyping,
 s.name,s.accent_color AS color,s.logo_url AS logoUrl,
 (SELECT MAX(m.id) FROM public_website_chat_messages m WHERE m.session_id=c.id) AS lastMessageId,
 (SELECT MAX(m.id) FROM public_website_chat_messages m WHERE m.session_id=c.id AND m.sender='visitor') AS lastVisitorMessageId,
 (SELECT COUNT(*) FROM public_website_chat_messages m WHERE m.session_id=c.id AND m.sender='visitor') AS visitorMessages
 FROM public_website_chat_sessions c JOIN public_website_support_sites s ON s.slug=c.site_slug WHERE (c.last_seen_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND OR EXISTS(SELECT 1 FROM public_website_chat_messages m WHERE m.session_id=c.id))${scope} ORDER BY c.created_at DESC LIMIT 100`,params);return rows;}
 async function staffSession(user,id){const [rows]=await db.execute('SELECT * FROM public_website_chat_sessions WHERE id=?',[id]);if(!rows[0])throw fail('Chat not found',404);const site=await authorize(user,rows[0].site_slug);return {session:rows[0],site};}
 async function staffRead(user,id){const {session:s,site}=await staffSession(user,id);
  const [referrals]=await db.execute('SELECT category,clicked_at AS clickedAt,ticket_id AS ticketId FROM public_website_chat_referrals WHERE session_id=? ORDER BY created_at',[id]);
  const [viewers]=await db.execute(`SELECT p.user_id AS userId,p.member_number AS memberNumber,CONCAT_WS(' ',u.first_name,u.last_name) AS name,
   (p.viewing_at>UTC_TIMESTAMP()-INTERVAL 30 SECOND) AS viewing,(p.typing_at>UTC_TIMESTAMP()-INTERVAL 20 SECOND AND p.viewing_at>UTC_TIMESTAMP()-INTERVAL 30 SECOND) AS typing
   FROM public_website_chat_participants p JOIN users u ON u.id=p.user_id WHERE p.session_id=? ORDER BY member_number`,[id]);
  return {state:s.state,ended:!!s.visitor_ended_at,expired:new Date(s.expires_at).getTime()<=Date.now(),claimedBy:s.claimed_by,referrals,canReply:!(new Date(s.expires_at).getTime()<=Date.now())&&!s.visitor_ended_at&&(!s.claimed_by||Number(s.claimed_by)===Number(user.id)),claimedByMe:Number(s.claimed_by)===Number(user.id),viewers,
   visitorTyping:!!s.visitor_typing_at&&Date.now()-new Date(s.visitor_typing_at).getTime()<20000,site:{slug:site.slug,name:site.name,logoUrl:site.logoUrl,color:site.accent_color},messages:await messages(id),quickReplies:websiteQuickReplies(site),topics:PUBLIC_SUPPORT_CATEGORIES,
   pageLinks:await pageLinks(site)};
 }
 async function pageLinks(site){
  const root=site.website_url;
  const sections={itsco:['services','providers','schools','about','growth','impact','team','insurance','resources','contact'],nlu:['tutoring','counseling','therapy-tutoring','learning-center','providers','about','how-it-works','academic-acceleration','get-started','resources','contact'],kimi:['about','services','packages','counseling','resources','contact','privacy','terms'],ptco:['about','services','hq','industries','resources','start','contact'],range:['about','network','providers','impact','resources','contact'],mh4kidz:['about','programs','involved','impact','resources','contact'],rise:['about','services','approach','resources','join','contact'],tisi:['services','who-we-help','men','boys','athletes','about','resources','contact','privacy','terms','accessibility']};
  return [{label:'Home',url:root},...(sections[site.slug]||['contact']).map(path=>({label:path[0].toUpperCase()+path.slice(1),url:`${root}/${path}`})),{label:'Get started',url:site.slug==='kimi'?`${root}/intake/kimi-coaching-inquiry`:['itsco','nlu','tisi'].includes(site.slug)?`${root}/join/${site.slug}/counseling`:`${root}/contact`},{label:'Community Standards',url:`${root}/community-standards`}];
 }
 async function staffPresence(user,id,payload={}){await staffSession(user,id);await transaction(id,async(c)=>{await participant(c,id,user.id);await c.execute('UPDATE public_website_chat_participants SET viewing_at=IF(?,UTC_TIMESTAMP(),NULL),typing_at=IF(?,UTC_TIMESTAMP(),NULL) WHERE session_id=? AND user_id=?',[payload.viewing!==false,payload.typing===true,id,user.id]);});}
 async function staffSend(user,id,payload){await staffSession(user,id);await append(id,'staff',user.id,payload);return staffRead(user,id);}
 async function close(user,id){await staffSession(user,id);await transaction(id,async(c,s)=>{
  const [p]=await c.execute('SELECT member_number,viewing_at FROM public_website_chat_participants WHERE session_id=? AND user_id=?',[id,user.id]);
  if(p[0]?.viewing_at&&s.initiated_at&&!s.visitor_ended_at)await event(c,id,`Support team member ${p[0].member_number} left chat. Send another message and a support member can return, or submit a ticket at any time.`);
  await c.execute('UPDATE public_website_chat_participants SET viewing_at=NULL,typing_at=NULL WHERE session_id=? AND user_id=?',[id,user.id]);
  await c.execute('UPDATE public_website_chat_sessions SET claimed_by=IF(claimed_by=?,NULL,claimed_by) WHERE id=?',[user.id,id]);
 },true);}
 async function claim(user,id,release=false){await staffSession(user,id);await transaction(id,async(c,s)=>{if(s.visitor_ended_at)throw fail('Visitor ended the chat',409);if(s.claimed_by&&Number(s.claimed_by)!==Number(user.id))throw fail('Another support member already claimed this chat.',409);await participant(c,id,user.id);await c.execute('UPDATE public_website_chat_sessions SET claimed_by=? WHERE id=?',[release?null:user.id,id]);});return staffRead(user,id);}
 async function flag(user,id,confirmed){const {site}=await staffSession(user,id);if(confirmed!==true)throw fail('Confirm the Community Standards flag.');await transaction(id,async(c,s)=>{if(!s.initiated_at||s.visitor_ended_at)throw fail('Only an active conversation can be flagged.',409);if(s.claimed_by&&Number(s.claimed_by)!==Number(user.id))throw fail('Only the responsible support member may flag this chat.',409);if(s.standards_flagged_at)return;await c.execute('UPDATE public_website_chat_sessions SET standards_flagged_at=UTC_TIMESTAMP() WHERE id=?',[id]);await event(c,id,`${standardsNotice} ${site.website_url}/community-standards`);});return staffRead(user,id);}
 async function referral(user,id,category=''){const {site}=await staffSession(user,id);if(category&&!PUBLIC_SUPPORT_CATEGORIES.some(t=>t.id===category))throw fail('Choose a valid topic.');const token=randomBytes(32).toString('hex');await db.execute('INSERT INTO public_website_chat_referrals(token_hash,session_id,author_user_id,category) VALUES(?,?,?,?)',[hash(token),id,user.id,category]);return {url:`${site.website_url}/live-chat-support?ref=${token}`,category};}
 async function visitorReferral(slug,id,token){await session(slug,id,token);const ref=randomBytes(32).toString('hex');await db.execute('INSERT INTO public_website_chat_referrals(token_hash,session_id) VALUES(?,?)',[hash(ref),id]);return {token:ref};}
 async function team(user){const a=await actor(user);const [rows]=await db.execute(`SELECT DISTINCT c.user_id AS userId,CONCAT_WS(' ',u.first_name,u.last_name) AS name FROM public_website_chat_staff c JOIN users u ON u.id=c.user_id
 JOIN user_presence p ON p.user_id=u.id LEFT JOIN user_presence_status ps ON ps.user_id=u.id
 WHERE c.last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND AND p.last_heartbeat_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND
 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.role IN ('admin','support','super_admin')
 AND COALESCE(ps.status,'in_available') IN ('in_available','in_available_for_phone')
 AND (? OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND COALESCE(ua.is_active,1)=1 AND ua.agency_id IN (${a.agencies.length?a.agencies.map(()=>'?').join(','):'NULL'})))`,[a.global||a.agencies.includes(1),...a.agencies]);return rows;}
 return {publicConfig,start,read,visitorPresence,visitorLeave,visitorSend,visitorReferral,staffHeartbeat,queue,staffRead,staffSend,staffPresence,close,claim,flag,referral,team,authorize};
}
export const websiteChat=createWebsiteChatService();
