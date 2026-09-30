import { scoreOfficeFeedback } from '../services/officeFeedbackForms.js';
import { readAccessibleFeedback, summarizeFeedback } from '../services/officeFeedbackSummary.service.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { completeClientSubmission, privateSubmission, assertCheckinClientAccess, attachClientSubmission, attachCheckinSeries, readSubmissionAnswers } from '../services/officeClientSubmissions.service.js';
import { checkinSeries } from '../utils/officeCheckinSeries.js';
const json=v=>typeof v==='string'?JSON.parse(v):v;
const action = fn => async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}};
export const completeForms = action(async(req,res)=>res.json(await completeClientSubmission({locationId:Number(req.params.locationId),key:req.body?.submissionKey,answers:req.body?.answers,skippedFormIds:req.body?.skippedFormIds})));
export const listSubmissions = action(async(req,res)=>{
  const [rows]=await pool.execute(`SELECT s.id,s.event_id,s.agency_id,s.provider_id,s.office_location_id,s.scheduled_start_at,s.scheduled_end_at,s.client_id,s.clinical_session_id,s.forms_json,s.answers_json,s.forms_unavailable,s.completed_at,s.created_at,l.name location_name,l.timezone,c.full_name,c.initials,c.identifier_code FROM office_client_checkin_submissions s JOIN office_locations l ON l.id=s.office_location_id LEFT JOIN clients c ON c.id=s.client_id WHERE s.provider_id=? AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=s.provider_id AND ua.agency_id=s.agency_id AND ua.is_active=1) ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 2000`,[req.user.id]);
  res.json({submissions:rows.map(r=>{const feedback=readSubmissionAnswers(r.answers_json);return {...r,series:checkinSeries(r),forms_json:json(r.forms_json),answers_json:feedback.answers,skipped_form_ids:feedback.skippedFormIds};}),truncated:rows.length===2000});
});
export const submissionClients = action(async(req,res)=>{
  const row=await privateSubmission(pool,Number(req.params.id),req.user.id);
  const term=String(req.query.q || '').trim().slice(0,100);
  if(term.length<2)return res.json({clients:[]});
  const q=`%${term}%`;
  const [clients]=await pool.execute(`SELECT c.id,c.full_name,c.initials,c.identifier_code FROM clients c WHERE c.agency_id=? AND (c.provider_id=? OR EXISTS (SELECT 1 FROM client_provider_assignments a WHERE a.client_id=c.id AND a.provider_user_id=? AND a.is_active=1)) AND (c.full_name LIKE ? OR c.initials LIKE ? OR c.identifier_code LIKE ?) ORDER BY c.full_name LIMIT 20`,[row.agency_id,req.user.id,req.user.id,q,q,q]);
  res.json({clients});
});
export const submissionSessions = action(async(req,res)=>{
  const row=await privateSubmission(pool,Number(req.params.id),req.user.id);
  const clientId=Number(req.query.clientId);
  await assertCheckinClientAccess(pool,req.user.id,clientId,row.agency_id);
  const [sessions]=await clinicalPool.execute('SELECT id,scheduled_start_at,scheduled_end_at FROM clinical_sessions WHERE agency_id=? AND client_id=? AND provider_user_id=? ORDER BY scheduled_start_at DESC LIMIT 100',[row.agency_id,clientId,req.user.id]);
  res.json({sessions});
});
export const attachSubmission = action(async(req,res)=>res.json(await attachClientSubmission({id:Number(req.params.id),providerId:req.user.id,clientId:Number(req.body?.clientId),sessionId:req.body?.sessionId?Number(req.body.sessionId):null})));

export const attachSeries = action(async(req,res)=>res.json(await attachCheckinSeries({providerId:req.user.id,ids:req.body?.ids,clientId:Number(req.body?.clientId)})));
export const clientFeedback = action(async(req,res)=>{
  const visits=await readAccessibleFeedback({user:req.user,clientIds:[Number(req.params.clientId)]});
  res.json({visits,truncated:false});
});
export const clientFeedbackSummaries = action(async(req,res)=>{
  const visits=await readAccessibleFeedback({user:req.user,clientIds:req.body?.clientIds,providerId:req.body?.providerId??null});
  res.json({summaries:summarizeFeedback(visits),windowDays:42,asOf:new Date().toISOString()});
});

export const submissionResponses = action(async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:{message:'Invalid check-in.'}});
 const row=await privateSubmission(pool,id,req.user.id),forms=json(row.forms_json),feedback=readSubmissionAnswers(row.answers_json);
 const [[location]]=await pool.execute('SELECT name,timezone FROM office_locations WHERE id=?',[row.office_location_id]);
 res.json({visit:{id:row.id,scheduledStartAt:row.scheduled_start_at,completedAt:row.completed_at,location:location?.name,timezone:location?.timezone||'America/Denver',respondentType:forms.respondentType,serviceType:forms.serviceType||'counseling',forms:forms.forms,answers:feedback.answers,skippedFormIds:feedback.skippedFormIds,score:scoreOfficeFeedback(forms.forms,feedback.answers,feedback.skippedFormIds)}});
});
