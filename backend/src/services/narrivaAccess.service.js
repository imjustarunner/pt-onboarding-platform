import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { listClientAgencyMembershipIds } from '../utils/noteAidClientAgency.js';
import { CLINICAL_SIGNER_ROLES } from './clinicalNoteSigningToken.service.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../utils/agencyAccessPolicy.js';
import {assertNonclinicalWorkspaceBoundary} from '../middleware/nonclinicalWorkspace.middleware.js';

export const narrivaError = (status,message,code='NARRIVA_ACCESS') => Object.assign(new Error(message),{status,code});
export const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
export function parseNarrivaObject(value) { if(value && typeof value==='object' && !Array.isArray(value))return value;try{return JSON.parse(value || '{}') || {};}catch{return {};}}
export async function requireNarrivaAgency(user,agencyId) {
 if(!positiveId(agencyId))throw narrivaError(400,'Choose a workspace.');
 if(!user?.id)throw narrivaError(403,'Clinical workspace access is required.');
 const current=await User.findById(user.id,{raw:true});
 if(!current || Number(current.is_active)===0 || Number(current.is_archived)===1 || ['archived','inactive','terminated'].includes(String(current.status).toLowerCase()))throw narrivaError(403,'Your account is no longer active.');
 const access=await readAgencyAccess(user.id,agencyId);
 if(!access && current.role!=='super_admin')throw narrivaError(403,'Your current workspace access could not be verified.');
 const scoped=applyAgencyAccess(current,access);
 if(!CLINICAL_SIGNER_ROLES.has(String(scoped.role).toLowerCase()))throw narrivaError(403,'Clinical workspace access is required.');
 // Callers retain this same actor; never let a stale token/global role broaden
 // downstream client, note, recording, or signature authorization.
 Object.assign(user,scoped,{scopedAgencyId:Number(agencyId)});
 await assertNonclinicalWorkspaceBoundary({user,originalUrl:'/api/narriva',query:{agencyId},headers:{}});
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:user,agencyId});
 await ClinicalEligibilityService.assertAgencyHasClinicalOrg(agencyId);
 // readAgencyAccess also validates explicitly granted platform/legacy access.
 // A second membership-only check would discard those valid scoped grants.

 return user;
}
export async function requireNarrivaClient(user,agencyId,clientId,{authorizedNoteReviewer=false}={}) {
 await requireNarrivaAgency(user,agencyId);
 const client=await Client.findById(clientId);
 if(!client || !(await listClientAgencyMembershipIds(clientId)).includes(Number(agencyId)))throw narrivaError(404,'Client is not available in this workspace.');
 if(!['clinical','school'].includes(String(client.client_type).toLowerCase()))throw narrivaError(403,'This client does not have a clinical workspace.');
 if(authorizedNoteReviewer || ['admin','agency_admin','super_admin','superadmin','clinical_practice_assistant','provider_plus'].includes(String(user.role).toLowerCase()))return client;
 const [[assigned]]=await pool.execute(`SELECT 1 FROM client_provider_assignments WHERE client_id=? AND provider_user_id=? AND is_active=1 LIMIT 1`,[clientId,user.id]);
 if(Number(client.provider_id)!==Number(user.id) && !assigned)throw narrivaError(403,'Access to this client requires an active care assignment.');
 return client;
}
export function maskMobileClientName(client) {
 const words=String(client.full_name || '').trim().split(/\s+/);
 const part=value=>{const chars=Array.from(String(value || '').trim());return chars.slice(0,3).join('')+(chars.length>3?'*':'');};
 return [part(client.first_name || words[0]),part(client.last_name || (words.length>1?words.at(-1):''))].filter(Boolean).join(' ') || 'Client';
}
