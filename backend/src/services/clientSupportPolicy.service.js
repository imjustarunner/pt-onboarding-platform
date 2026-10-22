import pool from '../config/database.js';

export const supportScopes = Object.freeze(['billing','insurance','contact','scheduling']);
export const supportPresets = Object.freeze({none:[],billing:['billing'],billing_insurance:['billing','insurance'],administrative:['billing','insurance','contact','scheduling']});
export const supportError=(status,message)=>Object.assign(new Error(message),{status,statusCode:status});
export const parseSupportJson=(value,fallback=[])=>{try{return typeof value==='string'?JSON.parse(value):(value??fallback);}catch{return fallback;}};
export function normalizeSupportChoices(value){
 if(!Array.isArray(value)||value.length>60)throw supportError(400,'Choose access for each person and agency.');
 const seen=new Set();
 return value.map(c=>{
  const helperUserId=Number(c.helperUserId),agencyId=Number(c.agencyId);
  if(!Number.isSafeInteger(helperUserId)||helperUserId<1||!Number.isSafeInteger(agencyId)||agencyId<1||!Array.isArray(c.scopes)||c.scopes.some(s=>!supportScopes.includes(s)))throw supportError(400,'Choose only the listed assistance permissions.');
  const key=`${helperUserId}:${agencyId}`;if(seen.has(key))throw supportError(400,'Choose each person and agency once.');seen.add(key);
  return {helperUserId,agencyId,scopes:[...new Set(c.scopes)].sort()};
 });
}
export async function supportGrant(userId,clientId,agencyId,db=pool){
 const [[row]]=await db.execute(`SELECT g.scopes_json FROM client_support_grants g JOIN client_portal_independence i ON i.client_id=g.client_id AND i.status='active'
 WHERE g.helper_user_id=? AND g.client_id=? AND g.agency_id=? AND g.revoked_at IS NULL`,[userId,clientId,agencyId]);
 const scopes=parseSupportJson(row?.scopes_json);
 return Array.isArray(scopes)?scopes.filter(s=>supportScopes.includes(s)):[];
}
export async function requireSupportScope(userId,clientId,agencyId,scope,db=pool){
 if(!(await supportGrant(userId,clientId,agencyId,db)).includes(scope))throw supportError(403,'This assistance permission is not active.');
}
export function checkIndependenceAuthority({age,basis,reviewed,evidence}){
 if(reviewed!==true||typeof evidence!=='string'||evidence.trim().length<20||evidence.length>8000)throw supportError(400,'Document the client’s authority, identity, and any court orders or access restrictions reviewed.');
 if(basis==='adult_self'&&age!==null&&age>=18)return;
 if(basis==='verified_emancipation'&&age!==null&&age>=0&&age<18)return;
 throw supportError(409,'Adult self-direction or legally verified emancipation is required. Service-specific minor consent is reviewed separately.');
}
