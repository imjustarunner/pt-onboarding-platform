import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../../utils/agencyAccessPolicy.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';
import {hubClientScope} from '../hubPeopleAccess.service.js';
import {maskMobileClientName,positiveId} from '../narrivaAccess.service.js';
import {mobileClinicalAge} from '../mobileClinicalPrivacy.service.js';
import {buildPublicAppUrl} from '../../utils/publicPortalUrl.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
const allowed=new Set(['admin','support','staff','provider','provider_plus','intern','intern_plus','clinical_practice_assistant','super_admin','school_staff','school_admin']);
const assigned=new Set(['provider','provider_plus','intern','intern_plus']);
const clinical=new Set(['admin','provider','provider_plus','intern','intern_plus','clinical_practice_assistant','super_admin']);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const inactiveUser=user=>!user||[false,0,'0'].includes(user.is_active)||Number(user.is_archived)===1||['inactive','inactive_employee','terminated','terminated_pending','archived','deleted'].includes(String(user.status||'').toLowerCase());
async function actorFor(user,agencyId){const access=await readAgencyAccess(user.id,agencyId);if(!access&&user.role!=='super_admin')throw fail(403,'Workspace access changed.');return {...applyAgencyAccess({...user},access),scopedAgencyId:agencyId};}
async function authorize(actor,client){const result=await resolveClientRecordAccess({userId:actor.id,role:actor.role,client});if(!result.ok)return false;if(['school_staff','school_admin'].includes(actor.role))return ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({clientId:client.id,schoolOrganizationId:client.organization_id,schoolStaffUserId:actor.id,allowExpiredOverview:true,allowNoRoiInterface:true});return true;}
/** Basic identity directory only. Clinical writers retain their separate, stricter permission boundary. */
export function createMobileClientDirectory({db=pool,findUser=id=>User.findById(id,{raw:true}),listAgencies=listMobileAgencies,getActor=actorFor,canView=authorize}={}){
 return async request=>{
  if(!request.quickView?.mobileDeviceSessionId)throw fail(403,'Sign into Auricwell mobile to view your clients.');
  const user=await findUser(request.quickView.userId);if(inactiveUser(user))throw fail(403,'Your account is unavailable.');
  const {agencies}=await listAgencies(user),requested=String(request.query?.agencyId||'all'),query=String(request.query?.q||'').trim().slice(0,100),page=Number(request.query?.page||0);
  if(!Number.isSafeInteger(page)||page<0||page>10000)throw fail(400,'Choose a valid client page.');
  if(requested!=='all'&&!agencies.some(a=>String(a.id)===requested))throw fail(403,'This workspace is unavailable.');
  const actors=new Map(),eligible=[];
  for(const agency of agencies){try{const actor=await getActor({...user},Number(agency.id));if(!allowed.has(actor.role))continue;actors.set(Number(agency.id),actor);eligible.push(agency);}catch(error){if(![403,404].includes(error.status))throw error;}}
  const visible=eligible.filter(a=>requested==='all'||String(a.id)===requested);
  if(!visible.length)return {clients:[],agencies:eligible.map(a=>({id:Number(a.id),name:a.name,logoUrl:mobileAgencyIcon(a)})),nextPage:null};
  const scope=visible.map(()=>'?').join(','),scopeArgs=[];
  const conditions=visible.map(a=>{
   const actor=actors.get(Number(a.id));
   if(!assigned.has(actor.role))return `(scoped.id=${Number(a.id)})`;
   const caseload=hubClientScope(Number(user.id));scopeArgs.push(...caseload.params);
   return `(scoped.id=${Number(a.id)} AND ${caseload.sql})`;
  }).join(' OR ');
  const [rows]=await db.execute(`SELECT c.id,c.agency_id,c.organization_id,c.provider_id,c.full_name,c.initials,c.identifier_code,c.date_of_birth,c.client_type,c.status,scoped.id AS scope_agency_id FROM clients c JOIN agencies scoped ON scoped.id IN(${scope}) AND (c.agency_id=scoped.id OR c.organization_id=scoped.id OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=scoped.id AND ca.is_active=1) OR EXISTS(SELECT 1 FROM organization_affiliations affiliation WHERE affiliation.organization_id=c.organization_id AND affiliation.agency_id=scoped.id AND COALESCE(affiliation.is_active,1)=1)) WHERE COALESCE(c.status,'')<>'ARCHIVED' AND (${conditions}) AND (?='' OR LOCATE(?,COALESCE(c.full_name,''))>0 OR LOCATE(?,COALESCE(c.initials,''))>0) ORDER BY c.id DESC,scoped.id LIMIT 51 OFFSET ${page*50}`,[...visible.map(a=>Number(a.id)),...scopeArgs,query,query,query]);
  const cards=[],candidates=rows.slice(0,50);
  // Bound the normal record-policy queries without serially waiting for every card.
  for(let offset=0;offset<candidates.length;offset+=8){
   const batch=await Promise.all(candidates.slice(offset,offset+8).map(async row=>{
    const agency=visible.find(a=>Number(a.id)===Number(row.scope_agency_id)),actor=actors.get(Number(row.scope_agency_id));
    if(!agency||!await canView(actor,row))return null;
    const school=['school_staff','school_admin'].includes(actor.role);
    return {id:Number(row.id),clientId:Number(row.id),maskedName:school?String(row.initials||row.identifier_code||'Client'):maskMobileClientName(row),age:mobileClinicalAge(row),agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency),summaryAvailable:clinical.has(actor.role)&&['clinical','school'].includes(row.client_type),fullProfileUrl:school?null:buildPublicAppUrl(agency,`admin/clients/${Number(row.id)}`)};
   }));cards.push(...batch.filter(Boolean));
  }
  return {clients:cards,agencies:eligible.map(a=>({id:Number(a.id),name:a.name,logoUrl:mobileAgencyIcon(a)})),nextPage:rows.length>50?page+1:null};
 };
}
export const listMobileClients=createMobileClientDirectory();

