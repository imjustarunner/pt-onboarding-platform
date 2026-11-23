import crypto from 'node:crypto';
import pool from '../config/database.js';
import {getBillingImportMetadata} from '../utils/payrollBillingImportMetadata.js';
import {enrichExistingClientsFromBillingRows} from './billingClientProfileEnrichment.service.js';
import {codeOf,isMentalHealthCode,isNonStandaloneVisitCode,clinicalToday} from './clientFiscalSessions.service.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const nameKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function digest(value){const key=Buffer.from(process.env.BILLING_ENCRYPTION_KEY_BASE64||process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64||'','base64');if(key.length!==32)throw fail('Billing source encryption is unavailable.',503);return crypto.createHmac('sha256',key).update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
export async function previewSessionCountImport({agencyId,rows,sourceKey,providerMap={}},db=pool){
  if(!Array.isArray(rows)||rows.length>100000)throw fail('Use a billing report with at most 100,000 service rows.');
  const [providers]=await db.execute(`SELECT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND u.role NOT IN ('client','client_guardian')`,[agencyId]);
  const known=new Map();for(const p of providers)for(const name of [`${p.first_name} ${p.last_name}`,`${p.last_name} ${p.first_name}`]){const key=nameKey(name);if(!known.has(key))known.set(key,new Set());known.get(key).add(Number(p.id));}
  const allowed=new Set(providers.map(p=>Number(p.id)));
  for(const value of Object.values(providerMap))if(!allowed.has(Number(value)))throw fail('A selected provider does not belong to this agency.',403);
  const inputs=[],prepared=[],unmatchedProviders=new Set();
  for(const row of rows){const source=getBillingImportMetadata(row),code=codeOf(row.serviceCode),date=(row.serviceDate instanceof Date?row.serviceDate.toISOString():String(row.serviceDate||'')).slice(0,10);
    if(!source)continue;
    const providerName=String(row.providerName||'(missing provider)');
    const candidate=known.get(nameKey(providerName)),provider=Number(providerMap[providerName]||(candidate?.size===1?[...candidate][0]:0));
    let reason=source.excludedFromSessionCount?'excluded_non_visit_row':!isMentalHealthCode(code)?'excluded_service_code':isNonStandaloneVisitCode(code)?'add_on_not_separate_visit':!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>clinicalToday()?'invalid_or_future_date':!provider?'provider_needs_match':null;
    if(!provider)unmatchedProviders.add(String(row.providerName||'(missing provider)'));
    prepared.push({sourceRowNumber:source.sourceRowNumber,providerUserId:provider||null,serviceDate:date,serviceCode:code,reason});
    if(!reason)inputs.push({sourceRowNumber:source.sourceRowNumber,providerUserId:provider,serviceDate:date,profileFields:source.profileFields,rowFingerprint:digest({source:sourceKey,row:source.sourceRowNumber})});
  }
  const match=await enrichExistingClientsFromBillingRows({agencyId,rows:inputs,dryRun:true,db});const byOrdinal=new Map(match.rows.map(row=>[Number(row.sourceRowNumber),row]));
  const evidence=prepared.map(row=>{const m=byOrdinal.get(Number(row.sourceRowNumber));return {...row,clientId:!row.reason&&m?.matchStatus==='matched'?m.clientId:null,reason:row.reason|| (m?.matchStatus==='matched'?null:(m?.reasonCodes||[]).join(', ')||'client_needs_match')};});
  const summary={serviceRows:prepared.length,matchedRows:evidence.filter(r=>r.clientId).length,reviewRows:evidence.filter(r=>!r.clientId&&!['excluded_service_code','add_on_not_separate_visit','excluded_non_visit_row'].includes(r.reason)).length,excludedRows:evidence.filter(r=>['excluded_service_code','add_on_not_separate_visit','excluded_non_visit_row'].includes(r.reason)).length};
  const snapshot=digest({agencyId,sourceKey,evidence});
  return {sourceKey,snapshot,summary,rows:evidence,unmatchedProviders:[...unmatchedProviders],providers:providers.map(p=>({id:Number(p.id),name:`${p.first_name} ${p.last_name}`}))};
}
export function sessionCountSourceKey(buffer){return digest(buffer.toString('base64'));}
export function groupSessionCountEvidence(rows){const groups=new Map();for(const row of rows){if(!row.clientId||row.reason)continue;const key=[row.clientId,row.providerUserId,row.serviceDate,row.serviceCode].join(':');if(!groups.has(key))groups.set(key,{...row,count:0});groups.get(key).count++;}return [...groups.values()];}
export async function saveSessionCountEvidence({agencyId,sourceKey,sourceKind,actorUserId,rows,summary},db){
  const [[prior]]=await db.execute('SELECT id,summary_json FROM client_session_count_imports WHERE agency_id=? AND source_key=?',[agencyId,sourceKey]);
  if(prior)return {importId:Number(prior.id),alreadyImported:true,summary:typeof prior.summary_json==='string'?JSON.parse(prior.summary_json):prior.summary_json};
  const [saved]=await db.execute('INSERT INTO client_session_count_imports (agency_id,source_key,source_kind,actor_user_id,summary_json) VALUES (?,?,?,?,?)',[agencyId,sourceKey,sourceKind,actorUserId,JSON.stringify(summary)]);
  for(const group of groupSessionCountEvidence(rows))await db.execute('INSERT INTO client_session_count_evidence (import_id,agency_id,client_id,provider_user_id,service_date,service_code,reported_sessions) VALUES (?,?,?,?,?,?,?)',[saved.insertId,agencyId,group.clientId,group.providerUserId,group.serviceDate,group.serviceCode,group.count]);
  return {importId:Number(saved.insertId),alreadyImported:false,summary};
}
export async function applySessionCountImport(input,db=pool){const conn=await db.getConnection();try{await conn.beginTransaction();
  // Serialize this agency's count imports and read current client identity under
  // lock before comparing the reviewed preview. No profile fields are changed.
  await conn.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[input.agencyId]);
  await conn.execute('SELECT id FROM clients WHERE agency_id=? FOR SHARE',[input.agencyId]);
  const preview=await previewSessionCountImport(input,conn);
  if(!input.expectedSnapshot||preview.snapshot!==input.expectedSnapshot)throw fail('The file, provider selection or client match changed. Preview it again before importing.',409);
  if(!preview.summary.matchedRows)throw fail('No matched service rows are available to import.');
  const result=await saveSessionCountEvidence({...input,rows:preview.rows,summary:preview.summary,sourceKind:'billing_count_upload'},conn);await conn.commit();return result;
}catch(error){await conn.rollback();throw error;}finally{conn.release();}}
