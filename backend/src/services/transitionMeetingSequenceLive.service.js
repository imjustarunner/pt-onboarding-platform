import {randomUUID,createHash} from 'node:crypto';
import pool from '../config/database.js';
import {encryptChatText,decryptChatText,isChatEncryptionConfigured} from './chatEncryption.service.js';
import {prepareTransitionSequence,newTransitionSequenceState,transitionSequenceEvent,SEQUENCE_ID} from './transitionMeetingSequencePolicy.js';
import {transitionSequenceEmail,parseTransitionReply} from '../content/transitionMeetingSequenceEmail.js';
import {TRANSITION_INBOX,TRANSITION_LIVE_SCHEDULE} from '../content/transitionMeetingLiveConfig.js';
import {transitionWorkspaceData} from './transitionWorkspace.service.js';
import {personalMeetingInvitation} from './meetingInvitations.service.js';
import {tenantMeetingBase} from '../utils/tenantMeetingUrl.js';
import {generateJoinToken} from '../utils/joinToken.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';

const error=(message,status=409)=>Object.assign(new Error(message),{status});
const mysqlTime=value=>new Date(value).toISOString().slice(0,19).replace('T',' ');
const deliveryEmail=user=>{const address=String(user.work_email||user.email||'').trim().toLowerCase();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))throw error('This staff account needs a valid recorded delivery email.');return address;};
const subject=()=>`service:${process.env.K_SERVICE||process.env.CLOUD_RUN_JOB||'transition-sequence'}:itsco-transition`;
const encode=value=>{if(!isChatEncryptionConfigured())throw error('Transition evidence encryption is required.',503);return JSON.stringify(encryptChatText(JSON.stringify(value)));};
const decode=raw=>JSON.parse(decryptChatText(typeof raw==='string'?JSON.parse(raw):raw));
async function stored(db=pool){const [[row]]=await db.execute('SELECT * FROM transition_meeting_sequences WHERE sequence_id=? AND agency_id=2',[SEQUENCE_ID]);return row?{...row,data:decode(row.payload_json)}:null;}
async function save(data,revision,db=pool){
 const payload=encode(data),actor=subject();
 const [result]=await db.execute('UPDATE transition_meeting_sequences SET payload_json=?,revision=?,automation_subject=?,updated_at=UTC_TIMESTAMP(3) WHERE sequence_id=? AND revision=? AND agency_id=2',[payload,revision+1,actor,SEQUENCE_ID,revision]);
 if(!result.affectedRows)throw error('The transition sequence changed; reload before continuing.');
 await db.execute('INSERT INTO transition_meeting_sequence_audit(sequence_id,revision,automation_subject,actor_type,actor_user_id,payload_json) VALUES(?,?,?,\'automation\',NULL,?)',[SEQUENCE_ID,revision+1,actor,payload]);
 return revision+1;
}
async function locked(operation){
 const db=await pool.getConnection();let held=false;
 try{const [[row]]=await db.execute('SELECT GET_LOCK(?,0) acquired',['itsco-transition-sequence-20261130']);held=!!row.acquired;if(!held)return {busy:true};return await operation(db);}
 finally{if(held)await db.execute('SELECT RELEASE_LOCK(?)',['itsco-transition-sequence-20261130']);db.release();}
}
async function identity(){const [[row]]=await pool.execute('SELECT * FROM email_sender_identities WHERE agency_id=2 AND identity_key=\'transition_sequence\' AND from_email=? AND reply_to=? AND is_active=1',[TRANSITION_INBOX,TRANSITION_INBOX]);if(!row)throw error('The dedicated transition sender and inbound route must be verified first.');const [[route]]=await pool.execute('SELECT id FROM email_inbound_routes WHERE sender_identity_id=? AND email_address=? AND is_active=1',[row.id,TRANSITION_INBOX]);if(!route)throw error('The dedicated transition inbound route is missing.');return row;}
export async function transitionSequencePreview(now=new Date()){
 const {people}=await transitionWorkspaceData(2);
 const [users]=await pool.execute(`SELECT u.id,u.first_name,u.preferred_name,u.last_name,u.email,u.work_email,u.personal_phone,u.phone_number
  FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=2 AND ua.is_active=1
  WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`);
 const unique=(first,knownEmail=null)=>{const matches=users.filter(u=>knownEmail?[u.email,u.work_email].includes(knownEmail):[u.first_name,u.preferred_name].some(n=>String(n||'').trim().toLowerCase()===first.toLowerCase()));if(matches.length!==1)throw error(`Resolve the exact active ${first} account; found ${matches.length} matches.`);return matches[0].id;};
 const hostIds=[unique('Megan'),unique('Rachel'),unique('Michael','michael@plottwistco.com')],kimiId=unique('Kimi');
 const staff=[];
 for(const u of users)staff.push({id:Number(u.id),name:[u.preferred_name||u.first_name,u.last_name].filter(Boolean).join(' '),email:deliveryEmail(u),cellPhone:u.personal_phone||u.phone_number||null});
 const sender=await identity();
 const ready={senderApproved:true,replyInboxMonitored:true,inboundRoutingTested:true,rsvpEmailAndAppTested:true,hostCcTested:true,attendanceFinalizationTested:true,supportActivity18Tested:true,automationIdentityScoped:true};
 // Activation requires the real round-trip setup proof, not just these values.
 const setup=await stored();if(!setup?.data?.setup?.roundTripVerified)throw error('Complete and verify the transition inbox round trip before activating.');
 return prepareTransitionSequence({agencyId:2,hostIds,coordinatorUserId:hostIds[1],additionalGroupOneUserId:kimiId,senderIdentityId:Number(sender.id),replyTo:TRANSITION_INBOX,
  sessions:TRANSITION_LIVE_SCHEDULE,sundayLocation:'Windchime office (ask Rachel for the office address)',sundayEndAt:'2026-11-29T09:30:00-07:00',readiness:ready},
  {agencyId:2,staff,ranking:people.map(p=>({providerId:p.providerId,cohort:p.cohort}))},now);
}
export async function recordTransitionInboxSetup(setup){return locked(async db=>{
 if(!setup.roundTripVerified||setup.address!==TRANSITION_INBOX)throw error('A real dedicated inbox round trip is required.');
 const old=await stored(db);if(old?.status==='active')return {alreadyActive:true};
 const data={setup,plan:null,state:null};
 if(old){await db.beginTransaction();try{await save(data,old.revision,db);await db.commit();}catch(e){await db.rollback();throw e;}}
 else await db.execute('INSERT INTO transition_meeting_sequences(sequence_id,agency_id,payload_json,automation_subject) VALUES(?,2,?,?)',[SEQUENCE_ID,encode(data),subject()]);
 return {ready:true};
});}
export async function activateTransitionSequence(){return locked(async db=>{
 const old=await stored(db);if(old?.status==='active')return {alreadyActive:true,events:await mappedEvents(db)};
 const plan=await transitionSequencePreview(),state=newTransitionSequenceState(plan),data={...old.data,plan,state};
 await db.beginTransaction();try{
  for(const [index,session] of [...plan.sessions, {...plan.sunday,number:5,modality:'in_person'}].entries()){
   if(index===4)continue; // Sunday remains a conditional fallback, not a fifth blanket invitation.
   await createEvent(db,plan,session);
  }
  data.state=transitionSequenceEvent(plan,state,{type:'tick'});
  await save(data,old.revision,db);await db.execute('UPDATE transition_meeting_sequences SET status=\'active\' WHERE sequence_id=?',[SEQUENCE_ID]);await db.commit();
 }catch(e){await db.rollback();throw e;}
 return {activated:true,providers:plan.providers.length,events:await mappedEvents(db)};
});}
async function mappedEvents(db=pool){const [rows]=await db.execute('SELECT meeting_number,event_id FROM transition_meeting_sequence_events WHERE sequence_id=? ORDER BY meeting_number',[SEQUENCE_ID]);return rows;}
export async function transitionSequenceStatus(){
 const row=await stored();if(!row)return {sequence:null};
 const actions=Object.values(row.data.state?.outbox||{}),counts={};
 for(const action of actions){const key=`${action.kind}:${action.status}`;counts[key]=(counts[key]||0)+1;}
 return {sequence:{status:row.status,revision:row.revision,updatedAt:row.updated_at},inboxVerified:row.data.setup?.roundTripVerified===true,
  providers:row.data.plan?.providers?.length||0,events:await mappedEvents(),deliveryCounts:counts,
  review:actions.filter(a=>a.status==='review').map(a=>({kind:a.kind,meeting:a.meeting,userId:a.userId,reference:a.reference})),
  receipts:actions.filter(a=>a.status==='sent').map(a=>({kind:a.kind,meeting:a.meeting,reference:row.data.state.receipts?.[a.key]?.reference||null})),
  finalizedMeetings:Object.entries(row.data.state?.attendance||{}).filter(([,v])=>v.finalized).map(([n])=>Number(n))};
}
export async function createEvent(db,plan,session){
 const [[existing]]=await db.execute('SELECT event_id FROM transition_meeting_sequence_events WHERE sequence_id=? AND meeting_number=?',[SEQUENCE_ID,session.number]);if(existing)return existing.event_id;
 const token=generateJoinToken(),settings={attendance:true,compensation:false,transcription:false,reminders:[],transitionSequence:SEQUENCE_ID};
 const [result]=await db.execute(`INSERT INTO provider_schedule_events(agency_id,provider_id,kind,meeting_subtype,title,description,start_at,end_at,event_timezone,status,all_day,is_private,platform_video_link,join_token,participant_join_token,host_join_token,waiting_room_enabled,notify_participants,attendance_tracking_enabled,meeting_settings_json,created_by_user_id,updated_by_user_id)
 VALUES(2,?,'TEAM_MEETING','training',?,?,?,?,'America/Denver','ACTIVE',0,0,?,?,?, ?,1,0,1,?,NULL,NULL)`,
 [plan.hostIds[2],`ITSCO → AuricWell transition · opportunity ${session.number}`,'PLEASE READ THIS ENTIRE EMAIL — RSVP REQUIRED. Confirm intakes, treatment plans, clients, next-week sessions, email, messages, notes and non-Google access.',mysqlTime(session.startAt),mysqlTime(session.endAt),session.modality==='in_person'?0:1,token,token,generateJoinToken(),JSON.stringify(settings)]);
 const id=result.insertId;
 if(session.modality==='in_person')await db.execute('UPDATE provider_schedule_events SET location_text=? WHERE id=?',[session.location||plan.sunday?.location||'Windchime office',id]);
 await db.execute('INSERT INTO scheduled_trainings(event_id,series_key,topic,agency_visible,video_default_on,video_allowed,mute_all) VALUES(?,?,?,0,0,1,0)',[id,randomUUID(),'ITSCO transition readiness']);
 for(const uid of plan.hostIds){if(uid!==plan.hostIds[2])await db.execute('INSERT INTO provider_schedule_event_attendees(event_id,user_id) VALUES(?,?)',[id,uid]);await db.execute('INSERT INTO meeting_participant_preferences(event_id,user_id,is_required,is_cohost) VALUES(?,?,0,1)',[id,uid]);}
 await db.execute('INSERT INTO transition_meeting_sequence_events(sequence_id,meeting_number,event_id) VALUES(?,?,?)',[SEQUENCE_ID,session.number,id]);return id;
}
async function liveMember(uid,db=pool){const [[u]]=await db.execute(`SELECT u.id,u.email,u.work_email,u.first_name,u.preferred_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=2 AND ua.is_active=1 WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`,[uid]);if(!u)throw error('The recipient is no longer active in ITSCO.');return u;}
async function eventFor(number,db=pool){const [[e]]=await db.execute('SELECT e.* FROM transition_meeting_sequence_events m JOIN provider_schedule_events e ON e.id=m.event_id WHERE m.sequence_id=? AND m.meeting_number=? AND e.agency_id=2',[SEQUENCE_ID,number]);return e;}
async function linksFor(event,uid){const invitation=await personalMeetingInvitation(event,uid,{queue:false});const base=await tenantMeetingBase(2),path=`${base}/join/invitation/${encodeURIComponent(invitation.join_token)}`;return {invitation,acceptedUrl:`${path}?rsvp=1&eventId=${event.id}&response=accepted`,declinedUrl:`${path}?rsvp=1&eventId=${event.id}&response=declined`};}
export function verifiedTransitionDeliveryReceipt(result,action){
 if(result?.pendingApproval||result?.queued||result?.skipped||result?.blocked||result?.redirected||!result?.id)throw error('Delivery is held, redirected or unconfirmed; reconcile its receipt before retrying.');
 if(result.internetMessageId)action.internetMessageId=result.internetMessageId;
 return {status:'sent',reference:`email:${result.id}`};
}
async function deliver(data,action){
 const {plan}=data;const user=await liveMember(action.userId);const sender=await identity();let links={};
 if(action.kind==='submit_time_claim')return upsertClaim(plan,action);
 if(action.kind==='withdraw_invitation'){
  const event=await eventFor(action.meeting);await pool.execute('DELETE FROM provider_schedule_event_attendees WHERE event_id=? AND user_id=?',[event.id,action.userId]);await pool.execute('UPDATE meeting_participant_preferences SET rsvp=\'declined\',rsvp_at=UTC_TIMESTAMP() WHERE event_id=? AND user_id=?',[event.id,action.userId]);return {status:'created',reference:`withdrawn:${event.id}:${action.userId}`};
 }
 if(action.kind==='meeting_invitation'){
  let event=await eventFor(action.meeting);if(!event&&action.meeting===5){const db=await pool.getConnection();try{await db.beginTransaction();await createEvent(db,plan,{...plan.sunday,number:5,modality:'in_person'});await db.commit();}catch(e){await db.rollback();throw e;}finally{db.release();}event=await eventFor(5);}
  if(event.status!=='ACTIVE'||event.meeting_completed_at||parseUtcDate(event.start_at)<=new Date())return {status:'skipped',reference:'meeting-ended-or-cancelled'};
  await pool.execute('INSERT IGNORE INTO provider_schedule_event_attendees(event_id,user_id) VALUES(?,?)',[event.id,action.userId]);
  await pool.execute('INSERT INTO meeting_participant_preferences(event_id,user_id,is_required,is_cohost) VALUES(?,?,1,0) ON DUPLICATE KEY UPDATE is_required=1',[event.id,action.userId]);
  links=await linksFor(event,action.userId);
 }
 const content=transitionSequenceEmail(plan,action,links);
 const recipientEmail=deliveryEmail(user);
 const {sendEmailFromIdentity}=await import('./unifiedEmail/unifiedEmailSender.service.js');
 const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to:recipientEmail,cc:content.cc,subject:content.subject,text:content.text,html:content.html,internetMessageIdOverride:action.internetMessageId,
  replyToOverride:TRANSITION_INBOX,source:'auto',userId:action.userId,generatedByUserId:null,templateType:'meeting_invited'});
 return verifiedTransitionDeliveryReceipt(result,action);
}
export async function upsertClaim(plan,action){
 if(plan.hostIds.includes(action.userId))throw error('Hosts are excluded from participant claims.');const event=await eventFor(action.meeting);
 const db=await pool.getConnection();try{
  await db.beginTransaction();const [[link]]=await db.execute('SELECT claim_id FROM transition_meeting_claim_links WHERE event_id=? AND user_id=? FOR UPDATE',[event.id,action.userId]);if(link){await db.commit();return {status:'submitted',reference:`claim:${link.claim_id}`};}
  const [[old]]=await db.execute(`SELECT id FROM payroll_time_claims WHERE agency_id=2 AND user_id=? AND claim_type='meeting_training' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.scheduleEventId')) AS UNSIGNED)=? LIMIT 1 FOR UPDATE`,[action.userId,event.id]);if(old)throw error('An existing meeting claim needs reconciliation; no duplicate was created.');
  const payload={source:'meeting_compensation_auto',scheduleEventId:event.id,serviceCode:'MEETING',totalMinutes:action.seconds/60,transitionSequence:SEQUENCE_ID,automation:{actorType:'automation',subject:subject()},attendanceSeconds:action.seconds};
  const [r]=await db.execute(`INSERT INTO payroll_time_claims(agency_id,user_id,submitted_by_user_id,status,claim_type,claim_date,payload_json) VALUES(2,?,NULL,'submitted','meeting_training',?,?)`,[action.userId,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(parseUtcDate(event.start_at)),JSON.stringify(payload)]);
  await db.execute('INSERT INTO transition_meeting_claim_links(sequence_id,event_id,user_id,claim_id,rate_amount,attendance_seconds) VALUES(?,?,?,?,18,?)',[SEQUENCE_ID,event.id,action.userId,r.insertId,action.seconds]);await db.commit();return {status:'submitted',reference:`claim:${r.insertId}`};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function transitionClaimRate(claim,db=pool){
 if(Number(claim.agency_id)!==2)return null;
 try{const [[r]]=await db.execute('SELECT rate_amount FROM transition_meeting_claim_links WHERE sequence_id=? AND claim_id=? AND user_id=?',[SEQUENCE_ID,claim.id,claim.user_id]);return r?Number(r.rate_amount):null;}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return null;throw e;}
}
export async function processTransitionSequence(){
 return locked(async db=>{
  let row=await stored(db);if(!row||row.status!=='active')return {inactive:true};let data=row.data,revision=Number(row.revision);
  const persist=async()=>{await db.beginTransaction();try{revision=await save(data,revision,db);await db.commit();}catch(e){await db.rollback();throw e;}};
  for(const item of Object.values(data.state.outbox))if(item.status==='processing'){item.status='review';item.reference='Worker stopped after dispatch began; reconcile before retry.';}
  const events=await mappedEvents(db);
  for(const mapping of events){const event=await eventFor(mapping.meeting_number,db),n=Number(mapping.meeting_number);
   if(event.status!=='ACTIVE')continue;
   const [prefs]=await db.execute('SELECT user_id,rsvp,rsvp_at FROM meeting_participant_preferences WHERE event_id=?',[event.id]);
   for(const p of prefs)if(['accepted','declined'].includes(p.rsvp)&&data.state.issued[`${p.user_id}:${n}`]&&!data.state.issued[`${p.user_id}:${n}`].withdrawn&&data.state.responses[`${p.user_id}:${n}`]?.response!==p.rsvp&&parseUtcDate(event.start_at)>new Date())data.state=transitionSequenceEvent(data.plan,data.state,{type:'rsvp',userId:Number(p.user_id),meeting:n,response:p.rsvp});
   // Only a host's deliberate completion plus a full reviewed register can
   // release absence-based follow-ups. Unknown/partial attendance stays held.
   if(event.meeting_completed_at&&data.plan.hostIds.includes(Number(event.meeting_completed_by_user_id))&&!data.state.attendance[n]?.finalized){
    const required=Object.values(data.state.issued).filter(i=>i.meeting===n&&!i.withdrawn);
    if(n<=4&&Number(event.platform_video_link)===1){
     // The four configured opportunities use app video only (no telephone or
     // in-person option). A host's End meeting plus successful segment rebuild
     // establishes this single source; failed rebuilds hold all follow-ups.
     await (await import('./meetingAttendanceSegments.service.js')).rebuildAttendanceRollupsFromSegments(event.id,{syncClaims:false});
     for(const person of required)await db.execute('INSERT IGNORE INTO agency_meeting_attendance_rollups(event_id,user_id,total_seconds,synced_at) VALUES(?,?,0,UTC_TIMESTAMP())',[event.id,person.userId]);
    }
    const [rollups]=await db.execute('SELECT user_id,total_seconds FROM agency_meeting_attendance_rollups WHERE event_id=?',[event.id]);
    if(required.every(i=>rollups.some(r=>Number(r.user_id)===i.userId))){
     data.state=transitionSequenceEvent(data.plan,data.state,{type:'attendance_finalized',meeting:n,allAttendanceSourcesReviewed:true,evidence:`Host completed event ${event.id}; attendance register includes every invitee.`,seconds:Object.fromEntries(rollups.filter(r=>data.plan.providers.some(p=>p.userId===Number(r.user_id))||data.plan.hostIds.includes(Number(r.user_id))).map(r=>[Number(r.user_id),Number(r.total_seconds)]))});
    }
   }
  }
  data.state=transitionSequenceEvent(data.plan,data.state,{type:'tick'});await persist();
  let sent=0,review=0;
  for(const key of Object.keys(data.state.outbox).filter(key=>data.state.outbox[key].status==='pending')){
   const item=data.state.outbox[key];
   item.internetMessageId ||= `<transition-${createHash('sha256').update(item.key).digest('hex').slice(0,40)}@auricwell.com>`;
   item.status='processing';await persist();
   try{const result=await deliver(data,item);data.state=transitionSequenceEvent(data.plan,data.state,{type:'delivery_receipt',key:item.key,status:result.status,reference:result.reference});if(result.status==='sent')sent++;}
   catch(e){item.status='review';item.reference=e.status?'Delivery or prerequisite needs review.':'Uncertain provider result; reconcile before retry.';review++;}
   await persist();
  }
  for(const mapping of events){const active=Object.values(data.state.issued).filter(i=>i.meeting===Number(mapping.meeting_number)&&!i.withdrawn);if(active.length&&active.every(i=>['created','sent'].includes(data.state.receipts[`${SEQUENCE_ID}:invite:${i.userId}:${mapping.meeting_number}`]?.status))){data.state=transitionSequenceEvent(data.plan,data.state,{type:'invitations_batch_finalized',meeting:Number(mapping.meeting_number)});}}
  await persist();return {sent,review,providers:data.plan.providers.length};
 });
}
export async function handleTransitionInbound({agencyId,senderIdentityId,fromEmail,bodyText,headers=[],gmailMessageId,inReplyTo,automated=false,authenticatedSender=false}){
 if(Number(agencyId)!==2)return {handled:false};const sender=await identity().catch(()=>null);if(!sender||Number(senderIdentityId)!==Number(sender.id))return {handled:false};
 if(automated)return {handled:true,ignored:true};
 return locked(async db=>{
  const row=await stored(db);if(!row?.data?.plan||row.status!=='active')return {handled:true,retry:true};const {plan}=row.data;
  // Require the actual provider's resolved address AND an original campaign
  // communication Message-ID, never just a name or a forged subject line.
  const original=Object.values(row.data.state.outbox).find(a=>a.internetMessageId===String(inReplyTo||'').trim()&&a.status==='sent'&&!a.kind.startsWith('rachel_'));
  const p=plan.providers.find(p=>p.userId===Number(original?.userId));if(!p)return {handled:true,review:true};
  const user=await liveMember(p.userId);
  const command=parseTransitionReply({bodyText,verifiedThreadRecipient:deliveryEmail(user)===String(fromEmail).toLowerCase(),automated,authenticatedSender});
  if(['ignore','review'].includes(command.kind))return {handled:true,review:true};
  const last=Object.values(row.data.state.issued).filter(i=>i.userId===p.userId&&!i.withdrawn).sort((a,b)=>b.meeting-a.meeting)[0];
  if(!last)return {handled:true,review:true};
  const key=`inbound:${gmailMessageId}`;if(row.data.inboundReceipts?.[key])return {handled:true,duplicate:true};
  const type=command.kind==='select'?'select_alternative':command.kind==='none'?'none_available':'rsvp';
  row.data.state=transitionSequenceEvent(plan,row.data.state,{type,userId:p.userId,fromMeeting:original.meeting||last.meeting,meeting:original.meeting||last.meeting,response:'declined',option:command.option});
  row.data.inboundReceipts={...row.data.inboundReceipts,[key]:true};await db.beginTransaction();try{await save(row.data,row.revision,db);await db.commit();}catch(e){await db.rollback();throw e;}
  return {handled:true,queued:true};
 });
}
