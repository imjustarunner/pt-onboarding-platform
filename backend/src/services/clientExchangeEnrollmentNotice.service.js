import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
const parse=v=>typeof v==='string'?JSON.parse(v||'{}'):v||{};
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Persist the attempt before sending; uncertain delivery requires review, not another copy. */
export async function sendNewClientSupportNotice({agencyId,clientId}) {
  const db=await pool.getConnection();let locked=false;
  try {
    const [[lock]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[`new-client-support:${agencyId}:${clientId}`]);
    if(!lock?.acquired)return {status:'busy'};locked=true;
    const [[client]]=await db.execute('SELECT id,initials,intake_preferences_json FROM clients WHERE id=? AND agency_id=?',[clientId,agencyId]);
    if(!client)return {status:'unavailable'};
    const existing=parse(client.intake_preferences_json).newClientSupportNotice;
    if(existing)return {...existing,duplicate:true};
    const agency=await Agency.findById(agencyId),identities=await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
    const support=identities.find(row=>row.identity_key==='support');
    const to=agency.support_team_email || support?.from_email || agency.onboarding_team_email;
    const sender=support || identities.find(row=>row.identity_key==='notifications');
    if(!to||!sender)return {status:'blocked',reason:'Configure the agency Support mailbox and sender'};
    const save=receipt=>db.execute("UPDATE clients SET intake_preferences_json=JSON_SET(COALESCE(intake_preferences_json,JSON_OBJECT()),'$.newClientSupportNotice',CAST(? AS JSON)) WHERE id=? AND agency_id=?",[JSON.stringify(receipt),clientId,agencyId]);
    await save({status:'sending',attemptedAt:new Date().toISOString()});
    const link=buildPublicAppUrl(agency,`admin/office-intake-queue?clientId=${Number(clientId)}`);
    const subject='New client submitted — ready for Support review';
    const text=`A new client has submitted an enrollment request.\n\nClient #${clientId} (${client.initials || 'initials pending'}) is in New Clients for Support review. Please review the saved visit format, in-person city, insurance, days and times, and clinical concerns. When ready, add the client to Client Exchange from the client list.\n\nReview new client: ${link}\n\nThank you,\n${agency.name} Support Team`;
    let receipt;
    try {
      const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to,replyToOverride:to,source:'auto',templateType:'new_client_submitted_support',
        subject,text,html:`<h1 style="font:700 26px/1.3 Arial">A new client is ready for review</h1><p>Client #${Number(clientId)} (${escape(client.initials)}) has submitted an enrollment request and is in <strong>New Clients</strong>.</p><p>Please review the saved visit format, in-person city, insurance, days and times, and clinical concerns. When ready, use <strong>Post to exchange</strong> from the client list.</p><p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;background:#28684d;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Review new client</a></p><p>Thank you,<br>${escape(agency.name)} Support Team</p>`,
        linkUrl:link,internetMessageIdOverride:`<new-client-support-${agencyId}-${clientId}@${sender.from_email.split('@')[1]}>`});
      receipt={status:result.status || (result.queued?'queued':result.blocked?'blocked':result.skipped?'skipped':result.id||result.sent?'sent':'unknown'),communicationId:result.communicationId||null,messageId:result.id||null,reason:result.reason||null};
    }catch{receipt={status:'unknown',reason:'Review communication history before retrying'};}
    await save(receipt);return receipt;
  }finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`new-client-support:${agencyId}:${clientId}`]);db.release();}
}
