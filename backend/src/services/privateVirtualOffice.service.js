import crypto from 'node:crypto';
import pool from '../config/database.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { getMeetingPlan } from './meetingAccessPlan.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import Video from './vonageVideo.service.js';
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
 let room = await ProviderMyRoom.findByUserId(userId);
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
export async function joinOffice(room, {displayName,photoDataUrl,photoRequiredAck}) {
 await assertOfficeAccess(room);
 const name = String(displayName || '').trim().slice(0,120);
 if (!name || photoRequiredAck !== true) throw fail(400,'Enter your name and confirm the photo can be shown to the provider.');
 const photo = JSON.stringify(encryptChatText(snapshotDataUrl(photoDataUrl)));
 const credential = crypto.randomBytes(32).toString('base64url');
 const [result] = await pool.execute(`INSERT INTO private_virtual_office_visits (room_id,credential_hash,display_name,photo_envelope,expires_at)
 VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))`,[room.id,officeCredentialHash(credential),name,photo]);
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
 return {id:guest.id,status:guest.status,guestDisplayName:guest.display_name};
}
export async function officeLobby(room) {
 const plan = await assertOfficeAccess(room);
 // Photos are encrypted at rest, returned only to the owning provider, and discarded after the visit.
 await pool.execute(`UPDATE private_virtual_office_visits SET photo_envelope=NULL,status=IF(status='waiting','dismissed',status) WHERE room_id=? AND expires_at<=UTC_TIMESTAMP()`,[room.id]);
 const [rows] = await pool.execute(`SELECT id,display_name,status,photo_envelope FROM private_virtual_office_visits WHERE room_id=? AND status IN ('waiting','admitted') AND expires_at>UTC_TIMESTAMP() ORDER BY created_at`,[room.id]);
 return {plan,waiting:rows.filter(r=>r.status==='waiting').map(r=>({id:r.id,guestDisplayName:r.display_name,guestPhotoUrl:r.photo_envelope?decryptChatText(JSON.parse(r.photo_envelope)):null})),admitted:rows.filter(r=>r.status==='admitted').map(r=>({id:r.id,guestDisplayName:r.display_name}))};
}
export async function admitOfficeGuest(room,id) {
 return transaction(async db=> {
  const session = await lockOffice(db,room);
  const plan = await assertOfficeAccess(room,db);
  if (!session.video_session_id || !session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000) throw fail(409,'Open your office video before admitting a guest.');
  const [rows] = await db.execute(`SELECT * FROM private_virtual_office_visits WHERE id=? AND room_id=? AND status='waiting' AND expires_at>UTC_TIMESTAMP() FOR UPDATE`,[id,room.id]);
  if (!rows[0]?.photo_envelope) throw fail(409,'The guest must take a new snapshot and request admission.');
  const [counts] = await db.execute(`SELECT COUNT(*) total FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND status='admitted'`,[room.id,session.generation]);
  if (!plan.multipleOfficeGuests && Number(counts[0].total)>=1) throw fail(409,'Premium includes one guest. End this visit first, or use Premium Plus for couples and families.');
  await db.execute(`UPDATE private_virtual_office_visits SET status='admitted',generation=?,admitted_at=UTC_TIMESTAMP() WHERE id=?`,[session.generation,id]);
  return {ok:true};
 });
}
export async function dismissOfficeGuest(room,id) {
 await assertOfficeAccess(room);
 const [result] = await pool.execute(`UPDATE private_virtual_office_visits SET status='dismissed',photo_envelope=NULL WHERE id=? AND room_id=? AND status='waiting'`,[id,room.id]);
 if (!result.affectedRows) throw fail(409,'Only a waiting guest can be dismissed. End the office visit to disconnect admitted guests.');
 return {ok:true};
}
function videoCredentials(sessionId,identity,displayName,isHost) {
 if (!Video.isVideoConfigured()) throw fail(503,'Video is not configured.');
 // Short connection window. Every new token requires live admission and current entitlement.
 const token = Video.generateToken(sessionId,{expireTime:Math.floor(Date.now()/1000)+60,data:JSON.stringify({identity,displayName,role:isHost?'host':'participant',roleLabel:isHost?'Provider':'Guest'})});
 return {sessionId,token,applicationId:resolveVideoProjectId(),localName:displayName,isHost};
}
export async function officeHostVideo(room) {
 return transaction(async db=>{
  const session = await lockOffice(db,room); await assertOfficeAccess(room,db);
  let sid = session.video_session_id;
  if (sid && (!session.host_seen_at || Date.now()-new Date(session.host_seen_at).getTime()>90000)) {
   await Video.endLiveSession(sid,{reason:'office_visit_ended'});
   await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL WHERE room_id=? AND status='admitted'`,[room.id]);
   sid=null;
  }
  if (!sid) {
   if (!Video.isVideoConfigured()) throw fail(503,'Video is not configured.');
   sid = await Video.createSession();
   await db.execute('UPDATE private_virtual_office_sessions SET video_session_id=?,generation=generation+1 WHERE room_id=?',[sid,room.id]);
  }
  await db.execute('UPDATE private_virtual_office_sessions SET host_seen_at=UTC_TIMESTAMP() WHERE room_id=?',[room.id]);
  return videoCredentials(sid,`user-${room.userId}`,room.displayName || 'Provider',true);
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
  return videoCredentials(session.video_session_id,`office-guest-${guest.id}`,`${guest.display_name} (Guest)`,false);
 });
}
export async function endOffice(room) {
 return transaction(async db=>{
  const session = await lockOffice(db,room);
  // Keep the stable URL; retire the video session so old guest tokens can never enter the next visit.
  if (session.video_session_id) await Video.endLiveSession(session.video_session_id,{reason:'office_visit_ended'});
  await db.execute('UPDATE private_virtual_office_sessions SET video_session_id=NULL,host_seen_at=NULL WHERE room_id=?',[room.id]);
  await db.execute(`UPDATE private_virtual_office_visits SET status='ended',photo_envelope=NULL WHERE room_id=? AND status='admitted'`,[room.id]);
  return {ok:true};
 });
}
