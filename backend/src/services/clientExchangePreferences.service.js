import crypto from 'node:crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { loadClientExchangeSummary } from './clientExchangeSummary.service.js';
import { familyNotificationDeliveryGate } from './familyNotificationChoices.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { dateToMysqlUtcDateTime,utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { exchangeStaffRole } from '../../../frontend/src/navigation/clientExchangePolicy.js';
import { missingExchangeEssentials,EXCHANGE_CITIES,EXCHANGE_DAYS,EXCHANGE_PERIODS,specificExchangeInsurance } from '../../../frontend/src/navigation/clientExchangeEssentials.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const parse=value=>typeof value==='string'?JSON.parse(value||'{}'):value||{};
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const emailHash=value=>hash(String(value||'').trim().toLowerCase());
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unavailable=()=>fail('This update link is unavailable or has expired. Please reply to your Support email for help.',410);

export async function exchangeSupportSender(agencyId) {
  const identities=await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
  const sender=identities.find(row=>row.identity_key==='support');
  if(!sender?.id||!sender.from_email)throw fail('The agency Support email sender is not configured',409);
  return sender;
}

async function recipientFor(scope,db=pool) {
  const [[row]]=await db.execute(`SELECT u.id,u.email,u.first_name,u.last_name,u.role,c.initials,c.status,
    g.permissions_json,g.access_enabled,c.user_id AS client_user_id
    FROM clients c JOIN users u ON u.id=? LEFT JOIN client_guardians g ON g.client_id=c.id AND g.guardian_user_id=u.id
    WHERE c.id=? AND c.agency_id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())
      AND c.status NOT IN ('ARCHIVED','DECLINED') AND c.compliance_archived_at IS NULL
      AND ((c.user_id=u.id AND u.role='client') OR g.access_enabled=1)`,[scope.recipient_user_id,scope.client_id,scope.agency_id]);
  if(!row||!row.email||(Number(row.client_user_id)!==Number(row.id)&&ClientGuardian.isNoView(parse(row.permissions_json))))throw unavailable();
  if(scope.recipient_hash&&emailHash(row.email)!==scope.recipient_hash)throw unavailable();
  return row;
}

export async function exchangePreferenceContext(token,db=pool) {
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw unavailable();
  const [[scope]]=await db.execute('SELECT * FROM client_exchange_followups WHERE token_hash=?',[hash(token)]);
  const expires=scope?.expires_at instanceof Date?scope.expires_at:new Date(utcMysqlToIso(scope?.expires_at));
  if(!scope||!Number.isFinite(+expires)||+expires<=Date.now())throw unavailable();
  const recipient=await recipientFor(scope,db);
  const [[listing]]=await db.execute("SELECT id FROM client_exchange_listings WHERE id=? AND client_id=? AND agency_id=? AND status IN ('open','requested')",[scope.listing_id,scope.client_id,scope.agency_id]);
  if(!listing)throw unavailable();
  const [[client]]=await db.execute('SELECT c.*,i.label AS insurance_type_label FROM clients c LEFT JOIN insurance_types i ON i.id=c.insurance_type_id WHERE c.id=? AND c.agency_id=?',[scope.client_id,scope.agency_id]);
  const summary=await loadClientExchangeSummary({client});
  const revision=hash(JSON.stringify({preferences:summary.preferences,concerns:summary.presentingProblems}));
  return {scope,recipient,client,summary,revision,missing:missingExchangeEssentials(summary)};
}

