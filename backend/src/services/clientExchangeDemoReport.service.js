import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildDemoExchangeReport({listing,providers,link}) {
  const matched=providers.filter(p=>p.matched);
  const details=providers.map(p=>({id:Number(p.userId),name:p.name || `Provider #${p.userId}`,
    outcome:p.matched?'Would match':'Would not match',
    reasons:(p.checks || []).filter(c=>p.matched ? c.status==='pass' : ['fail','error'].includes(c.status)).map(c=>c.reason),
    confirmation:(p.checks || []).filter(c=>c.status==='unknown'&&c.applicable!==false).map(c=>c.reason),
    hold:p.notificationHold || (p.canNotify===false?'Would not receive an automatic match notification under current availability/settings.':null)}));
  const intro=`DEMO ONLY — Referral #${listing.id}. ${matched.length} would match; ${providers.length-matched.length} would not match. Provider email, text, push and in-app notifications are suppressed for this evaluation. This listing is hidden from providers.`;
  const lines=details.map(p=>[`${p.name} (#${p.id}): ${p.outcome}`,...p.reasons,...p.confirmation.map(r=>`Needs confirmation: ${r}`),p.hold].filter(Boolean).join('\n'));
  return {subject:`DEMO ONLY: Client Exchange #${listing.id} — ${matched.length} possible matches`,
    text:[intro,...lines,`Staff matching audit: ${link}`].join('\n\n'),
    html:`<h1 style="font:700 26px/1.3 Arial">Demo Client Exchange matching report</h1><p>${escape(intro)}</p><p><a href="${escape(link)}">Open the staff matching audit</a></p>${details.map(p=>`<h2 style="font:700 19px/1.4 Arial">${escape(p.name)} — ${p.outcome}</h2><ul>${p.reasons.concat(p.confirmation.map(r=>`Needs confirmation: ${r}`),p.hold?[p.hold]:[]).map(r=>`<li>${escape(r)}</li>`).join('')}</ul>`).join('')}`};
}

// Caller holds the listing lock. Changed matching outcomes get one report; a
// retry never blindly repeats an accepted, queued or uncertain delivery.
export async function sendDemoExchangeReport({listing,agency,identities,providers}) {
  const support=identities.find(i=>i.identity_key==='support');
  const to=agency?.support_team_email || support?.from_email;
  if(!to)throw Object.assign(new Error('Configure the agency Support mailbox for demo reports'),{code:'DEMO_EXCHANGE_SUPPORT_MISSING'});
  const sender=identities.find(i=>i.identity_key==='client_exchange') || identities.find(i=>i.identity_key==='notifications');
  if(!sender?.id)throw Object.assign(new Error('Configure a Client Exchange test-report sender'),{code:'DEMO_EXCHANGE_SENDER_MISSING'});
  const key='demo-v1:'+createHash('sha256').update(JSON.stringify({version:'demo-v1',to,listingId:listing.id,demographics:listing.demographics,preferences:listing.preferences,presentingProblems:listing.presentingProblems,diagnoses:listing.diagnoses,providers:providers.map(p=>({id:p.userId,matched:p.matched,checks:p.checks,canNotify:p.canNotify,hold:p.notificationHold})).sort((a,b)=>a.id-b.id)})).digest('hex').slice(0,32);
  const [[previous]]=await pool.execute('SELECT status FROM client_exchange_audit_reports WHERE listing_id=? AND report_key=?',[listing.id,key]);
  if(previous && ['sent','queued','sending','unknown','redirected'].includes(previous.status))return {status:previous.status,duplicate:true};
  const link=`${buildPublicAppUrl(agency,'client-exchange')}?listingId=${listing.id}&agencyId=${listing.agencyId}`;
  await pool.execute(`INSERT INTO client_exchange_audit_reports (listing_id,report_key,status) VALUES (?,?,'sending')
    ON DUPLICATE KEY UPDATE status='sending'`,[listing.id,key]);
  try {
    const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to,replyToOverride:to,source:'auto',
      ...buildDemoExchangeReport({listing,providers,link}),templateType:'client_exchange_demo_audit',linkUrl:link,
      fromDisplayNameOverride:'Client Exchange — Demo testing',internetMessageIdOverride:`<exchange-demo-${listing.id}-${key}@${sender.from_email.split('@')[1]}>`});
    const status=result?.redirected?'redirected':result?.queued?'queued':result?.blocked||result?.failed?'failed':result?.skipped?'skipped':result?.id||result?.sent?'sent':'unknown';
    await pool.execute("UPDATE client_exchange_audit_reports SET status=?,communication_id=?,sent_at=IF(?='sent',NOW(),NULL) WHERE listing_id=? AND report_key=?",[status,result?.communicationId||null,status,listing.id,key]);
    return {status};
  }catch(error){await pool.execute("UPDATE client_exchange_audit_reports SET status='unknown' WHERE listing_id=? AND report_key=?",[listing.id,key]);throw error;}
}
