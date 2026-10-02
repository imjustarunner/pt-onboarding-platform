import pool from '../../config/database.js';
import { listBalances } from './views.js';
import { requireReadySender } from './senders.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';

/** Enqueue only newly posted balances. This never scans or re-mails historical bills. */
export async function queueBalanceNotifications({agencyId,receivableId,clientId},db=pool) {
  await db.execute(`INSERT IGNORE INTO family_balance_notifications (agency_id,receivable_id,guardian_user_id)
    SELECT ?,?,cg.guardian_user_id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
    WHERE c.agency_id=? AND cg.client_id=? AND cg.access_enabled=1 AND (
      EXISTS(SELECT 1 FROM family_receivable_allocations a JOIN client_billing_payers p ON p.guardian_user_id=cg.guardian_user_id AND p.client_id=cg.client_id AND p.agency_id=c.agency_id AND p.status='active' WHERE a.receivable_id=? AND a.payer_user_id=cg.guardian_user_id)
      OR EXISTS(SELECT 1 FROM guardian_portal_policies gp WHERE gp.agency_id=c.agency_id AND gp.client_id=c.id AND gp.shared_billing=1)
      OR EXISTS(SELECT 1 FROM family_statement_shares s WHERE s.agency_id=c.agency_id AND s.client_id=c.id AND s.guardian_user_id=cg.guardian_user_id AND s.active=1))`,[agencyId,receivableId,agencyId,clientId,receivableId]);
}

export async function sendPendingBalanceNotifications() {
  const [recipients]=await pool.execute("SELECT DISTINCT agency_id,guardian_user_id FROM family_balance_notifications WHERE status='pending' ORDER BY agency_id,guardian_user_id LIMIT 50");
  const results=[];
  for(const recipient of recipients) {
    const agencyId=Number(recipient.agency_id),userId=Number(recipient.guardian_user_id);
    // A database lock prevents overlapping workers from sending the same digest.
    const db=await pool.getConnection();let locked=false,claimed=[];
    try {
      const [[lock]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[`family-balance-notify:${agencyId}:${userId}`]);
      locked=Number(lock.acquired)===1;if(!locked)continue;
      const [pending]=await db.execute("SELECT id,receivable_id FROM family_balance_notifications WHERE agency_id=? AND guardian_user_id=? AND status='pending' ORDER BY id LIMIT 200",[agencyId,userId]);
      const balances=await listBalances({agencyId,userId});
      const due=new Set(balances.filter(b=>b.billingState==='due'&&b.dueCents>0).map(b=>Number(b.receivableId)));
      for(const row of pending) {
        if(due.has(Number(row.receivable_id)))claimed.push(Number(row.id));
        else await db.execute("UPDATE family_balance_notifications SET status='skipped' WHERE id=? AND status='pending'",[row.id]);
      }
      if(!claimed.length)continue;
      const sender=await requireReadySender(agencyId,'billing');
      const [[user]]=await db.execute("SELECT email FROM users WHERE id=? AND LOWER(status) IN ('active','active_employee')",[userId]);
      if(!user?.email)throw new Error('Recipient unavailable');
      const [[agency]]=await db.execute('SELECT name,slug,portal_url FROM agencies WHERE id=?',[agencyId]);
      const origin=String(process.env.FRONTEND_URL||'https://plottwisthq.com').replace(/\/$/,'');
      const url=`${origin}/${encodeURIComponent(agency.portal_url||agency.slug)}/guardian?panel=billing`;
      const marks=claimed.map(()=>'?').join(',');
      await db.execute(`UPDATE family_balance_notifications SET status='sending' WHERE id IN (${marks}) AND status='pending'`,claimed);
      const result=await sendEmailFromIdentity({senderIdentityId:sender.id,replyToOverride:sender.from_email,to:user.email,userId,
        subject:`${agency.name}: a new payment is due`,text:`A new payment is due. Sign in to your secure portal to view service dates, payment details, and the amount assigned to you.\n\n${url}\n\nStatements are shared with authorized guardians. Saving a card or receiving this notification does not authorize a new charge. Contact billing if you need help.`,
        templateType:'family_balance_due',source:'family_balance_due',usedFallbackSender:false});
      const sent=!!result?.id&&!result.queued&&!result.skipped&&!result.blocked&&!result.redirected;
      await db.execute(`UPDATE family_balance_notifications SET status=?,communication_id=? WHERE id IN (${marks})`,[sent?'sent':'held',result?.communicationId||null,...claimed]);
      results.push({agencyId,userId,status:sent?'sent':'held'});
    } catch(error) {
      if(claimed.length)await db.execute(`UPDATE family_balance_notifications SET status=IF(status='sending','unknown','held') WHERE id IN (${claimed.map(()=>'?').join(',')})`,claimed);
      results.push({agencyId,userId,status:'needs_review'});
    } finally {
      if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`family-balance-notify:${agencyId}:${userId}`]);
      db.release();
    }
  }
  return results;
}
