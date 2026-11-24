import pool from '../config/database.js';
import {decryptChatText} from './chatEncryption.service.js';
import {transitionStaff} from './transitionWorkspace.service.js';
import {SEQUENCE_ID} from './transitionMeetingSequencePolicy.js';

// One explicitly requested NLU participant may attend these training events.
// This grants no ITSCO membership, clinical access, discovery or host authority.
async function guestContext(userId,homeAgencyId,db){
 if(Number(homeAgencyId)!==6||!Number.isSafeInteger(Number(userId))||Number(userId)<1)return null;
 let row;try{const result=await db.execute('SELECT status,payload_json FROM transition_meeting_sequences WHERE sequence_id=? AND agency_id=2',[SEQUENCE_ID]);row=result?.[0]?.[0];}
 catch(e){if(e.code==='ER_NO_SUCH_TABLE')return null;throw e;}
 if(!row||row.status!=='active'||!row.payload_json)return null;
 let data;try{data=JSON.parse(decryptChatText(typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json));}catch{return null;}
 if(data.plan?.id!==SEQUENCE_ID||data.plan.agencyId!==2||!data.plan.fingerprint||data.state?.planFingerprint!==data.plan.fingerprint)return null;
 const guest=data.plan?.providers?.find(p=>p.userId===Number(userId)&&p.explicitAddition===true&&p.payrollAgencyId===6);
 if(!guest||!(await transitionStaff(6,db)).some(p=>p.id===Number(userId)))return null;
 return data;
}
export async function transitionTrainingGuestHomeAgency(userId,db=pool){return await guestContext(userId,6,db)?6:null;}
export async function transitionGuestTrainingEventIds(userId,homeAgencyId=6,db=pool){
 const data=await guestContext(userId,homeAgencyId,db);if(!data)return [];
 const [rows]=await db.execute(`SELECT m.meeting_number,m.event_id FROM transition_meeting_sequence_events m
  JOIN provider_schedule_events e ON e.id=m.event_id AND e.agency_id=2 AND e.kind='TEAM_MEETING' AND e.meeting_subtype='training'
  JOIN provider_schedule_event_attendees a ON a.event_id=e.id AND a.user_id=? WHERE m.sequence_id=?`,[Number(userId),SEQUENCE_ID]);
 return rows.filter(r=>{const issued=data.state?.issued?.[`${userId}:${r.meeting_number}`];return issued&&!issued.withdrawn;}).map(r=>Number(r.event_id));
}
export async function hasTransitionTrainingGuestAccess(event,userId,db=pool){
 return Number(event?.agency_id)===2&&(await transitionGuestTrainingEventIds(userId,6,db)).includes(Number(event.id));
}
