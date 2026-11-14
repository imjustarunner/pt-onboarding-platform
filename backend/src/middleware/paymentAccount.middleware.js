import pool from '../config/database.js';
import {readAgencyAccess} from '../services/agencyAccessProfiles.service.js';
import {requireBillingStaff} from '../services/familyLedger/policy.js';
import {requireMedicalBillingFinancialAccess} from './medicalBilling.middleware.js';

// Payment-account administration does not grant medical chart/claims access,
// and does not enroll an excluded QA tenant in platform subscription billing.
export async function academicPaymentAdministrator(user,agencyId,{db=pool,access=readAgencyAccess}={}){
 if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1||!user?.id)return false;
 const [[agency]]=await db.execute('SELECT id,organization_type,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[Number(agencyId)]);
 if(!agency)return false;
 let flags;try{flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags):agency.feature_flags||{};}catch{return false;}
 if(agency.organization_type!=='learning'&&flags.standardsLearningEnabled!==true)return false;
 const scope=await access(user.id,Number(agencyId),db);
 return !!scope&&['admin','super_admin'].includes(scope.role);
}

export async function requirePaymentAccountStaff(req,res,next){
 try{
  if(await academicPaymentAdministrator(req.user,req.params.agencyId)){req.paymentAccountAdministrator=true;return next();}
  await requireBillingStaff(req.user,req.params.agencyId);return next();
 }catch(error){next(error);}
}
export async function requirePaymentSettingsRead(req,res,next){
 try{
  if(await academicPaymentAdministrator(req.user,req.params.agencyId))return next();
  return requireMedicalBillingFinancialAccess(req,res,next);
 }catch(error){next(error);}
}
