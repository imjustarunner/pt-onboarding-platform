import pool from '../config/database.js';
import User from '../models/User.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import Notification from '../models/Notification.model.js';
import {readProviderAvailabilitySettings,checkProviderAvailability} from '../services/providerAvailabilityReminders.service.js';
async function authorize(req,res){
 const providerId=Number(req.params.providerId),agencyId=Number(req.query.agencyId||req.body?.agencyId);
 if(!Number.isSafeInteger(providerId)||providerId<1||!Number.isSafeInteger(agencyId)||agencyId<1){res.status(400).json({error:{message:'Valid provider and agency are required'}});return null;}
 const self=Number(req.user.id)===providerId,manager=['super_admin','admin','support','staff'].includes(req.user.role);
 if(!self&&!manager){res.status(403).json({error:{message:'Access denied'}});return null;}
 if(req.user.role!=='super_admin'&&!(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===agencyId)){res.status(403).json({error:{message:'Access denied for this agency'}});return null;}
 if(!(await User.getAgencies(providerId)).some(a=>Number(a.id)===agencyId)){res.status(404).json({error:{message:'Provider not found in this agency'}});return null;}
 return {providerId,agencyId};
}
export async function getSettings(req,res,next){try{const ids=await authorize(req,res);if(!ids)return;res.json(await readProviderAvailabilitySettings(ids.providerId,ids.agencyId));}catch(e){next(e);}}
export async function saveSettings(req,res,next){try{
 const ids=await authorize(req,res);if(!ids)return;
 const {acceptingNewClients,inPerson,virtual,seesClients}=req.body;
 if(seesClients!==undefined && (typeof seesClients!=='boolean' || !['admin','super_admin'].includes(req.user.role))) return res.status(typeof seesClients==='boolean'?403:400).json({error:{message:'Only admins can change Sees clients using a true/false value'}});
 if([acceptingNewClients,inPerson,virtual].some(v=>typeof v!=='boolean'))return res.status(400).json({error:{message:'Availability choices must be true or false'}});
 const connection=await pool.getConnection();
 try {
  await connection.beginTransaction();
  await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[ids.providerId]);
  if(seesClients!==undefined) await connection.execute('UPDATE users SET sees_clients=? WHERE id=?',[seesClients,ids.providerId]);
  const prior=await Profile.getForProvider({providerUserId:ids.providerId,database:connection});
  await connection.execute('UPDATE users SET provider_accepting_new_clients=?,in_office_available=? WHERE id=?',[acceptingNewClients,inPerson,ids.providerId]);
  await Profile.upsertForProvider({...prior,providerUserId:ids.providerId,database:connection,acceptingNewClientsOverride:null,details:{...prior?.details,inPersonEnabled:inPerson,virtualEnabled:virtual,officeAvailability:acceptingNewClients&&inPerson?'accepting':'unavailable',virtualAvailability:acceptingNewClients&&virtual?'accepting':'unavailable'}});
  await connection.execute('UPDATE provider_tutoring_profiles SET accepting_new_students=? WHERE user_id=? AND agency_id=?',[acceptingNewClients,ids.providerId,ids.agencyId]);
  await connection.commit();
 } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
 // Settings are saved even if a calendar is temporarily unavailable. Never invent a missing-slot warning on errors.
 try{await checkProviderAvailability(ids.providerId,ids.agencyId);}catch(e){return res.json({...await readProviderAvailabilitySettings(ids.providerId,ids.agencyId),checkError:'Settings saved. Calendar availability could not be checked; please retry.'});}
 res.json(await readProviderAvailabilitySettings(ids.providerId,ids.agencyId));
}catch(e){next(e);}}
export async function checkSettings(req,res,next){try{const ids=await authorize(req,res);if(!ids)return;await checkProviderAvailability(ids.providerId,ids.agencyId);res.json(await readProviderAvailabilitySettings(ids.providerId,ids.agencyId));}catch(e){next(e);}}
export async function snoozeReminder(req,res,next){try{
 const ids=await authorize(req,res);if(!ids)return;
 const [[r]]=await pool.execute('SELECT notification_id FROM provider_availability_reminders WHERE provider_id=? AND agency_id=? AND format=? AND is_missing=1',[ids.providerId,ids.agencyId,String(req.body.format||'')]);
 if(!r?.notification_id)return res.status(404).json({error:{message:'Active reminder not found'}});
 const ok=await Notification.setViewerState(r.notification_id,ids.providerId,{followUp:false,snoozedUntil:new Date(Date.now()+7*86400000)});
 if(!ok)return res.status(409).json({error:{message:'Reminder could not be snoozed'}});
 res.json(await readProviderAvailabilitySettings(ids.providerId,ids.agencyId));
}catch(e){next(e);}}
export async function getMyReminders(req,res,next){try{
 const [rows]=await pool.execute(`SELECT r.agency_id AS agencyId,r.provider_id AS providerId,r.format,r.task_id AS taskId,a.name AS agencyName
 FROM provider_availability_reminders r JOIN agencies a ON a.id=r.agency_id JOIN users u ON u.id=r.provider_id
 JOIN user_agencies ua ON ua.user_id=r.provider_id AND ua.agency_id=r.agency_id
 LEFT JOIN notification_user_reads nur ON nur.notification_id=r.notification_id AND nur.user_id=r.provider_id
 WHERE r.provider_id=? AND r.is_missing=1 AND u.sees_clients=1 AND COALESCE(u.provider_accepting_new_clients,1)=1 AND COALESCE(ua.is_active,1)=1 AND (nur.snoozed_until IS NULL OR nur.snoozed_until<=NOW())`,[req.user.id]);
 res.json({reminders:rows});
}catch(e){next(e);}}
