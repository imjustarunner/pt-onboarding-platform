import {randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import {isMentalHealthAgency} from '../services/supervisionAgreement.service.js';
import {hasActiveMeetingMembership} from '../services/meetingJoinPolicy.service.js';
import {finalizeSupervisionSession} from './supervisionSessions.controller.js';
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
const sqlDate=d=>d.toISOString().slice(0,19).replace('T',' ');
export function validateManualSupervision(input) {
  const reason=String(input.reason||'').trim();
  if(reason.length<10||reason.length>2000)fail('Explain why supervision was not performed using platform video (10–2,000 characters).',400);
  if(!['IN_PERSON','PHONE','EXTERNAL_VIDEO'].includes(input.modality))fail('Choose how supervision was performed.',400);
  if(!['individual','group'].includes(input.sessionType||'individual'))fail('Choose individual or group supervision.',400);
  const start=new Date(input.startAt),end=new Date(input.endAt);
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>8*3600000)fail('Enter a valid supervision time of up to eight hours.',400);
  if(input.recordNow!==true && end>Date.now()+60000)fail('Manual logs must describe supervision that has already occurred.',400);
  if(input.recordNow===true && (input.modality!=='IN_PERSON'||Math.abs(start-Date.now())>5*60000))fail('Start an in-person recording at the current time.',400);
  if(!/^[\w-]{8,80}$/.test(input.requestKey||''))fail('A submission id is required.',400);
  return {reason,start,end,modality:input.modality,sessionType:input.sessionType||'individual'};
}
async function assignment(req,assignmentId) {
  const [[a]]=await pool.execute('SELECT * FROM supervisor_assignments WHERE id=?',[assignmentId]);
  if(!a||!['clinical','billing'].includes(a.supervisor_type)||![Number(a.supervisor_id),Number(a.supervisee_id)].includes(Number(req.user.id)))fail('Use your current supervisor assignment.');
  if(!await hasActiveMeetingMembership(a.agency_id,req.user.id)||!await isMentalHealthAgency(a.agency_id))fail('Access denied.');
  return a;
}
export async function listManualSupervision(req,res,next){try{
  const uid=req.query.userId==='me'?req.user.id:Number(req.query.userId||req.user.id),aid=Number(req.query.agencyId);
  if(!aid||!await hasActiveMeetingMembership(aid,req.user.id))fail('Access denied.');
  const [assignments]=await pool.execute(`SELECT sa.*,CONCAT(s.first_name,' ',s.last_name) AS supervisor_name FROM supervisor_assignments sa JOIN users s ON s.id=sa.supervisor_id WHERE sa.agency_id=? AND sa.supervisee_id=? AND (sa.supervisor_id=? OR sa.supervisee_id=?) AND sa.supervisor_type IN ('clinical','billing')`,[aid,uid,req.user.id,req.user.id]);
  if(!assignments.length)return res.json({assignments:[],entries:[]});
  const [entries]=await pool.execute(`SELECT m.*,ss.start_at,ss.end_at,ss.session_type,ss.status FROM supervision_manual_entries m JOIN supervision_sessions ss ON ss.id=m.session_id WHERE m.agency_id=? AND m.supervisee_user_id=? AND (m.supervisor_user_id=? OR m.supervisee_user_id=?) ORDER BY m.created_at DESC LIMIT 100`,[aid,uid,req.user.id,req.user.id]);
  res.set('Cache-Control','no-store').json({assignments,entries,actorUserId:req.user.id});
}catch(e){next(e);}}
export async function createManualSupervision(req,res,next){let db;try{
  const input=validateManualSupervision(req.body),a=await assignment(req,Number(req.body.assignmentId));
  db=await pool.getConnection();await db.beginTransaction();
  // Lock the assignment to serialize retries without creating orphan sessions.
  const [[currentAssignment]]=await db.execute('SELECT * FROM supervisor_assignments WHERE id=? FOR UPDATE',[a.id]);
  if(!currentAssignment||Number(currentAssignment.supervisor_id)!==Number(a.supervisor_id)||Number(currentAssignment.supervisee_id)!==Number(a.supervisee_id))fail('The supervisor assignment changed.',409);
  const [[existing]]=await db.execute('SELECT session_id FROM supervision_manual_entries WHERE agency_id=? AND created_by_user_id=? AND request_key=?',[a.agency_id,req.user.id,req.body.requestKey]);
  if(existing){await db.commit();return res.json({sessionId:existing.session_id,existing:true});}
  const [overlap]=await db.execute(`SELECT ss.id FROM supervision_sessions ss WHERE ss.agency_id=? AND (ss.supervisee_user_id=? OR ss.supervisor_user_id=?) AND ss.status NOT IN ('CANCELLED','MISSED','RESCHEDULED') AND ss.start_at<? AND ss.end_at>? AND (ss.status LIKE 'MANUAL_%' OR EXISTS(SELECT 1 FROM supervision_session_attendance_events ev WHERE ev.session_id=ss.id AND ev.user_id=?)) LIMIT 1`,[a.agency_id,a.supervisee_id,a.supervisor_id,sqlDate(input.end),sqlDate(input.start),a.supervisee_id]);
  if(overlap.length)fail('This supervisee already has a supervision record during that time. Review the existing record to avoid counting hours twice.',409);
  const recording=req.body.recordNow===true;
  const [created]=await db.execute(`INSERT INTO supervision_sessions (agency_id,supervisor_user_id,supervisee_user_id,session_type,start_at,end_at,modality,status,created_by_user_id,notify_participants,waiting_room_enabled,join_token) VALUES (?,?,?,?,?,?,?, ?,?,0,0,?)`,
    [a.agency_id,a.supervisor_id,a.supervisee_id,input.sessionType,sqlDate(input.start),sqlDate(input.end),input.modality,recording?'MANUAL_RECORDING':'MANUAL_PENDING',req.user.id,randomUUID().replaceAll('-','')]);
  const sid=created.insertId;
  await db.execute(`INSERT INTO supervision_manual_entries (session_id,agency_id,supervisor_user_id,supervisee_user_id,created_by_user_id,reason,modality,request_key) VALUES (?,?,?,?,?,?,?,?)`,[sid,a.agency_id,a.supervisor_id,a.supervisee_id,req.user.id,input.reason,input.modality,req.body.requestKey]);
  const compensable=await User.getAgencySupervisionCompensableMap(a.agency_id,[a.supervisee_id]);
  for(const [uid,role] of [[a.supervisor_id,'supervisor'],[a.supervisee_id,'supervisee']]) {
    await db.execute(`INSERT INTO supervision_session_attendees (session_id,user_id,participant_role,status,is_required,is_compensable_snapshot) VALUES (?,?,?,'JOINED',?,?)`,[sid,uid,role,role==='supervisor'||input.sessionType==='individual'||req.body.isRequired===true?1:0,role==='supervisee'&&compensable[uid]&&(input.sessionType==='individual'||req.body.isRequired===true)?1:0]);
    await db.execute(`INSERT INTO supervision_session_attendance_events (session_id,user_id,participant_session_key,event_type,event_at,raw_payload_json) VALUES (?,?,?,'joined',?,?)`,[sid,uid,`manual:${sid}:${uid}`,sqlDate(input.start),JSON.stringify({source:'manual',recordedBy:req.user.id})]);
    if(!recording)await db.execute(`INSERT INTO supervision_session_attendance_events (session_id,user_id,participant_session_key,event_type,event_at,raw_payload_json) VALUES (?,?,?,'left',?,?)`,[sid,uid,`manual:${sid}:${uid}`,sqlDate(input.end),JSON.stringify({source:'manual',recordedBy:req.user.id})]);
  }
  await db.commit();res.status(201).json({sessionId:sid,recording,pendingApproval:true});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}}
