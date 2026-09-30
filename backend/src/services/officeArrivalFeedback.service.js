import pool from '../config/database.js';
import { readSubmissionAnswers, assertCheckinClientAccess } from './officeClientSubmissions.service.js';
import { scoreOfficeFeedback } from './officeFeedbackForms.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
const json=value=>typeof value==='string'?JSON.parse(value):value;
export function arrivalFeedbackScores(current,previous=[]) {
 const envelope=json(current.forms_json),feedback=readSubmissionAnswers(current.answers_json);
 const score=current.completed_at?scoreOfficeFeedback(envelope.forms,feedback.answers,feedback.skippedFormIds):{};
 const history=(current.client_id?previous:[]).filter(row=>{
  const form=json(row.forms_json);return row.completed_at&&form.respondentType===envelope.respondentType&&(form.serviceType||'counseling')===(envelope.serviceType||'counseling')&&parseUtcDate(row.scheduled_start_at)<parseUtcDate(current.scheduled_start_at);
 }).sort((a,b)=>parseUtcDate(a.scheduled_start_at)-parseUtcDate(b.scheduled_start_at)||a.id-b.id).map(row=>{
  const form=json(row.forms_json),answers=readSubmissionAnswers(row.answers_json);return scoreOfficeFeedback(form.forms,answers.answers,answers.skippedFormIds);
 });
 const metrics={};
 for(const name of ['connection','progress']){
  const prior=history.map(s=>s[name]).filter(Number.isFinite),value=score[name]??null;
  const values=[...prior,...(Number.isFinite(value)?[value]:[])];
  metrics[name]={changeFromStart:prior.length&&Number.isFinite(value)?Math.round((value-prior[0])*10)/10:null,current:value,previous:prior.at(-1)??null,average:current.client_id&&values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:null,count:values.length};
 }
 return {submissionId:current.id,completed:!!current.completed_at,linked:!!current.client_id,respondentType:envelope.respondentType,serviceType:envelope.serviceType||'counseling',metrics};
}
export async function feedbackForArrival(notification,now=Date.now(),{waitForCompletion=true}={}) {
 const [rows]=await pool.execute(`SELECT s.* FROM notifications n JOIN office_event_checkins ci ON ci.id=n.related_entity_id AND n.related_entity_type='office_event_checkin' JOIN office_events e ON e.id=ci.event_id JOIN office_client_checkin_submissions s ON s.event_id=ci.event_id AND s.provider_id=n.user_id AND s.scheduled_start_at=COALESCE(ci.slot_start_at,e.start_at) WHERE n.id=? AND n.user_id=? AND n.agency_id=? AND n.type='kiosk_checkin' AND s.agency_id=n.agency_id ORDER BY s.id LIMIT 1`,[notification.notification_id,notification.user_id,notification.agency_id]);
 const current=rows[0];if(!current)return null;
 const forms=json(current.forms_json);
 // Preserve the immediate in-app arrival. Give an actively completed questionnaire
 // up to five minutes before sending the fallback, then clearly label missing scores.
 if(waitForCompletion&&!current.completed_at&&forms.forms?.length&&now<parseUtcDate(current.created_at).getTime()+300000)return {wait:true};
 let history=[],linked=!!current.client_id;
 if(linked){
  try{await assertCheckinClientAccess(pool,notification.user_id,current.client_id,current.agency_id);}catch(error){if(error.status!==403)throw error;linked=false;}
  if(linked){const [prior]=await pool.execute(`SELECT id,forms_json,answers_json,completed_at,scheduled_start_at FROM office_client_checkin_submissions WHERE client_id=? AND provider_id=? AND agency_id=? AND completed_at IS NOT NULL AND scheduled_start_at<? ORDER BY scheduled_start_at,id`,[current.client_id,current.provider_id,current.agency_id,current.scheduled_start_at]);history=prior;}
 }
 return arrivalFeedbackScores({...current,client_id:linked?current.client_id:null},history);
}