export function validateExchangePreferenceAnswers(input,summary,requestedFields) {
  const allowed=new Set(requestedFields);
  const patch={};
  const modality=String(input.modality||summary.preferences?.modality||'');
  if(!['in_person','virtual','either'].includes(modality))throw fail('Choose in-person care, virtual care, or either.');
  const editService=allowed.has('modality')||allowed.has('location');
  if(editService)patch.preferredModality=modality;
  const city=String(input.serviceLocation||summary.preferences?.serviceLocation||'');
  if(modality!=='virtual'&&!EXCHANGE_CITIES.includes(city))throw fail('Choose Denver, Colorado Springs, or either location for in-person care.');
  if(editService){patch.serviceLocation=modality==='virtual'?'':city;patch.serviceLocationSource='preference';}
  if(allowed.has('insurance')) {
    const insurance=String(input.insurance||'').trim();
    if(insurance.length>200||!specificExchangeInsurance(insurance))throw fail('Enter the insurance plan name, Medicaid, or self-pay. A general commercial insurance category is not enough to check provider coverage.');
    patch.insurance=insurance;
  }
  const schedule={...(summary.preferences?.schedule||{})};
  const choices=(value,options,label)=>{
    const rows=Array.isArray(value)?value:value?[value]:[];
    if(!rows.length||rows.some(item=>!options.includes(item)))throw fail(`Choose at least one ${label}. Select every option if you are flexible.`);
    return [...new Set(rows)];
  };
  if(allowed.has('days'))schedule.days=choices(input.days,EXCHANGE_DAYS,'day');
  if(allowed.has('times'))schedule.periods=choices(input.periods,EXCHANGE_PERIODS,'time of day');
  if(allowed.has('days')||allowed.has('times'))patch.exchangeSchedule={...schedule,timezone:schedule.timezone||'America/Denver'};
  if(allowed.has('concerns')) {
    const concern=String(input.concerns||'').trim();
    if(!concern||concern.length>2000)throw fail('Briefly describe the main concern (up to 2,000 characters). A diagnosis is not required.');
    patch.presentingConcern=concern;patch.submittedAt=new Date().toISOString();
  }
  return patch;
}

export async function saveExchangePreferenceAnswers({token,input},database=pool) {
  if(input?.confirm!=='yes'||!/^[a-f0-9]{64}$/.test(String(input?.revision||'')))throw fail('Please review your answers before saving.');
  const db=await database.getConnection();
  try {
    await db.beginTransaction();
    const [[row]]=await db.execute('SELECT * FROM client_exchange_followups WHERE token_hash=? FOR UPDATE',[hash(token)]);
    if(!row)throw unavailable();
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[row.client_id,row.agency_id]);
    const context=await exchangePreferenceContext(token,db);
    if(context.scope.completed_at){await db.commit();return {saved:true,duplicate:true};}
    if(input.revision!==context.revision)throw fail('Your record changed while this page was open. Reload the email link and review the current questions before saving.',409);
    const fields=context.missing.map(item=>item.key);
    const patch=validateExchangePreferenceAnswers(input,context.summary,fields);
    for(const [key,value] of Object.entries(patch))await db.execute(`UPDATE clients SET intake_preferences_json=JSON_SET(COALESCE(intake_preferences_json,JSON_OBJECT()),'$.${key}',CAST(? AS JSON)) WHERE id=? AND agency_id=?`,[JSON.stringify(value),row.client_id,row.agency_id]);
    await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,NULL,'exchange_service_preferences',?,?,?)",[row.client_id,JSON.stringify(context.summary.preferences),JSON.stringify(patch),`Saved through a scoped family email link for recipient account #${row.recipient_user_id}. Request #${row.id}. Insurance remains subject to coverage verification.`]);
    await db.execute("UPDATE client_exchange_followups SET answers_json=?,completed_at=UTC_TIMESTAMP(),provider_outreach_status='ready' WHERE id=?",[JSON.stringify(patch),row.id]);
    await db.commit();return {saved:true};
  }catch(error){await db.rollback();throw error;}
  finally{db.release();}
}

export function buildExchangePreferenceEmail({firstName,agencyName,url,missing}) {
  const fields=missing.map(item=>item.label).join(', ');
  const subject='A quick update to help us find the right provider';
  const needsLocation=missing.some(item=>item.key==='location');
  const introduction=needsLocation
    ? 'We’re helping find a provider for your requested services. As we recently expanded to Denver as well as Colorado Springs, we should have asked which location works for you up front. We’re sorry we missed that.'
    : 'We’re helping find a provider for your requested services. We have most of your information and need just a few missing details to identify appropriate providers. We’re sorry we did not collect these up front.';
  const instruction='Please use your private link to complete the essential matching details still missing from your record. You do not need to repeat your intake or provide a diagnosis. We use your saved service location, or your home city when it identifies one of our in-person locations.';
  const text=`Hi ${firstName||'there'},\n\n${introduction}\n\n${instruction}\n\nStill needed: ${fields}.\n\nUpdate your preferences: ${url}\n\nYour answers save directly to your client record and help Support identify appropriate providers. The link expires in 14 days. If you prefer to update us by phone or need help, reply to this email.\n\nThank you,\n${agencyName} Support Team`;
  const html=`<h1 style="font:700 26px/1.3 Arial;margin:0 0 20px">Help us find the right provider</h1><p>Hi ${escape(firstName||'there')},</p><p>${escape(introduction)}</p><p>${escape(instruction)}</p><p><strong>Still needed:</strong> ${escape(fields)}.</p><p style="margin:26px 0"><a href="${escape(url)}" style="display:inline-block;background:#28684d;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Update my service preferences</a></p><p>Your answers save directly to your client record and help Support identify appropriate providers. The link expires in 14 days.</p><p>If you prefer to update us by phone or need help, simply reply to this email.</p><p>Thank you,<br>${escape(agencyName)} Support Team</p>`;
  return {subject,text,html};
}

