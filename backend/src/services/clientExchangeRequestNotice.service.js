import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** One group-mailbox notice per saved request, including on concurrent retries. */
export async function sendExchangeRequestSupportNotice({requestId}) {
  if(!Number.isSafeInteger(Number(requestId)) || Number(requestId)<1)return {status:'unavailable'};
  const db=await pool.getConnection(),key=`exchange-request-support:${Number(requestId)}`;let locked=false;
  try {
    const [[lock]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[key]);
    if(!lock?.acquired)return {status:'busy'};locked=true;
    const [[request]]=await db.execute(`SELECT r.id,r.status,r.support_notice_json,r.requesting_provider_user_id,
      l.id AS listing_id,l.agency_id,u.first_name,u.last_name FROM client_exchange_requests r
      JOIN client_exchange_listings l ON l.id=r.listing_id JOIN users u ON u.id=r.requesting_provider_user_id WHERE r.id=?`,[requestId]);
    if(!request)return {status:'unavailable'};
    const existing=typeof request.support_notice_json==='string'?JSON.parse(request.support_notice_json):request.support_notice_json;
    if(existing)return {...existing,duplicate:true};
    if(request.status!=='pending')return {status:'skipped',reason:'Request is already resolved'};
    const agency=await Agency.findById(request.agency_id);
    const identities=await EmailSenderIdentity.list({agencyId:request.agency_id,includePlatformDefaults:false,onlyActive:true});
    const support=identities.find(row=>row.identity_key==='support');
    const to=agency?.support_team_email || support?.from_email || agency?.onboarding_team_email;
    const sender=identities.find(row=>row.identity_key==='client_exchange') || identities.find(row=>row.identity_key==='notifications');
    if(!to||!sender)return {status:'blocked',reason:'Configure the agency Support mailbox and Client Exchange sender'};
    const save=receipt=>db.execute('UPDATE client_exchange_requests SET support_notice_json=? WHERE id=?',[JSON.stringify(receipt),requestId]);
    await save({status:'sending',attemptedAt:new Date().toISOString()});
    const link=`${buildPublicAppUrl(agency,'client-exchange')}?listingId=${Number(request.listing_id)}&agencyId=${Number(request.agency_id)}`;
    const name=[request.first_name,request.last_name].filter(Boolean).join(' ') || `Provider #${request.requesting_provider_user_id}`;
    const subject=`Client Exchange: a provider requested referral #${request.listing_id}`;
    const text=`${name} has requested referral #${request.listing_id} in Client Exchange.\n\nPlease review request #${request.id}, the current match details, and any acknowledged differences before assigning the client. A request does not assign the client automatically.\n\nReview request: ${link}`;
    let receipt;
    try {
      const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to,replyToOverride:to,fromDisplayNameOverride:`${agency.name} Client Exchange`,source:'auto',
        templateType:'client_exchange_request_support',subject,text,linkUrl:link,
        html:`<h1 style="font:700 26px/1.3 Arial">A provider has requested a client</h1><p><strong>${escape(name)}</strong> requested referral <strong>#${Number(request.listing_id)}</strong> in Client Exchange.</p><p>Please review request #${Number(request.id)}, the current match details, and any acknowledged differences before assigning the client. A request does not assign the client automatically.</p><p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;background:#28684d;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Review request</a></p>`,
        internetMessageIdOverride:`<exchange-request-support-${request.agency_id}-${request.id}@${sender.from_email.split('@')[1]}>`});
      receipt={status:result.status||(result.queued?'queued':result.blocked?'blocked':result.skipped?'skipped':result.id||result.sent?'sent':'unknown'),communicationId:result.communicationId||null,messageId:result.id||null,reason:result.reason||null};
    } catch {receipt={status:'unknown',reason:'Review communication history before retrying'};}
    await save(receipt);return receipt;
  } finally {if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[key]);db.release();}
}