export async function finishManualSupervision(req,res,next){let db;try{
  db=await pool.getConnection();await db.beginTransaction();
  const [[m]]=await db.execute('SELECT m.*,ss.status FROM supervision_manual_entries m JOIN supervision_sessions ss ON ss.id=m.session_id WHERE m.session_id=? FOR UPDATE',[req.params.id]);
  if(!m||![Number(m.supervisor_user_id),Number(m.supervisee_user_id)].includes(Number(req.user.id))||!await hasActiveMeetingMembership(m.agency_id,req.user.id))fail('Access denied.');
  if(m.status==='MANUAL_RECORDING'){
    const end=sqlDate(new Date());await db.execute("UPDATE supervision_sessions SET end_at=?,status='MANUAL_PENDING' WHERE id=?",[end,m.session_id]);
    await db.execute("UPDATE meeting_transcription_controls SET paused=1,stopped=1,revision=revision+1 WHERE meeting_type='supervision' AND meeting_id=?",[m.session_id]);
    for(const uid of [m.supervisor_user_id,m.supervisee_user_id])await db.execute(`INSERT INTO supervision_session_attendance_events (session_id,user_id,participant_session_key,event_type,event_at,raw_payload_json) VALUES (?,?,?,'left',?,?)`,[m.session_id,uid,`manual:${m.session_id}:${uid}`,end,JSON.stringify({source:'manual',recordedBy:req.user.id})]);
  }
  if(req.body.approve===true){
    if(Number(req.user.id)!==Number(m.supervisor_user_id))fail('Only the assigned supervisor can approve these hours.');
    const [assigned]=await db.execute("SELECT id FROM supervisor_assignments WHERE supervisor_id=? AND supervisee_id=? AND agency_id=? AND supervisor_type IN ('clinical','billing')",[m.supervisor_user_id,m.supervisee_user_id,m.agency_id]);
    if(!assigned.length)fail('The supervisor assignment changed. Ask the current supervisor to review this entry.',409);
    await db.execute('UPDATE supervision_manual_entries SET approved_at=COALESCE(approved_at,UTC_TIMESTAMP()),approved_by_user_id=? WHERE session_id=?',[req.user.id,m.session_id]);
  }
  await db.commit();
  const approved=req.body.approve===true||!!m.approved_at;
  const result=approved?await finalizeSupervisionSession({sessionId:m.session_id,actorUserId:req.user.id,source:'manual_supervision'}):null;
  res.json({sessionId:m.session_id,pendingApproval:!approved,result});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}}
