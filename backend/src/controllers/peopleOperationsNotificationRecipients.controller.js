import pool from '../config/database.js';
import {accessProfileSchemaReady,readAgencyAccess} from '../services/agencyAccessProfiles.service.js';
import {peopleOperationsNotificationSettings,savePeopleOperationsNotificationSettings} from '../services/peopleOperationsSubmissionNotifications.service.js';
const active=`u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`;
async function context(req) {
 const agencyId=Number(req.query?.agencyId || req.body?.agencyId),actorUserId=Number(req.user?.id);
 if(!Number.isSafeInteger(agencyId)||agencyId<1)throw Object.assign(new Error('Select an agency.'),{status:400});
 let [[actor]]=await pool.execute(`SELECT u.id,u.role,u.has_hiring_access FROM users u WHERE u.id=? AND ${active}`, [actorUserId]);
 if(actor && actor.role!=='super_admin') {
  if(await accessProfileSchemaReady()) {
   const access=await readAgencyAccess(actorUserId,agencyId);
   actor=access ? {...actor,role:access.role,has_hiring_access:access.permissions.has_hiring_access} : null;
  } else {
   const [[membership]]=await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[actorUserId,agencyId]);
   if(!membership)actor=null;
   else if(['admin','support'].includes(actor.role))actor.has_hiring_access=1;
  }
 }
 if(!actor||!(actor.role==='super_admin'||Number(actor.has_hiring_access)===1))throw Object.assign(new Error('Active agency hiring access is required.'),{status:403});
 return {agencyId,actorUserId,canEdit:['admin','super_admin','support'].includes(actor.role)};
}
export async function getPeopleOperationsNotificationRecipients(req,res,next) {
 try {const {agencyId,canEdit}=await context(req);res.json({...await peopleOperationsNotificationSettings(agencyId),canEdit});}catch(error){next(error);}
}
export async function putPeopleOperationsNotificationRecipients(req,res,next) {
 try {const {agencyId,actorUserId,canEdit}=await context(req);if(!canEdit)throw Object.assign(new Error('An agency administrator must review these settings.'),{status:403});
  res.json({...await savePeopleOperationsNotificationSettings({agencyId,actorUserId,enabled:req.body?.enabled,recipientIds:req.body?.recipientIds,senderIdentityId:req.body?.senderIdentityId}),canEdit});
 }catch(error){next(error);}
}
