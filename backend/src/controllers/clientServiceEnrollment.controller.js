import pool from '../config/database.js';
import {listClientServices,saveClientService,clientAgencyMembership} from '../services/clientServiceEnrollment.service.js';
async function staff(req){
 const clientId=Number(req.params.id),agencyId=Number(req.query.agencyId||req.body?.agencyId);
 if(!Number.isSafeInteger(clientId)||!Number.isSafeInteger(agencyId)||clientId<1||agencyId<1)throw Object.assign(new Error('Choose a client and agency.'),{status:400});
 if(!['super_admin','admin','support'].includes(req.user.role))throw Object.assign(new Error('Agency administration access is required to manage service enrollments.'),{status:403});
 if(req.user.role!=='super_admin'){const [[member]]=await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[req.user.id,agencyId]);if(!member)throw Object.assign(new Error('Agency access is required.'),{status:403});}
 if(!await clientAgencyMembership(clientId,agencyId))throw Object.assign(new Error('Client is not linked to this agency.'),{status:404});
 return {clientId,agencyId,userId:req.user.id};
}
export const list=async(req,res,next)=>{try{const c=await staff(req);res.set('Cache-Control','no-store').json({services:await listClientServices(c.clientId,c.agencyId)});}catch(e){next(e);}};
export const save=async(req,res,next)=>{try{const c=await staff(req);res.json({services:await saveClientService({...c,input:req.body})});}catch(e){next(e);}};
export const archive=async(req,res,next)=>{try{const c=await staff(req);await pool.execute('UPDATE client_service_enrollments SET is_active=0,updated_by_user_id=? WHERE id=? AND client_id=? AND agency_id=?',[c.userId,Number(req.params.serviceId),c.clientId,c.agencyId]);res.json({services:await listClientServices(c.clientId,c.agencyId)});}catch(e){next(e);}};
