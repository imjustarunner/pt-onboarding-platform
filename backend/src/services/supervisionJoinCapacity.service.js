import pool from '../config/database.js';
import {canJoinSupervision} from './meetingJoinPolicy.service.js';

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const capacity=row=>String(row.session_type).toLowerCase()==='group'?24:String(row.session_type).toLowerCase()==='triadic'?3:2;
const person=identity=>{const match=/^(?:user|dial)-(\d+)$/.exec(String(identity || ''));return match?`user-${Number(match[1])}`:String(identity || '');};

/** Carrier bridges retain their place until disconnection is confirmed, even
 * when callbacks are delayed. Browser and telephone for one account count once. */
export async function supervisionJoinOccupancy(sessionId,db=pool) {
 const [presence]=await db.execute(`SELECT p.join_identity FROM supervision_session_join_presence p
  JOIN supervision_sessions s ON s.id=p.session_id WHERE p.session_id=? AND p.left_at IS NULL
   AND p.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 45 SECOND)
   AND (p.join_identity IN (CONCAT('user-',s.supervisor_user_id),CONCAT('dial-',s.supervisor_user_id),
     CONCAT('user-',s.co_facilitator_user_id),CONCAT('dial-',s.co_facilitator_user_id))
    OR EXISTS(SELECT 1 FROM meeting_calendar_guests g WHERE g.meeting_type='supervision'
      AND g.meeting_id=p.session_id AND BINARY p.join_identity=BINARY CONCAT('calendar-guest-',g.id)
      AND g.status='admitted' AND g.expires_at>UTC_TIMESTAMP())
    OR EXISTS(SELECT 1 FROM supervision_session_video_admissions a WHERE a.session_id=p.session_id
     AND (BINARY a.join_identity=BINARY p.join_identity OR (a.user_id IS NOT NULL
      AND p.join_identity REGEXP '^(user|dial)-[0-9]+$' AND a.user_id=CAST(SUBSTRING(p.join_identity,6) AS UNSIGNED)))))`,[sessionId]);
 const [calls]=await db.execute(`SELECT CONCAT('user-',i.user_id) AS join_identity FROM meeting_dial_in_calls c
  JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id WHERE i.meeting_type='supervision' AND i.meeting_id=?
   AND c.disconnected_at IS NULL AND c.state IN ('connecting','connected','ending')
   AND (c.bridge_started_at IS NOT NULL OR c.video_connection_id IS NOT NULL)`,[sessionId]);
 return new Set([...presence,...calls].map(row=>person(row.join_identity)).filter(Boolean));
}

