import pool from '../config/database.js';
import { CARD_STAFF_ROLES, canManageBusinessCards } from '../services/businessCardSettings.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const id=value=>/^\d+$/.test(String(value))&&Number(value)>0?Number(value):null;
export async function staffTenantAccess(req,{write=false}={}) {
 const userId=id(req.params.id),agencyId=id(req.params.agencyId ?? req.body?.agencyId);
 if(!userId || (write&&!agencyId))throw fail(400,'Choose a valid employee and agency.');
 const [[actor]]=await pool.execute('SELECT id,role,status,is_active FROM users WHERE id=? LIMIT 1',[req.user.id]);
 if(!actor||![1,true].includes(actor.is_active)||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(actor.status))throw fail(403,'Active staff access required.');
 const manager=canManageBusinessCards(actor);
 if((write&&!['admin','super_admin'].includes(actor.role))||(!manager&&actor.id!==userId))throw fail(403,'Access denied.');
 if(agencyId){
  const [[target]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1 LIMIT 1',[userId,agencyId]);
  if(!target)throw fail(404,'Active agency relationship not found.');
  if(actor.role!=='super_admin'){
   const [[member]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1 LIMIT 1',[actor.id,agencyId]);
   if(!member)throw fail(403,'Access denied for this agency.');
  }
 }
 return {userId,agencyId,actor,manager};
}
const respond=(error,res,next)=>error.status?res.status(error.status).json({error:{message:error.message}}):next(error);
export async function listStaffCardAgencies(req,res,next){try{
 const {userId,actor}=await staffTenantAccess(req);
 const [rows]=await pool.execute(`SELECT a.id,a.name,a.slug,a.organization_type,ua.agency_role,ua.agency_position,
   u.role,u.status,u.is_active
  FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id JOIN users u ON u.id=ua.user_id
  WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    AND LOWER(COALESCE(a.organization_type,'agency')) IN ('agency','clinical','life_coach','consultant')
    ${actor.role==='super_admin'?'':`AND EXISTS(SELECT 1 FROM user_agencies mine WHERE mine.user_id=? AND mine.agency_id=a.id AND COALESCE(mine.is_active,1)=1)`}
  ORDER BY a.name`,actor.role==='super_admin'?[userId]:[userId,actor.id]);
 res.json(rows.filter(r=>CARD_STAFF_ROLES.includes(r.role)&&['ACTIVE','ACTIVE_EMPLOYEE'].includes(r.status)&&r.is_active));
}catch(e){respond(e,res,next);}}
export async function guardAgencyMembershipUpdate(req,res,next){try{await staffTenantAccess(req,{write:true});next();}catch(e){respond(e,res,next);}}
export async function listStaffServiceAssignments(req,res,next){try{
 const {userId,agencyId}=await staffTenantAccess(req);
 if(!agencyId)throw fail(400,'Choose an agency.');
 const [services]=await pool.execute(`SELECT ts.id,ts.name,ts.service_code,ts.business_type,
  EXISTS(SELECT 1 FROM staff_service_assignments s WHERE s.agency_id=ts.agency_id AND s.tenant_service_id=ts.id AND s.user_id=? AND s.is_active=1) AS assigned
  FROM tenant_services ts WHERE ts.agency_id=? AND ts.is_active=1 ORDER BY ts.sort_order,ts.name,ts.id`,[userId,agencyId]);
 res.json({services});
}catch(e){respond(e,res,next);}}
export async function updateStaffServiceAssignments(req,res,next){try{
 const {userId,agencyId}=await staffTenantAccess(req,{write:true});
 const ids=req.body?.serviceIds;
 if(!Array.isArray(ids)||ids.length>300||ids.some(v=>!Number.isSafeInteger(v)||v<1))throw fail(400,'Choose valid services.');
 const wanted=[...new Set(ids)],connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  const [[member]]=await connection.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1 FOR UPDATE',[userId,agencyId]);
  if(!member)throw fail(409,'Agency relationship changed. Refresh before saving.');
  const [available]=await connection.execute('SELECT id FROM tenant_services WHERE agency_id=? AND is_active=1 FOR UPDATE',[agencyId]);
  if(wanted.some(id=>!available.some(s=>Number(s.id)===id)))throw fail(400,'Choose only active services from this agency.');
  // Change only this employee's active catalog choices; preserve office/modality settings.
  for(const service of available){
   const active=wanted.includes(Number(service.id));
   const [existing]=await connection.execute('SELECT id FROM staff_service_assignments WHERE agency_id=? AND tenant_service_id=? AND user_id=? FOR UPDATE',[agencyId,service.id,userId]);
   if(existing.length)await connection.execute('UPDATE staff_service_assignments SET is_active=? WHERE agency_id=? AND tenant_service_id=? AND user_id=?',[active?1:0,agencyId,service.id,userId]);
   else if(active)await connection.execute('INSERT INTO staff_service_assignments (agency_id,tenant_service_id,user_id,is_active) VALUES (?,?,?,1)',[agencyId,service.id,userId]);
  }
  await connection.commit();
 }catch(e){await connection.rollback();throw e;}finally{connection.release();}
 await listStaffServiceAssignments(req,res,next);
}catch(e){respond(e,res,next);}}
