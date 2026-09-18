import crypto from 'crypto';
import { google } from 'googleapis';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { buildImpersonatedJwtClient } from './googleWorkspaceAuth.service.js';
import { requireHousehold, assertFamilyBenefit } from './familyAuth.service.js';
import { familyError } from './familyPolicy.js';
import { digest, renderCalendar, googleEventBody } from './calendarPublicationPolicy.js';
import { workCalendarEvents, familyCalendarEvents } from './calendarEvents.service.js';

export async function assertWorkCalendar(userId,agencyId) {
  const [rows]=await pool.execute(`SELECT u.id,u.email,u.first_name,u.last_name,a.name AS agency_name FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id JOIN agencies a ON a.id=ua.agency_id
    WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND a.is_active=1
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')`,[userId,agencyId]);
  if(!rows.length)throw familyError('This account no longer has access to this agency calendar.',403);
  return rows[0];
}
export async function authorizePublication(session,householdId=null) {
  if(householdId){await assertFamilyBenefit(session.userId,session.agencyId);return requireHousehold(session,householdId,pool,true);}
  return assertWorkCalendar(session.userId,session.agencyId);
}
const scopeKey=(session,id)=>id?`family:${session.agencyId}:${Number(id)}`:`work:${session.agencyId}:${session.userId}`;
async function publication(session,id,create=false){
  await authorizePublication(session,id);
  const key=scopeKey(session,id);
  if(create)await pool.execute(`INSERT INTO calendar_publications (scope_key,agency_id,user_id,household_id,calendar_kind) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE scope_key=VALUES(scope_key)`,[key,session.agencyId,session.userId,id || null,id?'family':'work']);
  const [rows]=await pool.execute('SELECT * FROM calendar_publications WHERE scope_key=?',[key]);return rows[0] || null;
}
export async function publicationStatus(session,id){
  const p=await publication(session,id);if(!p)return {enabled:false,readers:[]};
  const [readers]=await pool.execute('SELECT email,managed_member FROM calendar_publication_readers WHERE publication_id=? ORDER BY email',[p.id]);
  return {enabled:true,hasSubscription:!!p.token_hash,details:p.detail_mode==='details',googleCalendarId:p.google_calendar_id,googleName:p.google_name,
    googleAddUrl:p.google_calendar_id?`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(p.google_calendar_id)}`:null,
    lastSyncedAt:p.last_synced_at,lastError:p.last_error,readers};
}
export async function issueSubscription(session,id){
  const p=await publication(session,id,true);const token=crypto.randomBytes(32).toString('base64url');
  await pool.execute('UPDATE calendar_publications SET token_hash=? WHERE id=?',[digest(token),p.id]);
  const agency=await Agency.findById(session.agencyId);
  const origin=new URL(buildPublicPortalBaseUrl(agency)).origin;
  return {url:`${origin}/api/calendar-sharing/feed/${token}.ics`};
}
export async function revokeSubscription(session,id){const p=await publication(session,id);if(p)await pool.execute('UPDATE calendar_publications SET token_hash=NULL WHERE id=?',[p.id]);}
export async function publicationEvents(p){
  await authorizePublication({userId:p.user_id,agencyId:p.agency_id},p.household_id);
  const now=Date.now(),from=new Date(now-30*86400000),to=new Date(now+180*86400000);
  if(p.calendar_kind==='family'){const events=await familyCalendarEvents(p.household_id,from,to,{details:p.detail_mode==='details'});return events.map(e=>({...e,title:p.detail_mode==='details' && e.memberName?`${e.memberName} · ${e.title}`:e.title}));}
  return workCalendarEvents(p.user_id,p.agency_id,from,to);
}
export async function subscriptionFeed(token){
  if(!/^[\w-]{43}$/.test(token))throw familyError('Calendar subscription not found.',404);
  const [rows]=await pool.execute('SELECT * FROM calendar_publications WHERE token_hash=?',[digest(token)]);
  if(!rows[0])throw familyError('Calendar subscription not found.',404);
  const p=rows[0];return renderCalendar(p.google_name || (p.household_id?'Family calendar':'Work calendar'),await publicationEvents(p));
}
async function googleClient(subject){return google.calendar({version:'v3',auth:await buildImpersonatedJwtClient({subjectEmail:subject,scopes:['https://www.googleapis.com/auth/calendar']})});}
// A MySQL advisory lock is tied to this dedicated connection; multiple Cloud Run instances cannot provision/sync the same calendar concurrently.
async function locked(id,fn){const db=await pool.getConnection();const name=`calendar-publication:${id}`;try{const [r]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[name]);if(!r[0].acquired)throw familyError('This calendar is already syncing. Try again shortly.',409);return await fn();}finally{await db.execute('SELECT RELEASE_LOCK(?)',[name]);db.release();}}
async function expectedReaders(p){
  if(!p.household_id){const user=await assertWorkCalendar(p.user_id,p.agency_id);return [user.email];}
  const [rows]=await pool.execute(`SELECT u.email FROM family_members m JOIN users u ON u.id=m.user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE m.household_id=? AND m.role='parent' AND u.email NOT LIKE '%@members.invalid'
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')`,[p.agency_id,p.household_id]);
  return rows.map(r=>r.email);
}
async function reconcileReaders(p,calendar){
  const desired=new Set((await expectedReaders(p)).map(e=>String(e).toLowerCase()));
  const [existing]=await pool.execute('SELECT * FROM calendar_publication_readers WHERE publication_id=?',[p.id]);
  for(const reader of existing){if(reader.managed_member && !desired.has(reader.email)){
    try{await calendar.acl.delete({calendarId:p.google_calendar_id,ruleId:reader.google_acl_id || `user:${reader.email}`});}catch(e){if(![404,410].includes(Number(e.code)))throw e;}
    await pool.execute('DELETE FROM calendar_publication_readers WHERE publication_id=? AND email=?',[p.id,reader.email]);
  }}
  for(const email of desired)await pool.execute('INSERT INTO calendar_publication_readers (publication_id,email,managed_member) VALUES (?,?,1) ON DUPLICATE KEY UPDATE managed_member=1',[p.id,email]);
  const [readers]=await pool.execute('SELECT * FROM calendar_publication_readers WHERE publication_id=?',[p.id]);
  for(const reader of readers){
    if(reader.email===p.google_subject)continue;
    if(!reader.google_acl_id){
      let rule;
      try{rule=(await calendar.acl.insert({calendarId:p.google_calendar_id,sendNotifications:false,requestBody:{role:'reader',scope:{type:'user',value:reader.email}}})).data;}
      catch(e){if(Number(e.code)!==409)throw e;rule={id:`user:${reader.email}`};await calendar.acl.update({calendarId:p.google_calendar_id,ruleId:rule.id,sendNotifications:false,requestBody:{role:'reader',scope:{type:'user',value:reader.email}}});}
      await pool.execute('UPDATE calendar_publication_readers SET google_acl_id=? WHERE publication_id=? AND email=?',[rule.id,p.id,reader.email]);
      // ACL alone does not subscribe the recipient. Workspace members can be subscribed via delegation; personal Gmail users use the Add link.
      if(reader.managed_member)try{const memberClient=await googleClient(reader.email);await memberClient.calendarList.insert({requestBody:{id:p.google_calendar_id,selected:true}});}catch{/* External accounts cannot be impersonated; the Add link remains available. */}
    }
  }
}
export async function retryCalendarWrite(operation, { wait = ms => new Promise(resolve=>setTimeout(resolve,ms)) } = {}) {
  for(let attempt=0;;attempt++){
    try{return await operation();}
    catch(error){
      const code=Number(error.code || error.response?.status);
      const reasons=error.response?.data?.error?.errors || error.errors || [];
      const transient=code===429 || code>=500 || (code===403 && (reasons.some(e=>/rateLimit|userRateLimit|quota/i.test(e.reason || '')) || /rate limit/i.test(error.message || '')));
      if(!transient || attempt>=4)throw error;
      if(process.env.NODE_ENV!=='test')await wait(Math.min(30000,2000*2**attempt));
    }
  }
}

