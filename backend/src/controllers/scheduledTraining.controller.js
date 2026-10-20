import { canViewDeclinedMeetingParticipants, visibleMeetingRsvpParticipants } from '../services/meetingRsvpVisibility.js';
import { saveTrainingRsvp, saveOpenTrainingRsvp } from '../services/scheduledTrainingRsvp.service.js';
import { trainingReminderDescription } from '../services/meetingReminderPolicy.js';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { createScheduledTraining, trainingRoster, trainingAccess, trainingError } from '../services/scheduledTraining.service.js';
import { hasActiveMeetingMembership } from '../services/meetingJoinPolicy.service.js';
import Storage from '../services/storage.service.js';
import Vonage from '../services/vonageVideo.service.js';
export const getTrainingRoster = async(req,res,next) => { try { res.json({people:await trainingRoster(Number(req.query.agencyId),req.user)}); } catch(e){next(e);} };
export const createTraining = async(req,res,next) => { try { const {seedKey,...input}=req.body; res.status(201).json(await createScheduledTraining(input,req.user)); } catch(e){next(e);} };
export const getTraining = async(req,res,next) => {
  try {
    const {event,proctor}=await trainingAccess(Number(req.params.eventId),req.user,{visible:true});
    const [assets]=await pool.execute(`SELECT a.id,a.filename,a.size_bytes,a.created_at FROM scheduled_training_assets a JOIN scheduled_trainings t ON t.event_id=a.event_id WHERE t.series_key=? ORDER BY a.created_at`,[event.series_key]);
    const [hands]=await pool.execute(`SELECT h.user_id,h.status,h.raised_at,CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) name FROM scheduled_training_hands h JOIN users u ON u.id=h.user_id WHERE h.event_id=? AND (?=1 OR h.user_id=?) ORDER BY h.raised_at`,[event.id,Number(proctor),req.user.id]);
    const [log]=await pool.execute('SELECT * FROM scheduled_training_logs WHERE event_id=? AND user_id=?',[event.id,req.user.id]);
    const [participants]=await pool.execute(`SELECT u.id,CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) name,(u.id=?) isHost,COALESCE(p.is_required,0) is_required,COALESCE(p.is_cohost,0) is_cohost,COALESCE(p.rsvp,'pending') rsvp,p.rsvp_decline_reason FROM users u LEFT JOIN meeting_participant_preferences p ON p.event_id=? AND p.user_id=u.id WHERE u.id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=? AND a.user_id=u.id)`,[event.provider_id,event.id,event.provider_id,event.id]);
    let self=participants.find(p=>Number(p.id)===Number(req.user.id));
    if(!self){const [preferences]=await pool.execute('SELECT user_id AS id,rsvp,is_required,is_cohost,rsvp_decline_reason FROM meeting_participant_preferences WHERE event_id=? AND user_id=?',[event.id,req.user.id]);self=preferences[0] || null;}
    const canSeeDeclined = canViewDeclinedMeetingParticipants(event,req.user,participants);
    const visibleParticipants = visibleMeetingRsvpParticipants(participants,canSeeDeclined);
    const [approvals]=await pool.execute("SELECT user_id FROM scheduled_training_hands WHERE event_id=? AND status='approved'",[event.id]);
    res.json({viewerUserId:Number(req.user.id),viewerInvitation:self || null,invited:proctor || !!event.actor_invited,canRegister:!proctor && (!!event.actor_invited || !!event.agency_visible),reminderDescription:trainingReminderDescription(event,{isRequired:Number(self?.is_required)===1}),approvedIds:approvals.map(p=>Number(p.user_id)),event:{id:event.id,title:event.title,topic:event.topic,startAt:event.start_at,endAt:event.end_at,timeZone:event.event_timezone,agencyVisible:!!event.agency_visible,videoDefaultOn:!!event.video_default_on,videoAllowed:!!event.video_allowed,muteAll:!!event.mute_all},proctor,assets,hands,log:log[0] || null,participants:visibleParticipants,canSeeDeclined});
  }catch(e){next(e);}
};
export const updateTraining = async(req,res,next) => {
  try {
    const {event}=await trainingAccess(Number(req.params.eventId),req.user,{edit:true});
    const sets=[],values=[];
    for(const [key,column] of Object.entries({agencyVisible:'agency_visible',videoDefaultOn:'video_default_on',videoAllowed:'video_allowed',muteAll:'mute_all'})) {
      if(req.body[key]!==undefined) { if(typeof req.body[key]!=='boolean') throw trainingError(400,`${key} must be true or false.`); sets.push(`${column}=?`);values.push(Number(req.body[key])); }
    }
    if(req.body.topic!==undefined){if(typeof req.body.topic!=='string'||req.body.topic.length>4000)throw trainingError(400,'Topic must be at most 4,000 characters.');sets.push('topic=?');values.push(req.body.topic);}
    if(req.body.topic!==undefined)await pool.execute('UPDATE provider_schedule_events SET description=? WHERE id=?',[req.body.topic,event.id]);
    if(sets.length)await pool.execute(`UPDATE scheduled_trainings SET ${sets.join(',')} WHERE event_id=?`,[...values,event.id]);
    // A new mute-all revokes every prior hand approval, including absent/reconnecting participants.
    if(req.body.muteAll===true)await pool.execute("UPDATE scheduled_training_hands SET status='lowered',resolved_at=UTC_TIMESTAMP(),resolved_by_user_id=? WHERE event_id=? AND status='approved'",[req.user.id,event.id]);
    if(event.twilio_room_sid)await Vonage.sendSignal(event.twilio_room_sid,{type:'training_state_changed',data:'{}'}).catch(()=>{});
    res.json({ok:true});
  }catch(e){next(e);}
};
export const trainingHand = async(req,res,next) => {
  try {
    const {event,proctor}=await trainingAccess(Number(req.params.eventId),req.user);
    if(event.status!=='ACTIVE'||event.meeting_completed_at)throw trainingError(409,'This training has ended.');
    const action=req.body.action;const target=Number(req.body.userId || req.user.id);
    if(['raise','lower'].includes(action)) {
      if(target!==Number(req.user.id))throw trainingError(403,'You may only raise or lower your own hand.');
      await pool.execute(`INSERT INTO scheduled_training_hands (event_id,user_id,status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),raised_at=UTC_TIMESTAMP(),resolved_at=NULL,resolved_by_user_id=NULL`,[event.id,target,action==='raise'?'raised':'lowered']);
    } else if(['allow','mute'].includes(action)) {
      if(!proctor)throw trainingError(403,'Only a proctor may change speaker permissions.');
      const [[person]]=await pool.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=? AND user_id=?',[event.id,target]);
      if(!person || !await hasActiveMeetingMembership(event.agency_id,target))throw trainingError(400,'Choose an invited attendee.');
      await pool.execute(`INSERT INTO scheduled_training_hands (event_id,user_id,status,resolved_by_user_id,resolved_at) VALUES (?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),resolved_by_user_id=VALUES(resolved_by_user_id),resolved_at=UTC_TIMESTAMP()`,[event.id,target,action==='allow'?'approved':'lowered',req.user.id]);
    } else if(['approve','deny'].includes(action)) {
      if(!proctor)throw trainingError(403,'Only the proctor or coproctors can respond to raised hands.');
      const [result]=await pool.execute("UPDATE scheduled_training_hands SET status=?,resolved_by_user_id=?,resolved_at=UTC_TIMESTAMP() WHERE event_id=? AND user_id=? AND status='raised'",[action==='approve'?'approved':'denied',req.user.id,event.id,target]);
      if(!result.affectedRows)throw trainingError(409,'This hand is no longer raised.');
    }else throw trainingError(400,'Invalid hand action.');
    if(event.twilio_room_sid)await Vonage.sendSignal(event.twilio_room_sid,{type:'training_state_changed',data:'{}'}).catch(()=>{});
    res.json({ok:true});
  }catch(e){next(e);}
};
export const uploadTrainingAsset = async(req,res,next) => {
  let key;
  try {
    const {event}=await trainingAccess(Number(req.params.eventId),req.user,{edit:true});
    if(!req.file?.buffer?.length)throw trainingError(400,'Choose a document or asset (up to 25 MB).');
    const filename=String(req.file.originalname || 'training-asset').replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
    key=`private/training/${event.agency_id}/${event.id}/${randomUUID()}`;
    await Storage.writeObject(key,req.file.buffer,'application/octet-stream');
    const [result]=await pool.execute('INSERT INTO scheduled_training_assets (event_id,storage_key,filename,content_type,size_bytes,uploaded_by_user_id) VALUES (?,?,?,?,?,?)',[event.id,key,filename,req.file.mimetype || 'application/octet-stream',req.file.size,req.user.id]);
    res.status(201).json({id:result.insertId,filename});
  }catch(e){if(key)await Storage.deleteObject(key).catch(()=>{});next(e);}
};
export const downloadTrainingAsset = async(req,res,next) => {
  try {
    const {event}=await trainingAccess(Number(req.params.eventId),req.user,{visible:true});
    const [rows]=await pool.execute(`SELECT a.* FROM scheduled_training_assets a JOIN scheduled_trainings t ON t.event_id=a.event_id WHERE a.id=? AND t.series_key=?`,[Number(req.params.assetId),event.series_key]);
    if(!rows[0])throw trainingError(404,'Asset not found.');
    const buffer=await Storage.readObject(rows[0].storage_key);
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.attachment(rows[0].filename).type('application/octet-stream').send(buffer);
  }catch(e){next(e);}
};
export const deleteTrainingAsset = async(req,res,next) => {
  try {
    const {event}=await trainingAccess(Number(req.params.eventId),req.user,{edit:true});
    const [rows]=await pool.execute(`SELECT a.* FROM scheduled_training_assets a JOIN scheduled_trainings t ON t.event_id=a.event_id WHERE a.id=? AND t.series_key=?`,[Number(req.params.assetId),event.series_key]);
    if(!rows[0])throw trainingError(404,'Asset not found.');
    await Storage.deleteObject(rows[0].storage_key);
    await pool.execute('DELETE FROM scheduled_training_assets WHERE id=?',[rows[0].id]);res.json({ok:true});
  }catch(e){next(e);}
};
export const trainingLogs = async(req,res,next) => {
  try {
    const agencyId=Number(req.query.agencyId);
    if(!await hasActiveMeetingMembership(agencyId,req.user.id))throw trainingError(403,'Access denied.');
    const [logs]=await pool.execute(`SELECT l.*,e.title,e.start_at,e.event_timezone FROM scheduled_training_logs l JOIN provider_schedule_events e ON e.id=l.event_id
      WHERE l.agency_id=? AND l.user_id=? AND l.attendance_seconds>0 ORDER BY e.start_at DESC LIMIT 250`,[agencyId,req.user.id]);res.json({logs});
  }catch(e){next(e);}
};
export const trainingCalendar = async(req,res,next) => {
 try{
  const agencyId=Number(req.query.agencyId);
  if(['client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate'].includes(String(req.user.role || '').toLowerCase()))throw trainingError(403,'Staff access required.');
  if(!await hasActiveMeetingMembership(agencyId,req.user.id))throw trainingError(403,'Access denied.');
  const [events]=await pool.execute(`SELECT e.id,e.title,e.start_at,e.end_at,e.event_timezone,
    (e.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?)) invited
    FROM scheduled_trainings t JOIN provider_schedule_events e ON e.id=t.event_id WHERE e.agency_id=? AND e.status='ACTIVE' AND e.end_at>UTC_TIMESTAMP()
    AND (t.agency_visible=1 OR e.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?)) ORDER BY e.start_at LIMIT 120`,[req.user.id,req.user.id,agencyId,req.user.id,req.user.id]);res.json({events});
 }catch(e){next(e);}
};

export const trainingRsvp = async(req,res,next) => {
 try {
  const {event,proctor}=await trainingAccess(Number(req.params.eventId),req.user,{visible:true});
  res.json(event.actor_invited || proctor
    ? await saveTrainingRsvp(event,req.user.id,req.body.response,req.body.reason)
    : await saveOpenTrainingRsvp(event.id,req.user.id,req.body.response));
 }catch(e){next(e);}
};
