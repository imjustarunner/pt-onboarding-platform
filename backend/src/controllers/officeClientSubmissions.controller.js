import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { completeClientSubmission, privateSubmission, assertCheckinClientAccess, attachClientSubmission } from '../services/officeClientSubmissions.service.js';
const json=v=>typeof v==='string'?JSON.parse(v):v;
const action = fn => async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}};
export const completeForms = action(async(req,res)=>res.json(await completeClientSubmission({locationId:Number(req.params.locationId),key:req.body?.submissionKey,answers:req.body?.answers})));
export const listSubmissions = action(async(req,res)=>{
  const [rows]=await pool.execute(`SELECT s.id,s.event_id,s.agency_id,s.scheduled_start_at,s.scheduled_end_at,s.client_id,s.clinical_session_id,s.forms_json,s.answers_json,s.forms_unavailable,s.completed_at,s.created_at,l.name location_name,l.timezone,c.full_name,c.initials,c.identifier_code FROM office_client_checkin_submissions s JOIN office_locations l ON l.id=s.office_location_id LEFT JOIN clients c ON c.id=s.client_id WHERE s.provider_id=? AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=s.provider_id AND ua.agency_id=s.agency_id AND ua.is_active=1) ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 200`,[req.user.id]);
  res.json({submissions:rows.map(r=>({...r,forms_json:json(r.forms_json),answers_json:json(r.answers_json)}))});
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
