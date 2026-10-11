import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';
import {requireStaffCareEligibility} from '../staffCareEligibility.service.js';
import {supervisorCanAccessClientInOrg} from '../../utils/supervisorSchoolAccess.js';
import {requireClinicalScope} from '../guardianClinicalAccess.service.js';
import {positiveId,fail} from './template.js';
export const staffRoles=['admin','super_admin','provider','provider_plus','intern','intern_plus','supervisor','facilitator','qbha'];
export function staffRole(user){if(!user?.id)fail(401,'Sign in to continue.');if(user.demoMode||user.switchedFromUserId||!staffRoles.includes(user.role))fail(403,'Use your own clinical staff account.');}
export async function agencyAccess(user,id,{write=false}={}){
 staffRole(user);positiveId(id);
 if(user.role!=='super_admin'&&!(await User.getAgencies(user.id)).some(a=>Number(a.id)===Number(id)))fail(403,'Organization access is required.');
 if(write)await requireStaffCareEligibility(user.id,id);
}
export async function clientAccess(user,id,{write=false}={}){
 staffRole(user);positiveId(id);
 const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId:Number(id)});
 if(!access.ok)fail(access.status||403,'You cannot access this client’s clinical record.');
 if(!['admin','super_admin'].includes(user.role)&&!access.isAssignedClinician){
  const allowed=user.role==='supervisor'&&await supervisorCanAccessClientInOrg({supervisorUserId:user.id,clientId:Number(id),orgId:access.client.organization_id||access.client.agency_id});
  if(!allowed)fail(403,'Assigned clinician or supervisor access is required.');
 }
 if(write)await requireStaffCareEligibility(user.id,access.client.agency_id);
 return access.client;
}
export async function planAccess(user,row,{write=false}={}){
 if(!row)fail(404,'Safety plan not found.');
 if(row.client_id){const client=await clientAccess(user,row.client_id,{write});if(Number(client.agency_id)!==Number(row.agency_id))fail(403,'The client’s organization has changed. Ask an administrator to review the record.');}
 else{await agencyAccess(user,row.agency_id,{write});if(Number(row.created_by_user_id)!==Number(user.id)&&!['admin','super_admin'].includes(user.role))fail(403,'This unlinked plan is private to its author and authorized administrators.');}
}
export async function recipientAccess(row,userId,kind){
 if(!row.client_id)fail(400,'Link the plan to a client record before sharing it to a portal.');
 const [[link]]=await pool.execute('SELECT cg.relationship_type,u.first_name,u.last_name FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.guardian_user_id=? AND cg.access_enabled=1',[row.client_id,positiveId(userId)]);
 if(!link||(kind==='client')!==(link.relationship_type==='self'))fail(403,'Select the appropriate linked client or guardian account.');
 await requireClinicalScope({agencyId:row.agency_id,clientId:row.client_id,userId:Number(userId),scope:!row.document_key||row.document_key==='safety-plan'?'safety_plan':'clinical_documents'});
 return `${link.first_name||''} ${link.last_name||''}`.trim();
}
export async function recipientOptions(user,row){
 await planAccess(user,row);if(!row.client_id)return [];
 const [rows]=await pool.execute('SELECT guardian_user_id AS id,relationship_type FROM client_guardians WHERE client_id=? AND access_enabled=1',[row.client_id]);
 const result=[];
 for(const r of rows){const kind=r.relationship_type==='self'?'client':'guardian';try{const name=await recipientAccess(row,r.id,kind);result.push({id:r.id,kind,name});}catch(e){if(e.status!==403)throw e;}}
 return result;
}
export async function agencyBrand(id){
 const [[a]]=await pool.execute('SELECT id,name,slug,logo_url,logo_path,color_palette FROM agencies WHERE id=?',[positiveId(id)]);
 if(!a)fail(404,'Organization not found.');let colors={};try{colors=typeof a.color_palette==='string'?JSON.parse(a.color_palette):a.color_palette||{};}catch{}
 const color=colors.primary||colors.primaryColor||'#175b48';
 return {id:a.id,name:a.name,slug:a.slug,logoUrl:a.logo_path||a.logo_url||'',color:/^#[0-9a-f]{3,8}$/i.test(color)?color:'#175b48',font:/itsco/i.test(a.slug)?'Comfortaa':'Montserrat'};
}
