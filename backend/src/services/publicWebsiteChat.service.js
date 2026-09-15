import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import pool from '../config/database.js';
import config from '../config/config.js';
import {getPublicWebsiteIdentity} from './publicWebsiteIdentity.service.js';
import {encryptChatText,decryptChatText,isChatEncryptionConfigured} from './chatEncryption.service.js';
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
  {label:'Find support',body:`Tell us what kind of support you’re looking for. Please keep private medical details out of this website chat.`},
  {label:'Follow up',body:`If you need to leave, please use our contact form at ${root}/contact so our team has your email for follow-up.`}
 ];
}
export function createWebsiteChatService(db=pool,identity=getPublicWebsiteIdentity) {
 async function site(slug){const s=await identity(slug);if(!s||!s.chat_enabled||s.coming_soon)throw fail('Website chat unavailable',404);return s;}
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
  await db.execute('DELETE FROM public_website_chat_sessions WHERE expires_at<UTC_TIMESTAMP()-INTERVAL 7 DAY LIMIT 100');
  return {id,token};
 }
 async function session(slug,id,token){if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw fail('Chat session unavailable',404);
  const [rows]=await db.execute(`SELECT * FROM public_website_chat_sessions WHERE id=? AND site_slug=? AND token_hash=? AND expires_at>UTC_TIMESTAMP()`,[id,slug,hash(token)]);if(!rows[0])throw fail('Chat session expired. Please use the contact form.',404);return rows[0];}
 async function messages(id){const [rows]=await db.execute('SELECT id,sender,encrypted_json,created_at FROM public_website_chat_messages WHERE session_id=? ORDER BY id LIMIT 200',[id]);return rows.map(r=>{let enc=typeof r.encrypted_json==='string'?JSON.parse(r.encrypted_json):r.encrypted_json;return {id:r.id,sender:r.sender,createdAt:r.created_at,body:decryptChatText(enc)};});}
 async function read(slug,id,token){const s=await session(slug,id,token);if(s.state==='open')await db.execute('UPDATE public_website_chat_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[id]);return {state:s.state,messages:await messages(id)};}
 async function append(id,sender,userId,{body,clientMessageId}){
  const text=String(body||'').trim();if(!text||text.length>2000||!validChatMessageId(clientMessageId))throw fail('Enter a message of 1–2,000 characters.');
  // Lock the session so limits and close/send races are consistent across replicas.
  const connection=await db.getConnection();try{await connection.beginTransaction();
   const [sessions]=await connection.execute("SELECT state,expires_at FROM public_website_chat_sessions WHERE id=? AND state='open' AND expires_at>UTC_TIMESTAMP() FOR UPDATE",[id]);
   if(!sessions.length)throw fail('This chat has ended. Please use the contact form.',409);
   const [existing]=await connection.execute('SELECT id FROM public_website_chat_messages WHERE session_id=? AND client_message_id=?',[id,clientMessageId]);
   if(!existing.length){const [counts]=await connection.execute('SELECT COUNT(*) n,SUM(created_at>UTC_TIMESTAMP()-INTERVAL 1 MINUTE) recent FROM public_website_chat_messages WHERE session_id=?',[id]);
    if(Number(counts[0].n)>=200||Number(counts[0].recent)>=20)throw fail('Please wait before sending another message.',429);
    await connection.execute('INSERT INTO public_website_chat_messages(session_id,sender,author_user_id,client_message_id,encrypted_json) VALUES(?,?,?,?,?)',[id,sender,userId,clientMessageId,JSON.stringify(encryptChatText(text))]);}
   await connection.commit();
  }catch(e){await connection.rollback();throw e;}finally{connection.release();}
 }
 async function visitorSend(slug,id,token,payload){await session(slug,id,token);await append(id,'visitor',null,payload);return read(slug,id,token);}
 async function staffHeartbeat(user,available){const a=await actor(user);if(!available){await db.execute('DELETE FROM public_website_chat_staff WHERE user_id=?',[a.id]);return;}
 await db.execute('INSERT INTO public_website_chat_staff(user_id,last_seen_at) VALUES(?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP()',[a.id]);}
 async function queue(user){const a=await actor(user);const params=[];let scope='';if(!a.global&&!a.agencies.includes(1)){if(!a.agencies.length)return [];scope=` AND s.support_agency_id IN (${a.agencies.map(()=>'?').join(',')})`;params.push(...a.agencies);}
 const [rows]=await db.execute(`SELECT c.id,c.site_slug AS siteSlug,c.created_at AS createdAt,c.last_seen_at AS lastSeen,s.name,s.accent_color AS color,s.logo_url AS logoUrl,
 (SELECT MAX(m.id) FROM public_website_chat_messages m WHERE m.session_id=c.id) AS lastMessageId,
 (SELECT COUNT(*) FROM public_website_chat_messages m WHERE m.session_id=c.id AND m.sender='visitor') AS visitorMessages
 FROM public_website_chat_sessions c JOIN public_website_support_sites s ON s.slug=c.site_slug WHERE c.state='open' AND c.expires_at>UTC_TIMESTAMP()
 AND (c.last_seen_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND OR EXISTS(SELECT 1 FROM public_website_chat_messages m WHERE m.session_id=c.id))${scope} ORDER BY c.created_at DESC LIMIT 100`,params);return rows;}
 async function staffRead(user,id){const [rows]=await db.execute('SELECT site_slug,state FROM public_website_chat_sessions WHERE id=?',[id]);if(!rows[0])throw fail('Chat not found',404);const s=await authorize(user,rows[0].site_slug);return {state:rows[0].state,site:{slug:s.slug,name:s.name,logoUrl:s.logoUrl,color:s.accent_color},messages:await messages(id),quickReplies:websiteQuickReplies(s)};}
 async function staffSend(user,id,payload){await staffRead(user,id);await append(id,'staff',user.id,payload);return staffRead(user,id);}
 async function close(user,id){await staffRead(user,id);await db.execute("UPDATE public_website_chat_sessions SET state='closed' WHERE id=?",[id]);}
 return {publicConfig,start,read,visitorSend,staffHeartbeat,queue,staffRead,staffSend,close,authorize};
}
export const websiteChat=createWebsiteChatService();
