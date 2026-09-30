import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { completeClientSubmission, privateSubmission, assertCheckinClientAccess, attachClientSubmission, attachCheckinSeries, readSubmissionAnswers } from '../services/officeClientSubmissions.service.js';
import { checkinSeries } from '../utils/officeCheckinSeries.js';
import { scoreOfficeFeedback } from '../services/officeFeedbackForms.js';
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
  const clientId=Number(req.params.clientId);
  const [[client]]=await pool.execute('SELECT agency_id FROM clients WHERE id=?',[clientId]);
  if(!client)return res.status(404).json({error:{message:'Client not found.'}});
  await assertCheckinClientAccess(pool,req.user.id,clientId,client.agency_id);
  const [rows]=await pool.execute(`SELECT s.id,s.scheduled_start_at,s.forms_json,s.answers_json,s.completed_at,l.name location_name,l.timezone FROM office_client_checkin_submissions s JOIN office_locations l ON l.id=s.office_location_id WHERE s.client_id=? AND s.provider_id=? AND s.agency_id=? ORDER BY s.scheduled_start_at,s.id LIMIT 2000`,[clientId,req.user.id,client.agency_id]);
  res.json({visits:rows.map(row=>{const envelope=json(row.forms_json),feedback=readSubmissionAnswers(row.answers_json);return {id:row.id,scheduledStartAt:row.scheduled_start_at,location:row.location_name,timezone:row.timezone,completedAt:row.completed_at,respondentType:envelope.respondentType,serviceType:envelope.serviceType||'counseling',forms:envelope.forms,answers:feedback.answers,skippedFormIds:feedback.skippedFormIds,score:scoreOfficeFeedback(envelope.forms,feedback.answers,feedback.skippedFormIds)};}),truncated:rows.length===2000});
});