async function withCapacityLock(sid,database,fn) {
 const db=await database.getConnection(),lock=`supervision-join-capacity:${sid}`;let locked=false;
 try{
  const [[held]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);locked=Number(held?.acquired)===1;
  if(!locked)throw fail('Another participant is joining. Please try again.',503);
  return await fn(db);
 }finally{try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}

async function currentSession(sid,db) {
 const [[row]]=await db.execute('SELECT * FROM supervision_sessions WHERE id=?',[sid]);
 if(!row||row.live_ended_at||['CANCELLED','RESCHEDULED','MISSED','FINALIZED','COMPLETED','ENDED','MANUAL_PENDING'].includes(String(row.status).toUpperCase()))throw fail('This supervision session is no longer available.',410);
 return row;
}

async function reservePlace(sid,identity,displayName,isGuest,row,db) {
 const identities=await supervisionJoinOccupancy(sid,db),alreadyPresent=identities.has(person(identity)),limit=capacity(row);
 if(!alreadyPresent&&identities.size>=limit)throw fail('This supervision session is full. A participant can join when a place opens.');
 const [[clock]]=await db.execute('SELECT UNIX_TIMESTAMP() AS reserved_at');
 const reservedAt=Number(clock?.reserved_at);
 if(!Number.isSafeInteger(reservedAt)||reservedAt<1)throw fail('Unable to reserve a meeting place. Please try again.',503);
 await db.execute(`INSERT INTO supervision_session_join_presence(session_id,join_identity,display_name,is_guest,joined_at,last_seen_at,left_at)
   VALUES(?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),NULL) ON DUPLICATE KEY UPDATE
   joined_at=IF(left_at IS NULL,joined_at,UTC_TIMESTAMP()),last_seen_at=UTC_TIMESTAMP(),left_at=NULL,
   display_name=COALESCE(VALUES(display_name),display_name)`,[sid,identity,displayName,isGuest?1:0]);
 return {alreadyPresent,activeCount:identities.size+(alreadyPresent?0:1),maxParticipants:limit,tokenExpiresAt:reservedAt+40};
}

export async function reserveSupervisionJoin({sessionId,userId,joinIdentity,displayName=null,matchesOpenAudience,expectedRole=null},database=pool) {
 const sid=Number(sessionId),uid=Number(userId),identity=String(joinIdentity || '');
 if(!Number.isSafeInteger(sid)||sid<1||!Number.isSafeInteger(uid)||uid<1||!([`user-${uid}`,`dial-${uid}`].includes(identity)))throw fail('An account-bound participant is required.',403);
 return withCapacityLock(sid,database,async db=>{
  const row=await currentSession(sid,db);
  if(!await canJoinSupervision(row,uid,matchesOpenAudience))throw fail('Current supervision invitation is required.',403);
  if(expectedRole!==null){
   const host=[row.supervisor_user_id,row.co_facilitator_user_id].some(id=>Number(id)===uid);
   const [presenters]=host?[[]]:await db.execute('SELECT 1 FROM supervision_session_presenters WHERE session_id=? AND user_id=? LIMIT 1',[sid,uid]);
   const role=host?'supervisor':presenters.length?'presenter':'supervisee';
   if(role!==expectedRole)throw fail('Your meeting role changed. Please refresh and join again.');
  }
  // Admission and presence are written while the shared capacity lock is held.
  const result=await reservePlace(sid,identity,displayName,false,row,db);
  await db.execute(`INSERT INTO supervision_session_video_admissions(session_id,user_id,join_identity) VALUES(?,?,?)
   ON DUPLICATE KEY UPDATE admitted_at=admitted_at`,[sid,uid,identity]);
  return result;
 });
}

/** A calendar visit is a distinct guest, never an account inferred from a name.
 * Only the saved credential or a current session host can reserve its place. */
export async function reserveSupervisionCalendarGuest({sessionId,guestId,credentialHash=null,hostUserId=null,leave=false},database=pool) {
 const sid=Number(sessionId),gid=Number(guestId),host=Number(hostUserId);
 if(!Number.isSafeInteger(sid)||sid<1||!Number.isSafeInteger(gid)||gid<1||(!/^[a-f0-9]{64}$/.test(String(credentialHash||''))&&!(Number.isSafeInteger(host)&&host>0)))throw fail('A current guest credential is required.',403);
 return withCapacityLock(sid,database,async db=>{
  const row=await currentSession(sid,db);
  const [[guest]]=await db.execute(`SELECT * FROM meeting_calendar_guests WHERE id=? AND meeting_type='supervision'
    AND meeting_id=? AND expires_at>UTC_TIMESTAMP()`,[gid,sid]);
  if(!guest||guest.status==='left')throw fail('Request admission again.',403);
  if(host>0){
   if(![row.supervisor_user_id,row.co_facilitator_user_id].some(id=>Number(id)===host)||!await canJoinSupervision(row,host))throw fail('Host access required.',403);
   if(guest.status!=='waiting')throw fail('Guest is no longer waiting.',409);
  }else if(guest.credential_hash!==credentialHash)throw fail('Request admission again.',403);
  const identity=`calendar-guest-${gid}`;
  if(leave){
   await db.execute("UPDATE meeting_calendar_guests SET status='left',last_seen_at=UTC_TIMESTAMP() WHERE id=?",[gid]);
   await db.execute('UPDATE supervision_session_join_presence SET left_at=UTC_TIMESTAMP(),last_seen_at=UTC_TIMESTAMP() WHERE session_id=? AND join_identity=?',[sid,identity]);
   return {status:'left'};
  }
  const open=[0,false,'0','false'].includes(row.waiting_room_enabled);
  if(guest.status!=='admitted'&&!host&&!open)throw fail('Wait for the host to admit you.',403);
  const result=await reservePlace(sid,identity,`${guest.display_name} (Guest)`,true,row,db);
  await db.execute("UPDATE meeting_calendar_guests SET status='admitted',last_seen_at=UTC_TIMESTAMP() WHERE id=?",[gid]);
  return {...result,status:'admitted'};
 });
}
