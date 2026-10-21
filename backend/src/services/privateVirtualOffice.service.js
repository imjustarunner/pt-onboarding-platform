import {officeVisitWindowOpen} from './tutoringOfficeWindow.service.js';
import {scheduledAttendance} from './virtualOfficeAttendance.service.js';
import crypto from 'node:crypto';
import {officeEncounterLink,openScheduledOffice,scheduledParticipants,markOfficeAttendance} from './virtualOfficeSchedule.service.js';
import pool from '../config/database.js';
import {prepareTutoringOffice,linkTutoringOffice,tutoringOfficeLink,tutoringVisit,confirmTutoringGuest,finishTutoringOffice} from './tutoringOffice.service.js';
import {attachTutoringBinder,officeTutoringContext} from './tutoringOffice.service.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { privateOfficeDemoAccess } from './privateOfficeDemoAccess.service.js';
import { getMeetingPlan } from './meetingAccessPlan.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import Video from './vonageVideo.service.js';
import * as clinical from './clinicalVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import { resolveVideoProjectId } from './video.service.js';

const fail = (status,message) => Object.assign(new Error(message),{status});
export const officeCredentialHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
export function snapshotDataUrl(value) {
 const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
 if (!m || m[2].length > 3 * 1024 * 1024) throw fail(400,'Take a new camera snapshot (JPEG or PNG, up to 2 MB).');
 const bytes = Buffer.from(m[2],'base64');
 const valid = m[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
 if (!valid || bytes.length < 100 || bytes.length > 2 * 1024 * 1024) throw fail(400,'Invalid camera snapshot.');
 return `data:image/${m[1]};base64,${bytes.toString('base64')}`;
}
export async function assertOfficeAccess(room, db = pool) {
 if (!room?.isActive) throw fail(404,'This office is unavailable.');
 const member=await hasActiveMeetingMembership(room.agencyId,room.userId);
 room.demoAccess=!member && await privateOfficeDemoAccess(room,db);
 if (!member && !room.demoAccess) throw fail(404,'This office is unavailable.');
 const [users] = await db.execute('SELECT role FROM users WHERE id=?',[room.userId]);
 if (!['provider','provider_plus','clinician','supervisor','admin','super_admin','superadmin','intern','intern_plus','clinical_practice_assistant'].includes(users[0]?.role)) throw fail(403,'A provider account is required for a private office.');
 const plan = await getMeetingPlan(room.userId,db);
 if (!plan.privateOffice) throw fail(403,'A private virtual office is included with Premium and Premium Plus.');
 return plan;
}
export async function officeForHost(userId, agencyId) {
 let room = await ProviderMyRoom.findByUserId(userId, agencyId);
 if (!room) {
  if (!agencyId || !await hasActiveMeetingMembership(agencyId,userId)) throw fail(403,'Choose an agency you belong to.');
  const plan = await getMeetingPlan(userId);
  if (!plan.privateOffice) throw fail(403,'A private virtual office is included with Premium and Premium Plus.');
  room = await ProviderMyRoom.getOrCreateForUser(userId,agencyId);
 }
 const plan = await assertOfficeAccess(room);
 return {room,plan};
}
export async function officeBySlug(slug) {
 const room = await ProviderMyRoom.findBySlug(slug);
 await assertOfficeAccess(room); return room;
}
async function lockOffice(db,room) {
 await db.execute('INSERT IGNORE INTO private_virtual_office_sessions (room_id) VALUES (?)',[room.id]);
 const [rows] = await db.execute('SELECT * FROM private_virtual_office_sessions WHERE room_id=? FOR UPDATE',[room.id]);
 return rows[0];
}
async function transaction(fn) {
 const db = await pool.getConnection();
 try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
 catch(e) { await db.rollback(); throw e; } finally { db.release(); }
}
export async function joinOffice(room, {displayName,photoDataUrl,photoRequiredAck}, ipAddress = null, ipSource = 'unverified_proxy') {
 await assertOfficeAccess(room);
 const name = String(displayName || '').trim().slice(0,120) || 'Guest';
 if (photoDataUrl && photoRequiredAck !== true) throw fail(400,'Confirm that your photo may be shown to the provider, or continue without a photo.');
 const photo = photoDataUrl ? JSON.stringify(encryptChatText(snapshotDataUrl(photoDataUrl))) : null;
 const credential = crypto.randomBytes(32).toString('base64url');
 const [result] = await pool.execute(`INSERT INTO private_virtual_office_visits (room_id,credential_hash,display_name,photo_envelope,ip_address,ip_source,expires_at)
 VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))`,[room.id,officeCredentialHash(credential),name,photo,ipAddress,ipSource]);
 return {id:result.insertId,credential,status:'waiting',guestDisplayName:name};
}
async function guestFor(room,id,credential,db=pool) {
 if (!/^[A-Za-z0-9_-]{43}$/.test(String(credential || ''))) throw fail(403,'Reopen the office link and request admission.');
 const [rows] = await db.execute(`SELECT * FROM private_virtual_office_visits WHERE id=? AND room_id=? AND credential_hash=? AND expires_at>UTC_TIMESTAMP()`,[id,room.id,officeCredentialHash(credential)]);
 if (!rows[0]) throw fail(403,'This visit has expired. Reopen the office link.');
 return rows[0];
}
// Availability never includes another visitor's identity or participant count.
export async function officeAvailability(room,excludeVisitId=0,current=null){
 if(!current){const [[session]]=await pool.execute('SELECT host_seen_at,office_seen_at,generation FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);current=session;}
 if(!current)return 'away';
 const [[presence]]=await pool.execute(`SELECT EXISTS(SELECT 1 FROM private_virtual_office_visits v WHERE v.room_id=? AND v.generation=? AND v.status='admitted' AND v.id<>? AND v.expires_at>UTC_TIMESTAMP()) OR EXISTS(SELECT 1 FROM virtual_office_encounters e JOIN counseling_session_visits v ON v.session_id=e.counseling_session_id WHERE e.room_id=? AND e.generation=? AND v.status='admitted' AND (v.office_visit_id IS NULL OR v.office_visit_id<>?)) AS occupied`,[room.id,current.generation||0,excludeVisitId,room.id,current.generation||0,excludeVisitId]);
 const lastSeen=current.office_seen_at||current.host_seen_at;
 return Number(presence?.occupied)?'in_session':lastSeen&&Date.now()-new Date(lastSeen).getTime()<90000?'available':'away';
}
export async function officeGuestStatus(room,id,credential) {
 await assertOfficeAccess(room);
 const guest = await guestFor(room,id,credential);
 await pool.execute('UPDATE private_virtual_office_visits SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[guest.id]);
 const [sessions] = await pool.execute('SELECT host_seen_at,office_seen_at,generation,video_session_id FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const availability=await officeAvailability(room,guest.id,sessions[0]);
 const media=guest.admitted_at&&sessions[0]?.video_session_id?await clinical.clinicalMedia(sessions[0].video_session_id):null;
 return {id:guest.id,status:guest.status,availability,canRejoin:guest.status==='ended'&&Number(guest.generation)===Number(sessions[0]?.generation)&&media?.state==='active',guestDisplayName:guest.display_name,identified:!!guest.counseling_visit_id,hostPresent:!!sessions[0]?.host_seen_at && Date.now()-new Date(sessions[0].host_seen_at).getTime()<90000};
}
export async function officeLobby(room,req) {
 const plan = await assertOfficeAccess(room);
 await pool.execute('INSERT INTO private_virtual_office_sessions (room_id,office_seen_at) VALUES (?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE office_seen_at=UTC_TIMESTAMP()',[room.id]);
 await closeAbsentVisits(room);
 // Photos are encrypted at rest, returned only to the owning provider, and discarded after the visit.
 await pool.execute(`UPDATE private_virtual_office_visits SET photo_envelope=NULL,status=IF(status='waiting','dismissed',status) WHERE room_id=? AND expires_at<=UTC_TIMESTAMP()`,[room.id]);
 const [officeSessions]=await pool.execute('SELECT * FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const current=officeSessions[0];
 const media=current?.video_session_id?await clinical.clinicalMedia(current.video_session_id):null;
 let [[previous]]=await pool.execute('SELECT COUNT(*) total,MIN(admitted_at) started_at FROM private_virtual_office_visits WHERE room_id=? AND generation=?',[room.id,current?.generation||0]);
 const providerReady=media?.state==='active' && await clinical.hasMonitoredProvider(current.video_session_id);
 const link=media?.session_kind==='counseling'?await officeEncounterLink(room.id,current.generation):null;
 let scheduledVisits=[],scheduled=null;
 if(link){
  const [[session]]=await pool.execute('SELECT id,title,appointment_id,started_at FROM counseling_sessions WHERE id=?',[link.counseling_session_id]);
  [scheduledVisits]=await pool.execute("SELECT id,actor,client_id,office_visit_id,status,admitted_at AS admittedAt,ip_address AS ipAddress,entry_method AS entryMethod FROM counseling_session_visits WHERE session_id=? AND status IN ('waiting','admitted') ORDER BY created_at",[link.counseling_session_id]);
  const participants=await scheduledParticipants(link.counseling_session_id,room.agencyId);
  scheduled={id:session.id,title:session.title||'Scheduled session',appointmentId:session.appointment_id,participants};
  [[previous]]=await pool.execute('SELECT COUNT(admitted_at) total,MIN(admitted_at) started_at FROM counseling_session_visits WHERE session_id=?',[session.id]);
  scheduledVisits=scheduledVisits.filter(v=>!v.office_visit_id).map(v=>({...v,guestDisplayName:participants.find(p=>p.id===Number(v.client_id))?.displayName||'Invited client',entryMethod:v.entryMethod||'session_link'}));
 }
 const tutoringLink=current && media?.session_kind==='office' && media.state==='active' ? await tutoringOfficeLink(room,current.generation) : null;
 let tutoring=null;
 if(tutoringLink) { try { tutoring=await officeTutoringContext(room,current); } catch(e) { if(![404,409].includes(e.status))throw e; tutoring={unavailable:true,title:'Tutoring visit unavailable',participants:[]}; } }
 const encounter={scheduled,tutoring,state:media?.state||'idle',hasParticipants:Number(previous.total)>0,generation:current?.generation||0,providerReady:!!providerReady,startedAt:previous.started_at||null};
 const [rows] = await pool.execute(`SELECT id,display_name,status,photo_envelope,admitted_at,ip_address,counseling_visit_id,generation,(SELECT COUNT(*) FROM private_virtual_office_messages m WHERE m.room_id=private_virtual_office_visits.room_id AND m.visit_id=private_virtual_office_visits.id AND m.author_role='guest' AND m.read_at IS NULL) AS unread_messages FROM private_virtual_office_visits WHERE room_id=? AND status IN ('waiting','admitted') AND expires_at>UTC_TIMESTAMP() ORDER BY created_at`,[room.id]);
 if(rows.length)await clinicalAudit({kind:'office',sessionId:room.id,generation:current?.generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,req},'clinical_lobby_read',{visitIds:rows.map(r=>r.id)});
 return {plan,encounter,scheduledWaiting:scheduledVisits.filter(v=>v.status==='waiting'),scheduledAdmitted:scheduledVisits.filter(v=>v.status==='admitted'),waiting:rows.filter(r=>r.status==='waiting').map(r=>({id:r.id,unreadMessages:Number(r.unread_messages||0),guestDisplayName:r.display_name,guestPhotoUrl:r.photo_envelope?decryptChatText(JSON.parse(r.photo_envelope)):null,returning:!!r.admitted_at&&Number(r.generation)===Number(current?.generation)})),admitted:rows.filter(r=>r.status==='admitted').map(r=>({id:r.id,unreadMessages:Number(r.unread_messages||0),guestDisplayName:r.display_name,admittedAt:r.admitted_at,ipAddress:r.ip_address}))};
}
export async function admitOfficeGuest(room,id,{sameEncounter=false,clientId=null,confirmIdentity=false,req}={}) {
 return transaction(async db=> {
  const session = await lockOffice(db,room);
  const plan = await assertOfficeAccess(room,db);
  if (!session.video_session_id || !session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000) throw fail(409,'Open your office video before admitting a guest.');
  const media=await clinical.clinicalMedia(session.video_session_id,db);
  if(media?.session_kind==='counseling')await db.execute('SELECT id FROM counseling_sessions WHERE id=? FOR UPDATE',[media.session_id]);
  const [rows] = await db.execute(`SELECT * FROM private_virtual_office_visits WHERE id=? AND room_id=? AND status='waiting' AND expires_at>UTC_TIMESTAMP() FOR UPDATE`,[id,room.id]);
  if (!rows[0]) throw fail(409,'This guest is no longer waiting.');
  if(!await officeVisitWindowOpen(id,db))throw fail(409,'This appointment’s waiting-room window has closed or the appointment changed.');
  if(rows[0].tutoring_client_id&&media?.session_kind==='counseling')throw fail(409,'End the counseling session before admitting a tutoring visitor.');
  await clinical.requireMonitoredProvider(session.video_session_id,db);
  const link=media?.session_kind==='counseling'?await officeEncounterLink(room.id,session.generation,db):null;
  if(link){
   const participants=await scheduledParticipants(link.counseling_session_id,room.agencyId,db);
   if(rows[0].counseling_visit_id){const [[prior]]=await db.execute('SELECT client_id,session_id FROM counseling_session_visits WHERE id=?',[rows[0].counseling_visit_id]);if(!prior||Number(prior.client_id)!==Number(clientId)||Number(prior.session_id)!==Number(link.counseling_session_id))throw fail(409,'This returning visit is linked to its originally confirmed client.');}
   if(confirmIdentity!==true||!participants.some(p=>p.id===Number(clientId)))throw fail(409,'Confirm which scheduled client this guest is before admitting them to the appointment.');
   const [[current]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[link.counseling_session_id]);
   if(current.status==='ended')throw fail(410,'This session has ended.');
   const [[present]]=await db.execute("SELECT COUNT(*) total FROM counseling_session_visits WHERE session_id=? AND status='admitted' AND (client_id IS NULL OR client_id<>?)",[current.id,clientId]);
   if(Number(present.total)>0&&!(sameEncounter&&plan.multipleOfficeGuests))throw fail(409,'Confirm that this is an intended couples or family participant.');
   const [visit]=await db.execute(`INSERT INTO counseling_session_visits (session_id,actor,client_id,entry_method,office_visit_id,ip_address,ip_source,status,admitted_at)
    VALUES (?,?,?,'office_link',?,?,?,'admitted',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),status='admitted',ended_at=NULL,duration_seconds=NULL,last_seen_at=UTC_TIMESTAMP()`,[current.id,`office-guest-${id}`,clientId,id,rows[0].ip_address,rows[0].ip_source]);
   await db.execute('UPDATE private_virtual_office_visits SET counseling_visit_id=? WHERE id=?',[visit.insertId,id]);
   await db.execute('UPDATE counseling_sessions SET started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=?',[current.id]);
   await markOfficeAttendance(current.id,db);
   await clinicalAudit({kind:'counseling',sessionId:current.id,agencyId:room.agencyId,role:'provider',req},'clinical_office_client_confirmed',{officeVisitId:id,visitId:visit.insertId,clientId:Number(clientId),basis:'provider_confirmation'},db);
  }
  const tutoring=await confirmTutoringGuest(room,session,rows[0],{clientId,confirmIdentity,sameEncounter:sameEncounter&&plan.multipleOfficeGuests},db);
  const [counts] = await db.execute(`SELECT COUNT(*) total,SUM(status='admitted') present FROM private_virtual_office_visits WHERE room_id=? AND generation=?`,[room.id,session.generation]);
  const returning=!!rows[0].admitted_at&&Number(rows[0].generation)===Number(session.generation);
  if (!link && !tutoring && !returning && Number(counts[0].total)>0 && !(sameEncounter===true && Number(counts[0].present)>0 && plan.multipleOfficeGuests)) throw fail(409,'End this session before admitting a new client. Only intended couples or family participants may join the current session.');
  if (!returning && !plan.multipleOfficeGuests && Number(counts[0].total)>=1) throw fail(409,'Premium includes one guest. End this visit first, or use Premium Plus for couples and families.');
  await db.execute(`UPDATE private_virtual_office_visits SET status='admitted',generation=?,admitted_at=COALESCE(admitted_at,UTC_TIMESTAMP()),ended_at=NULL,duration_seconds=NULL,last_seen_at=UTC_TIMESTAMP(),expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE id=?`,[session.generation,id]);
  await clinicalAudit({kind:'office',sessionId:room.id,generation:session.generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,req},'clinical_guest_admitted',{visitId:id,sameEncounter},db);
  return {ok:true};
 });
}
export async function dismissOfficeGuest(room,id) {
 await assertOfficeAccess(room);
 const [result] = await pool.execute(`UPDATE private_virtual_office_visits SET status='dismissed',photo_envelope=NULL WHERE id=? AND room_id=? AND status='waiting'`,[id,room.id]);
 if (!result.affectedRows) throw fail(409,'Only a waiting guest can be dismissed. End the office visit to disconnect admitted guests.');
 return {ok:true};
}
async function videoCredentials(sessionId,identity,displayName,isHost,db,visitId=null) {
 if (!Video.isVideoConfigured()) throw fail(503,'Video is not configured.');
 const token = await clinical.clinicalVideoToken(sessionId,{actor:identity,role:isHost?'provider':'client',visitId},db);
 return {sessionId,token,applicationId:resolveVideoProjectId(),localName:displayName,isHost};
}
export async function officeHostVideo(room,options={}) {
 let creationLock,lockName,locked=false;
 if(options.appointmentId){
  if(!Number.isSafeInteger(Number(options.appointmentId))||Number(options.appointmentId)<1)throw fail(400,'Choose a valid appointment.');
  creationLock=await pool.getConnection();lockName=`counseling_appointment:${Number(options.appointmentId)}`;
  try{const [[r]]=await creationLock.execute('SELECT GET_LOCK(?,8) acquired',[lockName]);locked=Number(r.acquired)===1;if(!locked)throw fail(409,'This appointment is opening. Please retry.');}catch(e){creationLock.release();throw e;}
 }
 try{return await transaction(async db=>{
  const session = await lockOffice(db,room); await assertOfficeAccess(room,db);
  if(room.demoAccess&&(options.appointmentId||options.sessionId))throw fail(403,'This demo office is limited to fictional tutoring visits.');
  if((options.learningSessionId||options.tutoringAppointmentId)&&(options.appointmentId||options.sessionId))throw fail(400,'Choose one appointment.');
  const tutoring=options.learningSessionId||options.tutoringAppointmentId?await prepareTutoringOffice(room,session,options,db):null;
  let sid = options.appointmentId||options.sessionId?await openScheduledOffice(db,room,session,options):session.video_session_id;
  if (sid) {
   const media=await clinical.clinicalMedia(sid,db,true);
   if (!media || media.state==='ending') throw fail(409,'The previous encounter must finish disconnecting before you open the next one.');
   if (media.state==='ended') sid=null;
  }
  if (!sid) {
   if (!Video.isVideoConfigured()) throw fail(503,'Video is not configured.');
   clinical.requireClinicalVideoMonitoring();
   sid = await Video.createSession();
   await clinical.registerClinicalMedia(sid,{kind:'office',sessionId:room.id,generation:Number(session.generation)+1,agencyId:room.agencyId},db);
   await db.execute('UPDATE private_virtual_office_sessions SET video_session_id=?,generation=generation+1 WHERE room_id=?',[sid,room.id]);
  }
  if(tutoring){const [[current]]=await db.execute('SELECT generation FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);await linkTutoringOffice(room,current.generation,tutoring,db,options.req);}
  await db.execute('UPDATE private_virtual_office_sessions SET host_seen_at=UTC_TIMESTAMP() WHERE room_id=?',[room.id]);
  return videoCredentials(sid,`user-${room.userId}`,room.displayName || 'Provider',true,db);
 });}finally{if(creationLock){try{if(locked)await creationLock.execute('SELECT RELEASE_LOCK(?)',[lockName]);}finally{creationLock.release();}}}
}
export async function officeHostHeartbeat(room) {
 await assertOfficeAccess(room);
 await pool.execute('UPDATE private_virtual_office_sessions SET host_seen_at=UTC_TIMESTAMP() WHERE room_id=? AND video_session_id IS NOT NULL',[room.id]);
 return {ok:true};
}
export async function openStudentBinder(room,input,req){
 return transaction(async db=>{
  const current=await lockOffice(db,room);await assertOfficeAccess(room,db);
  return attachTutoringBinder(room,current,input,db,req);
 });
}
export async function officeGuestVideo(room,id,credential) {
 return transaction(async db=>{
  const session = await lockOffice(db,room); await assertOfficeAccess(room,db);
  const guest = await guestFor(room,id,credential,db);
  if (guest.status!=='admitted' || Number(guest.generation)!==Number(session.generation) || !session.video_session_id || !session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000) throw fail(403,'Wait for the provider to admit you.');
  return videoCredentials(session.video_session_id,`office-guest-${guest.id}`,`${guest.display_name} (Guest)`,false,db,guest.counseling_visit_id||guest.id);
 });
}
export async function endOffice(room,req) {
 let tutoringGeneration=null;
 const sid=await transaction(async db=>{
  const session=await lockOffice(db,room);tutoringGeneration=session.generation;
  if (!session.video_session_id) return null;
  const media=await clinical.clinicalMedia(session.video_session_id,db);
  if(media?.session_kind==='counseling')await db.execute('SELECT id FROM counseling_sessions WHERE id=? FOR UPDATE',[media.session_id]);
  await clinical.requestClinicalEnd(session.video_session_id,req,db);
  if(media?.session_kind==='counseling'){
   await db.execute("UPDATE counseling_sessions SET status='ended',ended_at=COALESCE(ended_at,UTC_TIMESTAMP()) WHERE id=?",[media.session_id]);
   await db.execute("UPDATE counseling_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[media.session_id]);
   await markOfficeAttendance(media.session_id,db);
  }
  await db.execute('UPDATE tutoring_office_encounters SET ended_at=COALESCE(ended_at,UTC_TIMESTAMP()) WHERE room_id=? AND generation=? AND agency_id=?',[room.id,session.generation,room.agencyId]);
  await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=UTC_TIMESTAMP(),duration_seconds=GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP())) WHERE room_id=? AND (status='admitted' OR (status='waiting' AND generation=?))`,[room.id,session.generation]);
  return session.video_session_id;
 });
 const result=sid?await clinical.finishClinicalEnd(sid):{ok:true,state:'ended'};
 if(tutoringGeneration&&result.state==='ended')await finishTutoringOffice(room,tutoringGeneration);
 return result;
}

export async function leaveOffice(room,id,credential) {
 await transaction(async db=>{
  const session=await lockOffice(db,room);
  const guest=await guestFor(room,id,credential,db);
  if(session.video_session_id){const media=await clinical.clinicalMedia(session.video_session_id,db);if(media?.session_kind==='counseling')await db.execute('SELECT id FROM counseling_sessions WHERE id=? FOR UPDATE',[media.session_id]);await clinical.clinicalMedia(session.video_session_id,db,true);await clinical.revokeClinicalActor(session.video_session_id,`office-guest-${guest.id}`,db);}
  await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE id=? AND status IN ('waiting','admitted')`,[guest.id]);
  if(guest.counseling_visit_id){await db.execute("UPDATE counseling_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP())) WHERE id=?",[guest.counseling_visit_id]);const link=await officeEncounterLink(room.id,guest.generation,db);if(link)await markOfficeAttendance(link.counseling_session_id,db);}
  await clinicalAudit({kind:'office',sessionId:room.id,generation:guest.generation,agencyId:room.agencyId,actor:`guest-${guest.id}`,role:'client'},'clinical_guest_left',{visitId:guest.id},db);
 });
 await clinical.retryClinicalDisconnections();
 return {ok:true};
}
export async function officeHistory(room) {
 await assertOfficeAccess(room);
 await closeAbsentVisits(room);
 const [visits]=await pool.execute(`SELECT id,display_name AS displayName,ip_address AS ipAddress,ip_source AS ipSource,admitted_at AS admittedAt,ended_at AS endedAt,duration_seconds AS durationSeconds,status,generation FROM private_virtual_office_visits WHERE room_id=? AND admitted_at IS NOT NULL ORDER BY id DESC LIMIT 100`,[room.id]);
 const durations=await clinical.clinicalAttendance('office',room.id);
 const [links]=await pool.execute('SELECT l.*,s.title FROM virtual_office_encounters l JOIN counseling_sessions s ON s.id=l.counseling_session_id WHERE l.room_id=? ORDER BY l.generation DESC LIMIT 100',[room.id]);
 const mapped=new Set(links.map(l=>Number(l.generation)));
 const combined=visits.filter(v=>!mapped.has(Number(v.generation))).map(v=>({...v,key:`office-${v.id}`,entryMethod:'office_link',mediaDurationSeconds:durations.get(Number(v.id))??null}));
 for(const link of links){const attendance=await scheduledAttendance(link.counseling_session_id);const participants=await scheduledParticipants(link.counseling_session_id,room.agencyId);for(const v of attendance.visits.filter(v=>v.admittedAt)){combined.push({...v,key:`counseling-${v.id}`,generation:link.generation,displayName:participants.find(p=>p.id===v.clientId)?.displayName||'Client',sessionTitle:link.title,appointmentId:link.appointment_id,recordSyncPending:!!link.appointment_id&&link.synced_version<link.attendance_version,durationSeconds:v.endedAt?Math.max(0,Math.floor((new Date(v.endedAt)-new Date(v.admittedAt))/1000)):null,clientConnectedSeconds:attendance.participants.find(p=>p.clientId===v.clientId&&p.visitIds.includes(Number(v.id)))?.durationSeconds??null});}}
 combined.sort((a,b)=>new Date(b.admittedAt)-new Date(a.admittedAt));return {visits:combined.slice(0,150)};
}
export async function officeWorkspaceContext(room, {id,credential} = {}) {
 await assertOfficeAccess(room);
 const [sessions]=await pool.execute('SELECT * FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const session=sessions[0];
 if(!session?.video_session_id) throw fail(409,'Open the office first.');
 const media=await clinical.requireActiveClinicalMedia(session.video_session_id);
 let guest=null;
 if(id !== undefined) {
  if(!Number.isSafeInteger(id)||id<1)throw fail(403,'Admission is required.');
  guest=await guestFor(room,id,credential);
  if(guest.status!=='admitted'||Number(guest.generation)!==Number(session.generation)) throw fail(403,'Admission is required.');
 }
 if(media?.session_kind==='counseling'){
  const link=await officeEncounterLink(room.id,session.generation);
  if(!link)throw fail(409,'The office session link is unavailable.');
  let clientId=null;
  if(guest){const [[v]]=await pool.execute("SELECT client_id FROM counseling_session_visits WHERE id=? AND session_id=? AND status='admitted'",[guest.counseling_visit_id||0,link.counseling_session_id]);if(!v)throw fail(403,'Admission is required.');clientId=v.client_id;}
  else {const participants=await scheduledParticipants(link.counseling_session_id,room.agencyId);if(participants.length===1)clientId=participants[0].id;}
  return {kind:'counseling',sessionId:link.counseling_session_id,generation:0,agencyId:room.agencyId,visitId:guest?.counseling_visit_id,clientId,role:guest?'client':'provider',actor:guest?`office-guest-${guest.id}`:`user-${room.userId}`};
 }
 return {kind:'office',sessionId:room.id,generation:session.generation,agencyId:room.agencyId,visitId:guest?.id,role:guest?'client':'provider',actor:guest?`guest-${guest.id}`:`user-${room.userId}`};
}

async function closeAbsentVisits(room) {
 // Browser heartbeats cannot prove media duration after a crash; close at last contact.
 await pool.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=last_seen_at,duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,last_seen_at))) WHERE room_id=? AND status='waiting' AND (expires_at<=UTC_TIMESTAMP() OR last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE))`,[room.id]);
}

export async function officeHistoryContext(room,generation) {
 if(!Number.isSafeInteger(generation)||generation<1)throw fail(400,'Invalid office visit.');
 await assertOfficeAccess(room);
 const link=await officeEncounterLink(room.id,generation);
 return {historical:true,kind:link?'counseling':'office',sessionId:link?.counseling_session_id||room.id,generation:link?0:generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`};
}

export async function resumeOfficeVisit(room,id,credential) {
 return transaction(async db=>{
  const current=await lockOffice(db,room);await assertOfficeAccess(room,db);
  const guest=await guestFor(room,id,credential,db);
  if(!guest.admitted_at||guest.status!=='ended'||Number(guest.generation)!==Number(current.generation)||!current.video_session_id)throw fail(409,'This visit has ended. Request a new visit.');
  await clinical.requireActiveClinicalMedia(current.video_session_id,db);
  await db.execute("UPDATE private_virtual_office_visits SET status='waiting',last_seen_at=UTC_TIMESTAMP() WHERE id=?",[guest.id]);
  await clinicalAudit({kind:'office',sessionId:room.id,generation:current.generation,agencyId:room.agencyId,actor:`office-guest-${guest.id}`,role:'client'},'clinical_guest_returned',{visitId:guest.id},db);
  return {ok:true,status:'waiting'};
 });
}