export function createMobileClientDirectoryContext({db=pool,findUser=id=>User.findById(id,{raw:true}),listAgencies=listMobileAgencies,getActor=actorFor,canView=authorize}={}){
return async function mobileClientDirectoryContext(request,clientId,requestedAgencyId){
 if(!request.quickView?.mobileDeviceSessionId)throw fail(403,'Sign into Auricwell mobile to view your clients.');
 const id=positiveId(clientId),agencyId=positiveId(requestedAgencyId||request.quickView.agencyId);if(!id||!agencyId)throw fail(400,'Choose a client and workspace.');
 const user=await findUser(request.quickView.userId);if(inactiveUser(user))throw fail(403,'Your account is unavailable.');
 const {agencies}=await listAgencies(user),agency=agencies.find(a=>Number(a.id)===agencyId);if(!agency)throw fail(403,'This workspace is unavailable.');
 const actor=await getActor({...user},agencyId);if(!allowed.has(actor.role))throw fail(403,'Client access is unavailable for this role.');
 const [[client]]=await db.execute(`SELECT c.id,c.agency_id,c.organization_id,c.provider_id,c.full_name,c.initials,c.identifier_code,c.date_of_birth,c.client_type,c.status FROM clients c WHERE c.id=? AND (c.agency_id=? OR c.organization_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1) OR EXISTS(SELECT 1 FROM organization_affiliations affiliation WHERE affiliation.organization_id=c.organization_id AND affiliation.agency_id=? AND COALESCE(affiliation.is_active,1)=1))`,[id,agencyId,agencyId,agencyId,agencyId]);
 if(!client||!await canView(actor,client))throw fail(404,'This client is unavailable in this workspace.');
 return {client,actor,agency,clinical:clinical.has(actor.role)&&['clinical','school'].includes(client.client_type),fullProfileUrl:['school_staff','school_admin'].includes(actor.role)?null:buildPublicAppUrl(agency,`admin/clients/${id}`)};
};
}
export const mobileClientDirectoryContext=createMobileClientDirectoryContext();
