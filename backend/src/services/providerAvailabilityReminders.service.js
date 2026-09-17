import pool from '../config/database.js';
import User from '../models/User.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import Task from '../models/Task.model.js';
import Notification from '../models/Notification.model.js';
import Availability from './providerAvailability.service.js';
import { providerAvailabilityPreferences, missingAvailabilityFormats, availabilitySettingsPath } from '../utils/providerAvailabilityReminders.js';

export function createProviderAvailabilityReminders({pool,User,Profile,Task,Notification,Availability}) {
async function readProviderAvailabilitySettings(providerId, agencyId) {
 const user = await User.findById(providerId);
 const profile = await Profile.getForProvider({providerUserId:providerId});
 const [reminders] = await pool.execute(`SELECT r.*,nur.snoozed_until FROM provider_availability_reminders r
 LEFT JOIN notification_user_reads nur ON nur.notification_id=r.notification_id AND nur.user_id=r.provider_id
 WHERE r.provider_id=? AND r.agency_id=?`,[providerId,agencyId]);
 return {preferences:providerAvailabilityPreferences(user,profile),reminders:reminders.filter(r=>r.is_missing).map(r=>({
  id:r.id,format:r.format,taskId:r.task_id,notificationId:r.notification_id,checkedAt:r.checked_at,
  snoozedUntil:r.snoozed_until,snoozed:Boolean(r.snoozed_until && new Date(r.snoozed_until).getTime()>Date.now())
 })),checkedAt:reminders[0]?.checked_at || null};
}

async function checkProviderAvailability(providerId, agencyId) {
 const connection=await pool.getConnection();
 const lock=`provider-availability:${agencyId}:${providerId}`;
 try {
  const [[result]]=await connection.query('SELECT GET_LOCK(?,0) AS acquired',[lock]);
  if(!result.acquired)return;
  const user=await User.findById(providerId);
  const profile=await Profile.getForProvider({providerUserId:providerId});
  const preferences=providerAvailabilityPreferences(user,profile);
  const slots={inPersonSlots:[],virtualSlots:[]};
  if(preferences.acceptingNewClients && (preferences.inPerson || preferences.virtual)) {
   const [heldRows]=await pool.execute("SELECT requested_start_at FROM public_appointment_requests WHERE agency_id=? AND provider_id=? AND UPPER(COALESCE(status,'PENDING')) NOT IN ('DECLINED','CANCELLED') AND requested_start_at>=NOW()",[agencyId,providerId]);
   const held=new Set(heldRows.map(row=>new Date(row.requested_start_at).toISOString()));
   const unheld=list=>(list||[]).filter(slot=>Number.isFinite(Date.parse(slot.startAt))&&!held.has(new Date(slot.startAt).toISOString()));
   const monday=new Date();monday.setUTCHours(12,0,0,0);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
   for(let week=0;week<4;week++) {
    const day=new Date(monday.getTime()+week*7*86400000);
    const result=await Availability.computeWeekAvailability({agencyId,providerId,weekStartYmd:day.toISOString().slice(0,10),includeGoogleBusy:true,intakeOnly:true});
    if(!result)throw new Error('Availability could not be checked');
    slots.inPersonSlots.push(...unheld(result.inPersonSlots));slots.virtualSlots.push(...unheld(result.virtualSlots));
    if(!missingAvailabilityFormats(preferences,slots).length)break;
   }
  }
  const missing=missingAvailabilityFormats(preferences,slots);
  for(const format of ['IN_PERSON','VIRTUAL']) {
   await pool.execute('INSERT IGNORE INTO provider_availability_reminders (provider_id,agency_id,format) VALUES (?,?,?)',[providerId,agencyId,format]);
   const [[row]]=await pool.execute('SELECT * FROM provider_availability_reminders WHERE provider_id=? AND agency_id=? AND format=?',[providerId,agencyId,format]);
   if(missing.includes(format)) {
    const label=format==='IN_PERSON'?'in-person':'virtual';
    const destination=availabilitySettingsPath(providerId,agencyId);
    let task=row.task_id?await Task.findById(row.task_id):null;
    if(!task) {
     const [[existing]]=await pool.execute("SELECT id FROM tasks WHERE source_ref_type='provider_availability' AND source_ref_id=? ORDER BY id DESC LIMIT 1",[String(row.id)]);
     task=existing?await Task.findById(existing.id):await Task.create({taskType:'custom',title:`Add ${label} availability`,description:`You are accepting ${label} clients but have no published new-client openings in the next four schedule weeks. Add openings or update your availability settings: ${destination}`,assignedToUserId:providerId,assignedToAgencyId:agencyId,assignedByUserId:providerId,sourceRefType:'provider_availability',sourceRefId:row.id,metadata:{kind:'provider_availability',format,providerId,agencyId,url:destination},isPrivate:true});
    }
    if(!row.is_missing && ['completed','overridden'].includes(task.status))await Task.updateStatus(task.id,'pending');
    let notificationId=row.notification_id;
    if(!notificationId) {
     const [[existing]]=await pool.execute("SELECT id FROM notifications WHERE user_id=? AND related_entity_type='provider_availability' AND related_entity_id=? ORDER BY id DESC LIMIT 1",[providerId,row.id]);
     const notification=existing||await Notification.create({type:'custom_task_assigned',severity:'warning',title:`Add ${label} availability`,message:`You are open for ${label} clients, but no new-client slots are published in the next four schedule weeks. Open your Public Provider Profile settings or the assigned task to add times.`,userId:providerId,agencyId,relatedEntityType:'provider_availability',relatedEntityId:row.id,actorSource:'provider_availability'});
     notificationId=notification.id;
    } else if(!row.is_missing)await Notification.setViewerState(notificationId,providerId,{dismissed:false,read:false,snoozedUntil:null});
    await pool.execute('UPDATE provider_availability_reminders SET is_missing=1,task_id=?,notification_id=?,checked_at=NOW() WHERE id=?',[task.id,notificationId,row.id]);
   } else {
    if(row.is_missing && row.task_id)await Task.updateStatus(row.task_id,'completed');
    if(row.is_missing && row.notification_id)await Notification.setViewerState(row.notification_id,providerId,{read:true,dismissed:true,followUp:false});
    await pool.execute('UPDATE provider_availability_reminders SET is_missing=0,checked_at=NOW() WHERE id=?',[row.id]);
   }
  }
 } finally {try{await connection.query('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}}
}
let running=false;
async function runProviderAvailabilityReminderTick(){
 if(running)return;running=true;
 try {
  const [rows]=await pool.execute(`SELECT DISTINCT ua.user_id,ua.agency_id FROM user_agencies ua
   JOIN users u ON u.id=ua.user_id JOIN agencies a ON a.id=ua.agency_id
   WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_demo,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE') AND a.is_active=1
   AND COALESCE(a.is_archived,0)=0 AND a.organization_type IN ('agency','life_coach','consultant')
   AND ((u.role IN ('provider','provider_plus','intern','facilitator','supervisor') OR u.has_provider_access=1) OR EXISTS(SELECT 1 FROM provider_public_service_enrollments e WHERE e.user_id=u.id AND e.agency_id=ua.agency_id AND e.is_active=1) OR EXISTS(SELECT 1 FROM provider_tutoring_profiles t WHERE t.user_id=u.id AND t.agency_id=ua.agency_id))
   AND NOT EXISTS(SELECT 1 FROM provider_availability_reminders r WHERE r.provider_id=ua.user_id AND r.agency_id=ua.agency_id AND r.checked_at>DATE_SUB(NOW(),INTERVAL 6 HOUR)) LIMIT 20`);
  for(const row of rows)try{await checkProviderAvailability(row.user_id,row.agency_id);}catch(e){console.warn('[availability-reminders] check failed',row.user_id,e.code||e.message);}
 }finally{running=false;}
}

return {readProviderAvailabilitySettings,checkProviderAvailability,runProviderAvailabilityReminderTick};
}
export const {readProviderAvailabilitySettings,checkProviderAvailability,runProviderAvailabilityReminderTick}=createProviderAvailabilityReminders({pool,User,Profile,Task,Notification,Availability});
