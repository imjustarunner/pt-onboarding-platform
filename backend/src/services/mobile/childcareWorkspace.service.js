import pool from '../../config/database.js';
import {mobileLearningWorkspace} from './learningWorkspace.service.js';
import * as childcare from '../childcare.service.js';
import {runWithAgencyAccess} from '../../utils/agencyAccessContext.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createMobileChildcareWorkspace({actor=mobileLearningWorkspace.actor,services=childcare,db=pool,scope=runWithAgencyAccess}={}){
 return async(req,res,next)=>{res.set('Cache-Control','no-store');try{
  const context=await actor(req),operation=req.mobileChildcareOperation;
  const shiftId=Number(req.params?.shiftId);
  if(req.params?.shiftId){
   if(!/^[1-9][0-9]*$/.test(req.params.shiftId)||!Number.isSafeInteger(shiftId))throw fail(404,'Childcare shift not found.');
   const [[shift]]=await db.execute('SELECT agency_id FROM childcare_shifts WHERE id=?',[shiftId]);
   if(!shift||Number(shift.agency_id)!==context.agencyId)throw fail(404,'Childcare shift not found in this workspace.');
  }
  const input={...req.body,agencyId:context.agencyId,userId:context.user.id,shiftId};
  if(req.params?.userId&&Number(req.params.userId)!==Number(context.user.id))throw fail(403,'Open your own childcare rate schedule here.');
  const handlers={context:()=>services.childcareContext(input),staff:()=>services.listChildcareStaff(input),rates:()=>services.getChildcareStaffRates({...input,targetUserId:context.user.id,asOfDate:req.query.asOfDate}),list:()=>services.listChildcareShifts(input),detail:()=>services.getChildcareShift(input),create:()=>services.createChildcareShift(input),update:()=>services.updateChildcareShift(input),pay:()=>services.previewChildcarePay({...input,targetUserId:req.query.userId}),'clock-in':()=>services.recordChildcareAction({...input,action:'clock-in',now:new Date()}),'clock-out':()=>services.recordChildcareAction({...input,action:'clock-out',now:new Date()}),attendance:()=>services.recordChildcareAction({...input,action:'attendance',now:new Date()})};
  if(!Object.hasOwn(handlers,operation))throw fail(404,'This childcare action is unavailable.');
  return await scope(context.agencyId,async()=>res.json(await handlers[operation]()),{userId:context.user.id,access:context.profile});
 }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message,code:error.code}});next(error);}};
}
export const mobileChildcareWorkspace=createMobileChildcareWorkspace();