async function syncUnlocked(p){
  const events=await publicationEvents(p),calendar=await googleClient(p.google_subject);
  await reconcileReaders(p,calendar);
  const [saved]=await pool.execute('SELECT * FROM calendar_publication_events WHERE publication_id=?',[p.id]);const previous=new Map(saved.map(e=>[e.event_key,e]));
  for(const event of events){
    const body=googleEventBody(event),fingerprint=digest(JSON.stringify(body)),old=previous.get(event.key);previous.delete(event.key);
    if(old?.fingerprint===fingerprint)continue;
    if(process.env.NODE_ENV!=='test')await new Promise(resolve=>setTimeout(resolve,600));
    const eventId=old?.google_event_id || digest(`${p.id}:${event.key}`);
    try{if(old)await retryCalendarWrite(()=>calendar.events.update({calendarId:p.google_calendar_id,eventId,sendUpdates:'none',requestBody:body}));else await retryCalendarWrite(()=>calendar.events.insert({calendarId:p.google_calendar_id,sendUpdates:'none',requestBody:{...body,id:eventId}}));}
    catch(e){if(Number(e.code)===409){await retryCalendarWrite(()=>calendar.events.update({calendarId:p.google_calendar_id,eventId,sendUpdates:'none',requestBody:body}));}else{if(![404,410].includes(Number(e.code)))throw e;try{await retryCalendarWrite(()=>calendar.events.insert({calendarId:p.google_calendar_id,sendUpdates:'none',requestBody:{...body,id:eventId}}));}catch(insertError){if(Number(insertError.code)!==409)throw insertError;await retryCalendarWrite(()=>calendar.events.update({calendarId:p.google_calendar_id,eventId,sendUpdates:'none',requestBody:body}));}}}
    await pool.execute(`INSERT INTO calendar_publication_events (publication_id,event_key,google_event_id,fingerprint) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE fingerprint=VALUES(fingerprint),google_event_id=VALUES(google_event_id)`,[p.id,event.key,eventId,fingerprint]);
  }
  for(const old of previous.values()){
    try{await retryCalendarWrite(()=>calendar.events.delete({calendarId:p.google_calendar_id,eventId:old.google_event_id,sendUpdates:'none'}));}catch(e){if(![404,410].includes(Number(e.code)))throw e;}
    await pool.execute('DELETE FROM calendar_publication_events WHERE publication_id=? AND event_key=?',[p.id,old.event_key]);
  }
  await pool.execute('UPDATE calendar_publications SET last_synced_at=NOW(),last_error=NULL WHERE id=?',[p.id]);
}
export async function createGooglePublication(session,id){
  const initial=await publication(session,id,true);
  await locked(initial.id,async()=>{
    const p=await publication(session,id);if(!p.google_calendar_id){
      const subject=process.env.CALENDAR_PUBLICATION_OWNER || process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER || process.env.GMAIL_IMPERSONATE_USER || 'ai@plottwistco.com';
      const owner=await authorizePublication(session,id),name=id?`${owner.name} · Family`:`${owner.first_name} ${owner.last_name} · ${owner.agency_name} work`;
      const calendar=await googleClient(subject);
      const {data}=await calendar.calendars.insert({requestBody:{summary:name,timeZone:owner.timezone || 'America/Denver',description:'Managed by the app. Read-only shared calendar; make changes in the app.'}});
      try{await pool.execute('UPDATE calendar_publications SET google_calendar_id=?,google_subject=?,google_name=? WHERE id=?',[data.id,subject,name,p.id]);}
      catch(e){await calendar.calendars.delete({calendarId:data.id});throw e;}
      Object.assign(p,{google_calendar_id:data.id,google_subject:subject,google_name:name});
    }
    await reconcileReaders(p,await googleClient(p.google_subject));
  });
  // Initial event backfill can take minutes. The durable publication row is picked up by the scheduler.
  setTimeout(()=>syncDueCalendarPublications().catch(()=>{}),100).unref?.();
  return publicationStatus(session,id);
}
export async function syncGooglePublication(session,id){const p=await publication(session,id);if(!p?.google_calendar_id)throw familyError('Create your shared calendar first.');await locked(p.id,()=>syncUnlocked(p));return publicationStatus(session,id);}
export async function setPublicationDetails(session,id,details){const p=await publication(session,id,true);if(!id&&details)throw familyError('Work calendars always use limited details.');await pool.execute('UPDATE calendar_publications SET detail_mode=? WHERE id=?',[details?'details':'limited',p.id]);if(p.google_calendar_id)await syncGooglePublication(session,id);return publicationStatus(session,id);}
export async function addPublicationReader(session,id,email){
  const p=await publication(session,id);if(!p?.google_calendar_id)throw familyError('Create your shared calendar first.');
  email=String(email || '').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw familyError('Enter a valid email address.');
  return locked(p.id,async()=>{const [count]=await pool.execute('SELECT COUNT(*) n FROM calendar_publication_readers WHERE publication_id=?',[p.id]);if(count[0].n>=30)throw familyError('This calendar already has 30 readers.');await pool.execute('INSERT IGNORE INTO calendar_publication_readers (publication_id,email) VALUES (?,?)',[p.id,email]);await reconcileReaders(p,await googleClient(p.google_subject));return publicationStatus(session,id);});
}
export async function removePublicationReader(session,id,email){const p=await publication(session,id);if(!p?.google_calendar_id)return;
  await locked(p.id,async()=>{const [rows]=await pool.execute('SELECT * FROM calendar_publication_readers WHERE publication_id=? AND email=?',[p.id,String(email)]);const reader=rows[0];if(!reader)return;if(reader.managed_member)throw familyError('Linked adults are managed through household membership.');try{await (await googleClient(p.google_subject)).acl.delete({calendarId:p.google_calendar_id,ruleId:reader.google_acl_id || `user:${reader.email}`});}catch(e){if(![404,410].includes(Number(e.code)))throw e;}await pool.execute('DELETE FROM calendar_publication_readers WHERE publication_id=? AND email=?',[p.id,reader.email]);});
}
async function deleteMirror(p){
  if(p.google_calendar_id)try{await(await googleClient(p.google_subject)).calendars.delete({calendarId:p.google_calendar_id});}catch(e){if(![404,410].includes(Number(e.code)))throw e;}
  await pool.execute('DELETE FROM calendar_publication_events WHERE publication_id=?',[p.id]);
  await pool.execute('DELETE FROM calendar_publication_readers WHERE publication_id=?',[p.id]);
  await pool.execute('UPDATE calendar_publications SET google_calendar_id=NULL,google_subject=NULL,google_name=NULL,last_synced_at=NULL WHERE id=?',[p.id]);
}
export async function deleteGooglePublication(session,id){const p=await publication(session,id);if(p)await locked(p.id,()=>deleteMirror(p));}
export async function syncDueCalendarPublications(){
  const [rows]=await pool.execute(`SELECT * FROM calendar_publications WHERE google_calendar_id IS NOT NULL AND (last_synced_at IS NULL OR last_synced_at<DATE_SUB(NOW(),INTERVAL 4 MINUTE)) ORDER BY COALESCE(last_synced_at,created_at) LIMIT 30`);
  for(const p of rows)try{await locked(p.id,async()=>{
    try{await authorizePublication({userId:p.user_id,agencyId:p.agency_id},p.household_id);}catch(e){if(e.status===403 || e.status===404){await deleteMirror(p);await pool.execute('UPDATE calendar_publications SET token_hash=NULL WHERE id=?',[p.id]);return;}throw e;}
    await syncUnlocked(p);
  });}catch(e){if(e.status===409)continue;await pool.execute('UPDATE calendar_publications SET last_error=?,last_synced_at=NOW() WHERE id=?',['Calendar sync failed. Check sharing permissions and try Sync now.',p.id]);console.warn('[Calendar sharing] Sync failed',p.id,e.code || e.status || 'unknown');}
}
