import pool from '../config/database.js';
import {portalMigrationOverview} from './portalMigration.service.js';
import {familyNotificationDeliveryGate} from './familyNotificationChoices.service.js';
import {sendClientPortalEmail} from './clientPortalEmail.service.js';

export const hasActionableOnboarding = overview => !!overview?.enrolled && overview.items?.some(item => !item.complete && !item.waiting);
// A single account reminder per 48 hours, even when several profiles or agencies
// need attention. Only a delivered migration welcome starts this reminder flow.
export async function sendDueOnboardingReminder(userId,db=pool) {
 const connection=await db.getConnection();let locked=false;
 try {
  const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) acquired',[`portal-onboarding:${userId}`]);
  if(!Number(lock?.acquired))return {skipped:'busy'};locked=true;
  const [[recent]]=await connection.execute("SELECT id FROM family_portal_onboarding_reminders WHERE guardian_user_id=? AND (created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 48 HOUR) OR status IN ('sending','unknown')) LIMIT 1",[userId]);
  if(recent)return {skipped:'already_processed'};
  const [profiles]=await connection.execute(`SELECT e.agency_id,e.client_id,u.id,u.role,u.email,a.slug FROM family_portal_migration_enrollments e
   JOIN users u ON u.id=e.guardian_user_id JOIN clients c ON c.id=e.client_id AND c.agency_id=e.agency_id
   JOIN agencies a ON a.id=e.agency_id JOIN client_guardians cg ON cg.guardian_user_id=u.id AND cg.client_id=c.id
   WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_demo,0)=0 AND u.terminated_at IS NULL AND COALESCE(u.is_archived,0)=0
   AND u.role IN ('client','client_guardian') AND cg.access_enabled=1 AND c.status='ACTIVE' AND a.is_active=1
   AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())
   AND e.created_at<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 48 HOUR)
   AND EXISTS (SELECT 1 FROM family_portal_migration_deliveries d WHERE d.agency_id=e.agency_id AND d.guardian_user_id=u.id AND d.status='sent' AND d.created_at<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 48 HOUR))
   ORDER BY e.created_at,e.agency_id,e.client_id`,[userId]);
  for(const profile of profiles){
   const input={user:{id:userId,role:profile.role},agencyId:profile.agency_id,clientId:profile.client_id};
   let overview;try{overview=await portalMigrationOverview(input);}catch(e){if([403,404].includes(e.status))continue;throw e;}
   if(!hasActionableOnboarding(overview))continue;
   const gate=await familyNotificationDeliveryGate({agencyId:profile.agency_id,clientId:profile.client_id,to:profile.email,templateType:'portal_onboarding_reminder'});
   if(!gate.allowed)continue;
   const [claim]=await connection.execute('INSERT INTO family_portal_onboarding_reminders (agency_id,guardian_user_id) VALUES (?,?)',[profile.agency_id,userId]);
   const link=`https://auricwell.com/${encodeURIComponent(profile.slug)}/guardian?panel=onboarding&clientId=${profile.client_id}`;
   try{
    const result=await sendClientPortalEmail({agencyId:profile.agency_id,clientId:profile.client_id,userId,to:profile.email,source:'auto',templateType:'portal_onboarding_reminder',subject:'A few steps remain in your new portal',text:`Thank you for making the move to your new portal. A few onboarding steps are still available for you to complete. Please sign in to review your information and finish the steps shown for your profile.\n\n${link}\n\nYour progress is saved. You can switch profiles in My family. We will remind you no more than once every 48 hours while available steps remain and email updates are enabled. If a step is waiting for your care team, you do not need to complete it yet.`,linkUrl:link,linkLabel:'Continue onboarding'});
    const sent=!!result?.id&&!result.queued&&!result.skipped&&!result.blocked&&!result.pendingApproval;
    await connection.execute("UPDATE family_portal_onboarding_reminders SET status=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),reason=? WHERE id=?",[sent?'sent':'held',sent?'sent':'held',sent?null:'Delivery held by existing notification controls',claim.insertId]);
    return {sent};
   }catch(e){await connection.execute("UPDATE family_portal_onboarding_reminders SET status='unknown',reason='Review delivery before attempting another reminder' WHERE id=?",[claim.insertId]);throw e;}
  }
  return {skipped:'no_actionable_steps'};
 }finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[`portal-onboarding:${userId}`]);connection.release();}
}
export async function processPortalOnboardingReminders(){
 if(process.env.PORTAL_ONBOARDING_REMINDERS_ENABLED==='false')return;
 let after=0;
 while(true){const [rows]=await pool.execute(`SELECT DISTINCT e.guardian_user_id FROM family_portal_migration_enrollments e JOIN family_portal_migration_deliveries d ON d.agency_id=e.agency_id AND d.guardian_user_id=e.guardian_user_id AND d.status='sent' WHERE e.guardian_user_id>? ORDER BY e.guardian_user_id LIMIT 25`,[after]);if(!rows.length)return;for(const row of rows){after=Number(row.guardian_user_id);try{await sendDueOnboardingReminder(after);}catch(e){console.warn('[portal onboarding reminder]',e.code||'delivery_needs_review');}}}
}
