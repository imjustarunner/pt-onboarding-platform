import pool from '../config/database.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {verifiedQaPaymentAgency} from '../utils/qaStripeConfiguration.js';
import {allowNluQaTutor,isNluTutoringQaAgency} from '../utils/nluTutoringQaPolicy.js';
import {privateOfficeDemoAccess} from './privateOfficeDemoAccess.service.js';
import {meetingPlan} from './meetingAccessPlan.service.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import {billingError} from './familyBillingPolicy.service.js';
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};

async function qaAdministrator(user,agencyId,db){
 const [[agency]]=await db.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id=? FOR UPDATE',[agencyId]);
 if(!verifiedQaPaymentAgency(agency)||Number(agency.is_active)!==1||Number(agency.is_archived))throw billingError(403,'Use an active, verified QA organization.');
 const access=await readAgencyAccess(user.id,agencyId,db);
 if(!['admin','super_admin'].includes(access?.role))throw billingError(403,'QA setup requires an authorized organization administrator.');
 return agency;
}
async function saveFlags(agency,flags,userId,action,details,db){
 await db.execute('UPDATE agencies SET feature_flags=? WHERE id=?',[JSON.stringify(flags),agency.id]);
 await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',[action,userId,agency.id,JSON.stringify(details)]);
}
export async function configureQaPaymentSimulation({user,agencyId,enabled},dbPool=pool){
 if(typeof enabled!=='boolean')throw billingError(400,'Choose whether QA payment simulation is enabled.');
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();const agency=await qaAdministrator(user,agencyId,db);
  // A missing migration must block setup before the feature flag changes.
  await db.execute('SELECT id FROM qa_payment_simulations LIMIT 0');
  const flags=parse(agency.feature_flags);flags.qaSandbox={...flags.qaSandbox,simulatedPaymentsEnabled:enabled};
  await saveFlags(agency,flags,user.id,'qa_payment_simulation_configured',{enabled,noMoneyMoved:true},db);
  await db.commit();return {enabled,processor:'QA_SIMULATOR',noMoneyMoved:true};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

/** A room-scoped, expiring fixture; never changes a user's purchased plan. */
export async function qaTutorOfficePlan(room,db=pool,{now=Date.now()}={}){
 if(!room?.id||![453,454].includes(Number(room.agencyId)))return null;
 const [[agency]]=await db.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id=?',[room.agencyId]);
 if(!isNluTutoringQaAgency(agency)||Number(agency.is_active)!==1||Number(agency.is_archived))return null;
 const fixture=parse(agency.feature_flags).qaSandbox?.privateOfficeFixture;
 if(Number(fixture?.roomId)!==Number(room.id)||Number(fixture?.userId)!==Number(room.userId)||fixture?.tier!=='premium_plus'||!(Date.parse(fixture?.expiresAt)>now))return null;
 const [[user]]=await db.execute('SELECT id,email,role,is_demo FROM users WHERE id=?',[room.userId]);
 if(!allowNluQaTutor(agency,user)||!await privateOfficeDemoAccess(room,db))return null;
 return {...meetingPlan('premium_plus'),qaFixture:true,source:'expiring_qa_office_fixture',expiresAt:fixture.expiresAt};
}

export async function configureQaTutorOffice({user,agencyId,tutorUserId},dbPool=pool){
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();const agency=await qaAdministrator(user,agencyId,db);
  const [[tutor]]=await db.execute('SELECT id,email,role,is_demo,is_active,is_archived,status FROM users WHERE id=?',[tutorUserId]);
  if(!isNluTutoringQaAgency(agency)||!allowNluQaTutor(agency,tutor)||Number(tutor.is_active)!==1||Number(tutor.is_archived)||!['ACTIVE_EMPLOYEE','EHR_ONLY'].includes(tutor.status))throw billingError(403,'Only the retained active synthetic NLU tutor is eligible.');
  const [memberships]=await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND is_active=1',[tutorUserId]);
  if(!memberships.some(row=>Number(row.agency_id)===Number(agencyId))||memberships.some(row=>![453,454].includes(Number(row.agency_id))))throw billingError(403,'A QA office requires exclusively NLU QA memberships.');
  const room=await ProviderMyRoom.getOrCreateForUser(tutorUserId,agencyId,db);
  if(!room?.isActive)throw billingError(409,'Review the retained inactive office before granting QA access.');
  const expiresAt=new Date(Date.now()+7*86400000).toISOString();
  await db.execute('INSERT INTO private_office_demo_access(room_id,granted_by_user_id,expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE granted_by_user_id=VALUES(granted_by_user_id),expires_at=VALUES(expires_at)',[room.id,user.id,new Date(expiresAt)]);
  if(!await privateOfficeDemoAccess(room,db))throw billingError(403,'The QA tutor has an ineligible membership or a non-synthetic caseload.');
  const flags=parse(agency.feature_flags);flags.qaSandbox={...flags.qaSandbox,privateOfficeFixture:{roomId:room.id,userId:tutorUserId,tier:'premium_plus',expiresAt}};
  await saveFlags(agency,flags,user.id,'qa_tutor_office_configured',{roomId:room.id,tutorUserId,expiresAt,planPurchased:false},db);
  await db.commit();return {roomId:room.id,tutorUserId,expiresAt,qaFixture:true,planPurchased:false};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
