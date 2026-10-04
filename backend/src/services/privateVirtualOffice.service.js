import crypto from 'node:crypto';
import pool from '../config/database.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
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
 if (!room?.isActive || !await hasActiveMeetingMembership(room.agencyId,room.userId)) throw fail(404,'This office is unavailable.');
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
export async function officeGuestStatus(room,id,credential) {
 await assertOfficeAccess(room);
 const guest = await guestFor(room,id,credential);
 await pool.execute('UPDATE private_virtual_office_visits SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[guest.id]);
 const [sessions] = await pool.execute('SELECT host_seen_at FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 return {id:guest.id,status:guest.status,guestDisplayName:guest.display_name,hostPresent:!!sessions[0]?.host_seen_at && Date.now()-new Date(sessions[0].host_seen_at).getTime()<90000};
}
export async function officeLobby(room,req) {
 const plan = await assertOfficeAccess(room);
 await closeAbsentVisits(room);
 // Photos are encrypted at rest, returned only to the owning provider, and discarded after the visit.
 await pool.execute(`UPDATE private_virtual_office_visits SET photo_envelope=NULL,status=IF(status='waiting','dismissed',status) WHERE room_id=? AND expires_at<=UTC_TIMESTAMP()`,[room.id]);
 const [officeSessions]=await pool.execute('SELECT * FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const current=officeSessions[0];
 const media=current?.video_session_id?await clinical.clinicalMedia(current.video_session_id):null;
 const [[previous]]=await pool.execute('SELECT COUNT(*) total FROM private_virtual_office_visits WHERE room_id=? AND generation=?',[room.id,current?.generation||0]);
 const encounter={state:media?.state||'idle',hasParticipants:Number(previous.total)>0,generation:current?.generation||0};
 const [rows] = await pool.execute(`SELECT id,display_name,status,photo_envelope,admitted_at,ip_address FROM private_virtual_office_visits WHERE room_id=? AND status IN ('waiting','admitted') AND expires_at>UTC_TIMESTAMP() ORDER BY created_at`,[room.id]);
 if(rows.length)await clinicalAudit({kind:'office',sessionId:room.id,generation:current?.generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,req},'clinical_lobby_read',{visitIds:rows.map(r=>r.id)});
 return {plan,encounter,waiting:rows.filter(r=>r.status==='waiting').map(r=>({id:r.id,guestDisplayName:r.display_name,guestPhotoUrl:r.photo_envelope?decryptChatText(JSON.parse(r.photo_envelope)):null})),admitted:rows.filter(r=>r.status==='admitted').map(r=>({id:r.id,guestDisplayName:r.display_name,admittedAt:r.admitted_at,ipAddress:r.ip_address}))};
}
export async function admitOfficeGuest(room,id,{sameEncounter=false,req}={}) {
 return transaction(async db=> {
  const session = await lockOffice(db,room);
  const plan = await assertOfficeAccess(room,db);
  if (!session.video_session_id || !session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000) throw fail(409,'Open your office video before admitting a guest.');
  const [rows] = await db.execute(`SELECT * FROM private_virtual_office_visits WHERE id=? AND room_id=? AND status='waiting' AND expires_at>UTC_TIMESTAMP() FOR UPDATE`,[id,room.id]);
  if (!rows[0]) throw fail(409,'This guest is no longer waiting.');
  await clinical.requireMonitoredProvider(session.video_session_id,db);
  const [counts] = await db.execute(`SELECT COUNT(*) total,SUM(status='admitted') present FROM private_virtual_office_visits WHERE room_id=? AND generation=?`,[room.id,session.generation]);
  if (Number(counts[0].total)>0 && !(sameEncounter===true && Number(counts[0].present)>0 && plan.multipleOfficeGuests)) throw fail(409,'End this session before admitting a new client. Only intended couples or family participants may join the current session.');
  if (!plan.multipleOfficeGuests && Number(counts[0].total)>=1) throw fail(409,'Premium includes one guest. End this visit first, or use Premium Plus for couples and families.');
  await db.execute(`UPDATE private_virtual_office_visits SET status='admitted',generation=?,admitted_at=UTC_TIMESTAMP(),last_seen_at=UTC_TIMESTAMP(),expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE id=?`,[session.generation,id]);
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
export async function officeHostVideo(room) {
 return transaction(async db=>{
  const session = await lockOffice(db,room); await assertOfficeAccess(room,db);
  let sid = session.video_session_id;
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
  await db.execute('UPDATE private_virtual_office_sessions SET host_seen_at=UTC_TIMESTAMP() WHERE room_id=?',[room.id]);
  return videoCredentials(sid,`user-${room.userId}`,room.displayName || 'Provider',true,db);
 });
}
export async function officeHostHeartbeat(room) {
 await assertOfficeAccess(room);
 await pool.execute('UPDATE private_virtual_office_sessions SET host_seen_at=UTC_TIMESTAMP() WHERE room_id=? AND video_session_id IS NOT NULL',[room.id]);
 return {ok:true};
}
export async function officeGuestVideo(room,id,credential) {
 return transaction(async db=>{
  const session = await lockOffice(db,room); await assertOfficeAccess(room,db);
  const guest = await guestFor(room,id,credential,db);
  if (guest.status!=='admitted' || Number(guest.generation)!==Number(session.generation) || !session.video_session_id || !session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000) throw fail(403,'Wait for the provider to admit you.');
  return videoCredentials(session.video_session_id,`office-guest-${guest.id}`,`${guest.display_name} (Guest)`,false,db,guest.id);
 });
}
export async function endOffice(room,req) {
 const sid=await transaction(async db=>{
  const session=await lockOffice(db,room);
  if (!session.video_session_id) return null;
  await clinical.requestClinicalEnd(session.video_session_id,req,db);
  await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=UTC_TIMESTAMP(),duration_seconds=GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP())) WHERE room_id=? AND status='admitted'`,[room.id]);
  return session.video_session_id;
 });
 return sid ? clinical.finishClinicalEnd(sid) : {ok:true,state:'ended'};
}

export async function leaveOffice(room,id,credential) {
 await transaction(async db=>{
  const session=await lockOffice(db,room);
  const guest=await guestFor(room,id,credential,db);
  if(session.video_session_id){await clinical.clinicalMedia(session.video_session_id,db,true);await clinical.revokeClinicalActor(session.video_session_id,`office-guest-${guest.id}`,db);}
  await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE id=? AND status IN ('waiting','admitted')`,[guest.id]);
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
 return {visits:visits.map(v=>({...v,mediaDurationSeconds:durations.get(Number(v.id))??null}))};
}
export async function officeWorkspaceContext(room, {id,credential} = {}) {
 await assertOfficeAccess(room);
 const [sessions]=await pool.execute('SELECT * FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const session=sessions[0];
 if(!session?.video_session_id) throw fail(409,'Open the office first.');
 await clinical.requireActiveClinicalMedia(session.video_session_id);
 let guest=null;
 if(id !== undefined) {
  if(!Number.isSafeInteger(id)||id<1)throw fail(403,'Admission is required.');
  guest=await guestFor(room,id,credential);
  if(guest.status!=='admitted'||Number(guest.generation)!==Number(session.generation)) throw fail(403,'Admission is required.');
 }
 return {kind:'office',sessionId:room.id,generation:session.generation,agencyId:room.agencyId,visitId:guest?.id,role:guest?'client':'provider',actor:guest?`guest-${guest.id}`:`user-${room.userId}`};
}

async function closeAbsentVisits(room) {
 // Browser heartbeats cannot prove media duration after a crash; close at last contact.
 await pool.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL,ended_at=last_seen_at,duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,last_seen_at))) WHERE room_id=? AND status='waiting' AND (expires_at<=UTC_TIMESTAMP() OR last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE))`,[room.id]);
}
