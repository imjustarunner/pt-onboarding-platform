import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import { ensureTenantNoreplyMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { shouldReplyToUnmonitored } from '../utils/unmonitoredMailbox.js';
import { classifyUnsolicitedOutreach, outreachRejectionContent, isSharedOutreachTarget } from './unsolicitedOutreachPolicy.js';
import { groupKeyForIdentity } from './departmentalGroupPolicy.js';

const AUTO_REASON = 'auto_unsolicited:';
const emailAddress = value => {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 255 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : '';
};

// Established care, staff, school and vendor relationships are never classified
// as unsolicited just because one of their messages mentions a commercial term.
export async function isEstablishedOutreachSender(agencyId, email) {
  email=emailAddress(email);
  if (!email) return true;
  const [users, clients, guardians, schools, contact] = await Promise.all([
    pool.execute(`SELECT id FROM users WHERE COALESCE(is_archived,0)=0 AND
      (LOWER(TRIM(email))=? OR LOWER(TRIM(work_email))=? OR LOWER(TRIM(personal_email))=?) LIMIT 1`,[email,email,email]),
    pool.execute(`SELECT id FROM clients WHERE agency_id=? AND LOWER(TRIM(email))=? LIMIT 1`,[agencyId,email]),
    pool.execute(`SELECT cg.client_id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id JOIN users u ON u.id=cg.guardian_user_id
      WHERE c.agency_id=? AND (LOWER(TRIM(u.email))=? OR LOWER(TRIM(u.personal_email))=?) LIMIT 1`,[agencyId,email,email]),
    pool.execute(`SELECT id FROM school_contacts WHERE LOWER(TRIM(email))=? LIMIT 1`,[email]),
    AgencyContact.findByEmail(email,agencyId)
  ]);
  return [users,clients,guardians,schools].some(result=>result[0]?.length > 0) || !!contact;
}

/** Returns filtered before any ticket, routing, email forwarding or staff alert. */
export async function filterUnsolicitedOutreach({agencyId,fromEmail,subject='',bodyText='',source='public_web',headers=new Map(),trustedSender=false} = {}) {
  const aid=Number(agencyId),email=emailAddress(fromEmail);
  if (!Number.isSafeInteger(aid) || aid<=0 || trustedSender) return {filtered:false};
  const classification=classifyUnsolicitedOutreach({subject,bodyText});
  if (!email) return {filtered:classification.reject,reason:classification.reason,noticeQueued:false};
  const [[blocked]]=await pool.execute(`SELECT id,reason FROM communication_blocked_addresses WHERE agency_id=? AND address_kind='email' AND address=? LIMIT 1`,[aid,email]);
  if (blocked) {
    // A fresh request for care or a job application can still reach staff; the
    // automatic commercial block continues to suppress subsequent pitches.
    if (String(blocked.reason || '').startsWith(AUTO_REASON) && ['care_request','job_applicant'].includes(classification.reason)) return {filtered:false};
    if (String(blocked.reason || '').startsWith(AUTO_REASON)) await pool.execute(`UPDATE unsolicited_outreach_notices SET suppression_count=suppression_count+1,last_seen_at=CURRENT_TIMESTAMP WHERE agency_id=? AND sender_email=?`,[aid,email]);
    return {filtered:true,reason:'blocked_sender',noticeQueued:false};
  }
  if (!classification.reject) return {filtered:false};
  try {
    if (await isEstablishedOutreachSender(aid,email)) return {filtered:false};
  } catch (error) {
    // An unavailable relationship lookup must not discard a possible care request.
    console.warn('[outreach filter] Relationship check unavailable',error.code || 'lookup_failed');
    return {filtered:false};
  }
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute(`INSERT IGNORE INTO communication_blocked_addresses (agency_id,address,address_kind,reason) VALUES (?,?,'email',?)`,[aid,email,`${AUTO_REASON}${classification.reason}`]);
    const [[current]]=await db.execute(`SELECT reason FROM communication_blocked_addresses WHERE agency_id=? AND address_kind='email' AND address=?`,[aid,email]);
    let noticeQueued=false;
    if (String(current?.reason || '').startsWith(AUTO_REASON)) {
      const canReply=shouldReplyToUnmonitored({headers,fromEmail:email});
      await db.execute(`INSERT INTO unsolicited_outreach_notices (agency_id,sender_email,category,source,status)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE suppression_count=suppression_count+1,last_seen_at=CURRENT_TIMESTAMP`,
        [aid,email,classification.reason,source==='group_email'?'group_email':'public_web',canReply?'queued':'skipped']);
      noticeQueued=canReply;
    }
    await db.commit();
    return {filtered:true,reason:classification.reason,noticeQueued};
  } catch(error) {await db.rollback();throw error;} finally {db.release();}
}