/** One explicit send per request key; retries return the receipt, never resend. */
export async function sendExchangePreferenceInvitation({listingId,agencyId,recipientUserId,actor,requestKey}) {
  if(!exchangeStaffRole(actor?.role))throw fail('Support access is required',403);
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(String(requestKey||'')))throw fail('A unique outreach request key is required');
  const db=await pool.getConnection();let lock=false;
  try {
    const [[held]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[`exchange-family:${agencyId}:${listingId}`]);
    if(!held?.acquired)throw fail('This invitation is being prepared. Try again shortly.',409);lock=true;
    const [[existing]]=await db.execute('SELECT id,parent_delivery_json FROM client_exchange_followups WHERE agency_id=? AND listing_id=? AND request_key=?',[agencyId,listingId,requestKey]);
    if(existing)return {id:existing.id,duplicate:true,delivery:parse(existing.parent_delivery_json)};
    const [[listing]]=await db.execute("SELECT * FROM client_exchange_listings WHERE id=? AND agency_id=? AND status IN ('open','requested')",[listingId,agencyId]);
    if(!listing)throw fail('This referral is no longer available',409);
    const scope={agency_id:agencyId,client_id:listing.client_id,recipient_user_id:recipientUserId};
    const recipient=await recipientFor(scope,db),client=await Client.findById(listing.client_id);
    const summary=await loadClientExchangeSummary({client}),missing=missingExchangeEssentials(summary);
    if(!missing.length)throw fail('The essential matching information is already complete',409);
    const gate=await familyNotificationDeliveryGate({agencyId,clientId:client.id,to:recipient.email,templateType:'client_exchange_preferences'});
    if(!gate.allowed)throw fail(gate.reason||'This family’s contact preferences require Support follow-up instead of email',409);
    const sender=await exchangeSupportSender(agencyId),agency=await Agency.findById(agencyId);
    const token=crypto.randomBytes(32).toString('hex');
    const [insert]=await db.execute(`INSERT INTO client_exchange_followups
      (agency_id,listing_id,client_id,recipient_user_id,actor_user_id,request_key,token_hash,recipient_hash,expires_at,requested_fields_json,parent_delivery_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[agencyId,listingId,client.id,recipientUserId,actor.id,requestKey,hash(token),emailHash(recipient.email),dateToMysqlUtcDateTime(new Date(Date.now()+14*86400000)),JSON.stringify(missing.map(item=>item.key)),JSON.stringify({status:'sending',attemptedAt:new Date().toISOString()})]);
    const url=new URL(`/api/public/exchange-preferences/${token}`,buildPublicAppUrl(agency)).href;
    let delivery;
    try {
      const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to:recipient.email,cc:sender.from_email,replyToOverride:sender.from_email,
        userId:recipientUserId,source:'manual',templateType:'client_exchange_preferences',
        ...buildExchangePreferenceEmail({firstName:recipient.first_name,agencyName:agency.name,url,missing}),linkUrl:url,
        internetMessageIdOverride:`<exchange-preferences-${insert.insertId}@${sender.from_email.split('@')[1]}>`});
      delivery={status:result.queued?'queued':result.id?'sent':result.blocked?'blocked':result.skipped?'skipped':'unknown',communicationId:result.communicationId||null,messageId:result.id||null,reason:result.reason||null};
    }catch(error){delivery={status:'unknown',reason:'Delivery needs review before any retry',code:error.code||null};}
    await db.execute('UPDATE client_exchange_followups SET parent_delivery_json=? WHERE id=?',[JSON.stringify(delivery),insert.insertId]);
    return {id:insert.insertId,delivery,missing:missing.map(item=>item.key)};
  }finally{if(lock)await db.execute('SELECT RELEASE_LOCK(?)',[`exchange-family:${agencyId}:${listingId}`]);db.release();}
}
