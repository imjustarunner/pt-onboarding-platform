import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { buildFamilyBillingEmail } from '../clientPortalEmailContent.js';
import pool from '../../config/database.js';
import { listBalances } from './views.js';
import { requireReadySender } from './senders.js';
import { isGuardianTestAccountId } from '../guardianTestAccess.service.js';
import {familyEnrollmentContext,portalUrlWithLocale} from '../familyPortalLocale.service.js';

/** Enqueue only newly posted balances. This never scans or re-mails historical bills. */
export async function queueBalanceNotifications({agencyId,receivableId,clientId},db=pool) {
  await db.execute(`INSERT IGNORE INTO family_balance_notifications (agency_id,receivable_id,guardian_user_id)
    SELECT ?,?,cg.guardian_user_id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
    WHERE c.agency_id=? AND cg.client_id=? AND EXISTS(SELECT 1 FROM client_billing_responsibility_profiles rp WHERE rp.agency_id=c.agency_id AND rp.client_id=c.id AND rp.party_kind='account' AND rp.responsible_user_id=cg.guardian_user_id) AND (cg.access_enabled=1 OR EXISTS(SELECT 1 FROM client_support_grants g JOIN client_portal_independence i ON i.client_id=g.client_id AND i.status='active' WHERE g.client_id=c.id AND g.agency_id=c.agency_id AND g.helper_user_id=cg.guardian_user_id AND g.revoked_at IS NULL AND JSON_CONTAINS(g.scopes_json,JSON_QUOTE('billing')))) AND (
      EXISTS(SELECT 1 FROM family_receivable_allocations a JOIN client_billing_payers p ON p.guardian_user_id=cg.guardian_user_id AND p.client_id=cg.client_id AND p.agency_id=c.agency_id AND p.status='active' WHERE a.receivable_id=? AND a.payer_user_id=cg.guardian_user_id AND a.amount_cents>a.paid_cents)
)`,[agencyId,receivableId,agencyId,clientId,receivableId]);
}

export async function sendPendingBalanceNotifications() {
  const [recipients]=await pool.execute("SELECT DISTINCT agency_id,guardian_user_id FROM family_balance_notifications WHERE status='pending' ORDER BY agency_id,guardian_user_id LIMIT 50");
  const results=[];
  for(const recipient of recipients) {
    const agencyId=Number(recipient.agency_id),userId=Number(recipient.guardian_user_id);
    // Explicit demo previews use a separate, recipient-locked script. Scheduled
    // balance notifications must not escape from fictional portal fixtures.
    if(await isGuardianTestAccountId(userId))continue;
    // A database lock prevents overlapping workers from sending the same digest.
    const db=await pool.getConnection();let locked=false,claimed=[];
    try {
      const [[lock]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[`family-balance-notify:${agencyId}:${userId}`]);
      locked=Number(lock.acquired)===1;if(!locked)continue;
      const [pending]=await db.execute("SELECT n.id,n.receivable_id,rp.party_kind,rp.responsible_user_id FROM family_balance_notifications n JOIN family_receivables r ON r.id=n.receivable_id LEFT JOIN client_billing_responsibility_profiles rp ON rp.agency_id=n.agency_id AND rp.client_id=r.client_id WHERE n.agency_id=? AND n.guardian_user_id=? AND n.status='pending' ORDER BY n.id LIMIT 200",[agencyId,userId]);
      const balances=await listBalances({agencyId,userId});
      const due=new Set(balances.filter(b=>b.isOwnShare&&!b.paymentStatus&&b.billingState==='due'&&b.dueCents>0).map(b=>Number(b.receivableId)));
      for(const row of pending) {
        if(row.party_kind!=='account'||Number(row.responsible_user_id)!==userId){await db.execute("UPDATE family_balance_notifications SET status='held' WHERE id=? AND status='pending'",[row.id]);continue;}
        if(due.has(Number(row.receivable_id)))claimed.push(Number(row.id));
        else await db.execute("UPDATE family_balance_notifications SET status='skipped' WHERE id=? AND status='pending'",[row.id]);
      }
      if(!claimed.length)continue;
      const sender=await requireReadySender(agencyId,'billing');
      const [[user]]=await db.execute("SELECT email FROM users WHERE id=? AND LOWER(status) IN ('active','active_employee')",[userId]);
      if(!user?.email)throw new Error('Recipient unavailable');
      const [[agency]]=await db.execute('SELECT name,slug,portal_url FROM agencies WHERE id=?',[agencyId]);
      const clientId = balances.find(b=>due.has(Number(b.receivableId)))?.clientId;
      const context=await clientEmailContext({agencyId,clientId});
      const [[delegate]]=await db.execute("SELECT client_id FROM client_portal_independence WHERE client_id=? AND status='active' AND user_id<>?",[clientId,userId]);
      const {locale}=await familyEnrollmentContext(userId,agencyId,db);
      const url=portalUrlWithLocale(context.url(delegate?'guardian?panel=assistance':'guardian?panel=billing'),locale);
      const marks=claimed.map(()=>'?').join(',');
      await db.execute(`UPDATE family_balance_notifications SET status='sending' WHERE id IN (${marks}) AND status='pending'`,claimed);
      const result=await sendClientPortalEmail({agencyId,clientId,context,billing:true,to:user.email,userId,
        ...buildFamilyBillingEmail({kind:'balance',agencyName:agency.name,url,locale}),
        templateType:'family_balance_due',source:'family_balance_due'});
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