export async function filterSharedMailboxOutreach({identity,fromEmail,subject,bodyText,headers,ourFromEmails=[]} = {}) {
  if (!isSharedOutreachTarget(identity,groupKeyForIdentity(identity))) return {filtered:false};
  return filterUnsolicitedOutreach({agencyId:identity.agency_id,fromEmail,subject,bodyText,headers,source:'group_email',
    trustedSender:ourFromEmails.some(email=>String(email).toLowerCase()===String(fromEmail).toLowerCase())});
}

/** Durable, bounded and once-only. An uncertain send is held, never replayed. */
export async function sendQueuedOutreachRejections({limit=20}={}) {
  await pool.execute(`UPDATE unsolicited_outreach_notices SET status='needs_review',last_error='Delivery interrupted; verify communication history before retrying'
    WHERE status='sending' AND attempted_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)`);
  const [rows]=await pool.execute(`SELECT * FROM unsolicited_outreach_notices WHERE status='queued' AND ready_at<=UTC_TIMESTAMP() ORDER BY id LIMIT ?`,[Math.max(1,Math.min(50,Math.floor(Number(limit))||20))]);
  const results=[];
  for (const row of rows) {
    const [claim]=await pool.execute(`UPDATE unsolicited_outreach_notices SET status='sending',attempted_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=? AND status='queued'`,[row.id]);
    if (!claim.affectedRows) continue;
    try {
      const [[blocked]]=await pool.execute(`SELECT id FROM communication_blocked_addresses WHERE agency_id=? AND address_kind='email' AND address=? LIMIT 1`,[row.agency_id,row.sender_email]);
      if (!blocked || await isEstablishedOutreachSender(row.agency_id,row.sender_email)) {
        await pool.execute(`UPDATE unsolicited_outreach_notices SET status='skipped',last_error='Sender unblocked or relationship now established' WHERE id=?`,[row.id]);
        results.push({id:row.id,status:'skipped'});continue;
      }
      const [agency,mailbox]=await Promise.all([Agency.findById(row.agency_id),ensureTenantNoreplyMailbox(row.agency_id)]);
      const sender=mailbox?.noreply;
      if (!sender?.id || Number(sender.agency_id)!==Number(row.agency_id) || !Number(sender.is_active) || !/^no[-_.]?reply@[^\s@]+$/i.test(String(sender.from_email || ''))) throw new Error('Active tenant no-reply identity required');
      const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to:row.sender_email,replyToOverride:sender.from_email,
        source:'auto',templateType:'unsolicited_outreach_rejection',...outreachRejectionContent(agency?.name),
        internetMessageIdOverride:`<outreach-${createHash('sha256').update(`${row.agency_id}:${row.id}`).digest('hex').slice(0,32)}@${sender.from_email.split('@')[1]}>`});
      if (result?.skipped) {
        await pool.execute(`UPDATE unsolicited_outreach_notices SET status='queued',ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),last_error=? WHERE id=?`,[String(result.reason || 'email_skipped').slice(0,255),row.id]);
        results.push({id:row.id,status:'queued'});continue;
      }
      const accepted=!!result?.id && !result.failed && !result.blocked && !result.queued && !result.pendingApproval && !result.redirected;
      await pool.execute(`UPDATE unsolicited_outreach_notices SET status=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=? WHERE id=?`,
        [accepted?'sent':'needs_review',result?.communicationId || null,accepted?'sent':'needs_review',accepted?null:'Delivery not confirmed; verify communication history before retrying',row.id]);
      results.push({id:row.id,status:accepted?'sent':'needs_review'});
    } catch(error) {
      await pool.execute(`UPDATE unsolicited_outreach_notices SET status='needs_review',last_error=? WHERE id=?`,[String(error.code || error.message).slice(0,255),row.id]);
      results.push({id:row.id,status:'needs_review'});
    }
  }
  return results;
}
