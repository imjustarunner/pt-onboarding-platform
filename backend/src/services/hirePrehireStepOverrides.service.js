import pool from '../config/database.js';
import {encryptGuardianIntake,decryptGuardianIntake} from './guardianIntakeEncryption.service.js';
import {PREHIRE_OVERRIDE_PREFIX,canOverridePrehireStep} from '../utils/hirePrehireStepOverrides.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function createPrehireStepOverrideService(deps={}) {
 const d={database:pool,state:async id=>(await import('../controllers/prehirePortal.controller.js')).portalStateForUser(id),...deps};
 return async({userId,agencyId,actorUserId,stepKey,reason,revoke=false})=>{
  const note=String(reason || '').trim();if(note.length<8 || note.length>2000)throw fail('Enter a reason between 8 and 2,000 characters.',400);
  if(!Number.isSafeInteger(Number(actorUserId))||Number(actorUserId)<1)throw fail('An authenticated staff reviewer is required.',403);
  if(!/^[a-zA-Z0-9:_-]{1,64}$/.test(stepKey || ''))throw fail('Choose a valid pre-hire step.',400);
  const db=await d.database.getConnection();
  try{
   await db.beginTransaction();
   const[[user]]=await db.execute('SELECT status FROM users WHERE id=? FOR UPDATE',[userId]);
   const[[journey]]=await db.execute('SELECT prehire_completed_at FROM hire_journeys WHERE user_id=?',[userId]);
   if(!['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW'].includes(user?.status)||journey?.prehire_completed_at)throw fail('This pre-hire package is closed. Reopen it before changing requirements.');
   const state=await d.state(userId);if(Number(state.agency.id)!==Number(agencyId))throw fail('Select the candidate’s pre-hire agency.',403);
   const step=state.workflow.steps.pre_hire.find(s=>s.key===stepKey);
   if(!step||!canOverridePrehireStep(step))throw fail('This item cannot be overridden. A real work username is required.',400);
   if(!revoke && step.complete && !step.staffOverride)throw fail('This requirement is already completed.');
   const[[actor]]=await db.execute('SELECT first_name,last_name FROM users WHERE id=?',[actorUserId]);if(!actor)throw fail('Staff reviewer not found.',403);
   const key=PREHIRE_OVERRIDE_PREFIX+stepKey;
   const[[saved]]=await db.execute("SELECT encrypted_value FROM hire_portal_submissions WHERE user_id=? AND phase='pre_hire' AND step_key=? FOR UPDATE",[userId,key]);
   let previous={};if(saved?.encrypted_value)previous=JSON.parse(decryptGuardianIntake(typeof saved.encrypted_value==='string'?JSON.parse(saved.encrypted_value):saved.encrypted_value));
   const event={actorUserId:Number(actorUserId),actorName:`${actor.first_name || ''} ${actor.last_name || ''}`.trim(),reason:note,at:new Date().toISOString(),active:!revoke};
   const value={type:'staff_pre_hire_override',...event,history:[...(previous.history || []),event]};
   await db.execute(`INSERT INTO hire_portal_submissions(user_id,phase,step_key,encrypted_value,completed_at)
    VALUES (?,'pre_hire',?,?,?) ON DUPLICATE KEY UPDATE encrypted_value=VALUES(encrypted_value),completed_at=VALUES(completed_at)`,
    [userId,key,JSON.stringify(encryptGuardianIntake(JSON.stringify(value))),revoke?null:new Date()]);
   await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',
    [revoke?'prehire_step_override_revoked':'prehire_step_overridden',actorUserId,agencyId,JSON.stringify({candidateUserId:userId,stepKey,reason:note,at:event.at,signatureCreated:false})]);
   await db.commit();return{ok:true,stepKey,override:revoke?null:event};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
 };
}
export const setPrehireStepOverride=createPrehireStepOverrideService();
