import pool from '../../config/database.js';
import {cardContext,refreshCardFollowup} from './service.js';
import {reminderOrdinal} from './policy.js';
import {guardianReminderPreferences} from '../guardianAppointments.service.js';
import {requireReadySender} from '../familyLedger/senders.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {buildPublicAppUrl} from '../../utils/publicPortalUrl.js';

/** Per-practice opt-in; no automatic enrollment of historical clients into outbound email. */
export async function runInsuranceCardReminders(deps={}) {
  const db=deps.db||pool,now=deps.now||new Date();
  await db.execute(`INSERT IGNORE INTO insurance_card_followups(profile_id,agency_id)
    SELECT p.id,p.agency_id FROM guardian_insurance_profiles p JOIN agencies a ON a.id=p.agency_id
    WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0`);
  const [due]=await db.execute(`SELECT f.profile_id,f.agency_id,s.enabled FROM insurance_card_followups f LEFT JOIN insurance_card_reminder_settings s ON s.agency_id=f.agency_id WHERE f.next_check_at<=? ORDER BY f.next_check_at,f.profile_id LIMIT 50`,[now]);
  const results=[];
  for(const row of due) {
    const connection=await db.getConnection();let locked=false,deliveryId=null;
    try {
      const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) AS acquired',[`insurance-card:${row.profile_id}`]);
      locked=Number(lock.acquired)===1;if(!locked)continue;
      const context=await (deps.context||cardContext)({agencyId:row.agency_id,profileId:row.profile_id,staff:true},connection);
      const progress=await (deps.refresh||refreshCardFollowup)(context,connection);
      if(!row.enabled||progress.state!=='missing'||!progress.email_enabled||(progress.snoozed_until&&new Date(progress.snoozed_until)>now))continue;
      const profile=context.profile;
      if(!profile.email||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(profile.user_status).toUpperCase()))continue;
      let emailAllowed=true;
      for(const client of context.clients) {
        const preferences=await (deps.preferences||guardianReminderPreferences)({userId:profile.guardian_user_id,clientId:client.id});
        if(preferences.channels?.email===false||preferences.optionalRemindersEnabled===false)emailAllowed=false;
      }
      if(!emailAllowed)continue;
      const ordinal=reminderOrdinal(progress.first_requested_at,now);
      if(ordinal==null)continue;
      // An uncertain transport outcome is held until staff investigates, not retried next week.
      const [[uncertain]]=await connection.execute("SELECT id FROM insurance_card_deliveries WHERE profile_id=? AND cycle_hash=? AND status IN ('sending','unknown','held') LIMIT 1",[row.profile_id,progress.cycle_hash]);
      if(uncertain)continue;
      const sender=await (deps.sender||requireReadySender)(row.agency_id,'billing');
      const [claim]=await connection.execute("INSERT IGNORE INTO insurance_card_deliveries(profile_id,cycle_hash,ordinal,status) VALUES (?,?,?,'sending')",[row.profile_id,progress.cycle_hash,ordinal]);
      if(!claim.affectedRows)continue;
      deliveryId=claim.insertId;
      // Re-check authority and document completion immediately before dispatch.
      const current=await (deps.context||cardContext)({agencyId:row.agency_id,profileId:row.profile_id,staff:true},connection);
      const latest=await (deps.refresh||refreshCardFollowup)(current,connection);
      if(latest.state!=='missing'||latest.cycle_hash!==progress.cycle_hash||!latest.email_enabled||(latest.snoozed_until&&new Date(latest.snoozed_until)>now)) {
        await connection.execute("UPDATE insurance_card_deliveries SET status='skipped' WHERE id=?",[deliveryId]);continue;
      }
      const [[settings]]=await connection.execute('SELECT enabled FROM insurance_card_reminder_settings WHERE agency_id=?',[row.agency_id]);
      const recipient=current.profile;
      if(!settings?.enabled||!recipient.email||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(recipient.user_status).toUpperCase())) {
        await connection.execute("UPDATE insurance_card_deliveries SET status='skipped' WHERE id=?",[deliveryId]);continue;
      }
      const url=buildPublicAppUrl({slug:recipient.slug,portal_url:recipient.portal_url},`guardian?panel=payment_methods&insuranceProfile=${profile.id}`);
      const response=await (deps.send||sendEmailFromIdentity)({senderIdentityId:sender.id,replyToOverride:sender.from_email,to:recipient.email,userId:recipient.guardian_user_id,
        subject:'Please complete your insurance information',text:`Your care team needs an insurance card image. Sign in to see which side is missing and upload a photo or PDF.\n\n${url}\n\nPlease use the secure upload instead of attaching cards to an email reply. If you do not have the card or need help, choose “I need help” in the portal. You can pause these emails there.`,templateType:'insurance_card_followup',source:'insurance_card_followup',usedFallbackSender:false});
      const sent=!!response?.id&&!response.queued&&!response.skipped&&!response.blocked&&!response.redirected;
      await connection.execute('UPDATE insurance_card_deliveries SET status=?,communication_id=? WHERE id=?',[sent?'sent':'held',response?.communicationId||null,deliveryId]);
      results.push({agencyId:row.agency_id,status:sent?'sent':'held'});
    }catch(e) {
      if(deliveryId)await connection.execute("UPDATE insurance_card_deliveries SET status='unknown' WHERE id=? AND status='sending'",[deliveryId]);
      await connection.execute('UPDATE insurance_card_followups SET next_check_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 HOUR) WHERE profile_id=?',[row.profile_id]);
      results.push({agencyId:row.agency_id,status:e.status===404?'inactive':'needs_review'});
    }finally{try{if(locked){try{await connection.execute('UPDATE insurance_card_followups SET next_check_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 HOUR) WHERE profile_id=?',[row.profile_id]);}finally{await connection.execute('SELECT RELEASE_LOCK(?)',[`insurance-card:${row.profile_id}`]);}}}finally{connection.release();}}
  }
  return results;
}
