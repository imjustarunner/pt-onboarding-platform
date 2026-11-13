import pool from '../config/database.js';
import {listClientServices,saveClientService,clientAgencyMembership,updateClientServiceStatus} from '../services/clientServiceEnrollment.service.js';
import {clientServiceReturnRequests} from '../services/clientServiceReturnRequest.service.js';
async function staff(req){
 const clientId=Number(req.params.id),agencyId=Number(req.query.agencyId||req.body?.agencyId);
 if(!Number.isSafeInteger(clientId)||!Number.isSafeInteger(agencyId)||clientId<1||agencyId<1)throw Object.assign(new Error('Choose a client and agency.'),{status:400});
 const providerRole=['provider','provider_plus','clinician','supervisor'].includes(req.user.role);
 if(!['super_admin','admin','support'].includes(req.user.role)&&!providerRole)throw Object.assign(new Error('Agency administration or assigned provider access is required to manage service enrollments.'),{status:403});
 if(req.user.role!=='super_admin'){const [[member]]=await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[req.user.id,agencyId]);if(!member)throw Object.assign(new Error('Agency access is required.'),{status:403});}
 if(!await clientAgencyMembership(clientId,agencyId))throw Object.assign(new Error('Client is not linked to this agency.'),{status:404});
 if(providerRole){const [owned]=await pool.execute(`SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? ${req.params.serviceId?'AND id=?':''}`,[clientId,agencyId,req.user.id,...(req.params.serviceId?[Number(req.params.serviceId)]:[])]);if(!owned.length)throw Object.assign(new Error('Only the assigned provider can manage this service.'),{status:403});}
 return {clientId,agencyId,userId:req.user.id,...(providerRole?{providerUserId:req.user.id}:{})};
}
export const list=async(req,res,next)=>{try{const c=await staff(req);const services=await listClientServices(c.clientId,c.agencyId);res.set('Cache-Control','no-store').json({services:c.providerUserId?services.filter(s=>Number(s.provider_user_id)===Number(c.providerUserId)):services});}catch(e){next(e);}};
export const save=async(req,res,next)=>{try{const c=await staff(req);if(c.providerUserId)return res.status(403).json({error:{message:'An agency administrator must add or assign service enrollments.'}});res.json({services:await saveClientService({...c,input:req.body})});}catch(e){next(e);}};
export const status=async(req,res,next)=>{try{const c=await staff(req);const result=await updateClientServiceStatus({...c,serviceId:Number(req.params.serviceId),input:req.body});if(c.providerUserId)result.services=result.services.filter(s=>Number(s.provider_user_id)===Number(c.providerUserId));res.json(result);}catch(e){next(e);}};
export const archive=async(req,res,next)=>{try{const c=await staff(req);const result=await updateClientServiceStatus({...c,serviceId:Number(req.params.serviceId),input:{...req.body,status:'discontinued'}});if(c.providerUserId)result.services=result.services.filter(s=>Number(s.provider_user_id)===Number(c.providerUserId));res.json(result);}catch(e){next(e);}};
export const returns=async(req,res,next)=>{try{const c=await staff(req);res.set('Cache-Control','no-store').json(await clientServiceReturnRequests.list({...c,serviceId:Number(req.params.serviceId)}));}catch(e){next(e);}};
export const reviewReturn=async(req,res,next)=>{try{const c=await staff(req);await clientServiceReturnRequests.review({...c,serviceId:Number(req.params.serviceId),requestId:req.params.requestId,decision:req.body.decision,message:req.body.message});res.json(await clientServiceReturnRequests.list({...c,serviceId:Number(req.params.serviceId)}));}catch(e){next(e);}};
