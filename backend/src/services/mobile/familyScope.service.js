import pool from '../../config/database.js';
import {failure} from './policy.js';
import {isNluTutoringQaAgency} from '../../utils/nluTutoringQaPolicy.js';
export const FAMILY_ROLES=new Set(['client_guardian','client','guardian']);
export async function listMobileFamilyAgencies(user,{db=pool}={}){
 // A family device is limited to existing, enabled portal relationships. Staff
 // memberships and platform grants never substitute for a child/guardian link.
 const [linkedAgencies]=await db.execute(`SELECT DISTINCT a.* FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
  JOIN agencies a ON a.id=c.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
  WHERE cg.guardian_user_id=? AND cg.access_enabled=1 AND (c.guardian_portal_enabled=1 OR cg.relationship_type='self') ORDER BY a.name`,[user.id]);
 const nluFixture=Number(user.is_demo)===1&&((Number(user.id)===1759&&user.email==='qa.nlu.parent@example.com')||user.email==='qa.nlu.coparent@example.com');
 const agencies=nluFixture?linkedAgencies.filter(isNluTutoringQaAgency):linkedAgencies;
 if(!agencies.length)throw failure(403,'MOBILE_FAMILY_UNAVAILABLE','No active family portal is linked to this account. Contact your care team.');
 return {agencies,qaAgencyIds:nluFixture?agencies.map(a=>Number(a.id)):null};
}
// These are the existing family controllers, each retaining its own child,
// guardian, consent, billing and document authorization. No staff API is exposed.
export function mobileFamilyRouteAllowed(method,path,userId){
 const route=String(path).split('?')[0].replace(/\/$/,'');
 // Address-only assistance reads no staff, client or billing data. Existing family authentication still applies.
 if(method==='POST' && /^\/api\/address-lookup\/(suggest|select)$/.test(route))return true;
 if(method==='GET' && /^\/api\/secure-session-comments\/(today|history|badges|appointments\/\d+)$/.test(route))return true;
 if(method==='POST' && /^\/api\/secure-session-comments\/(attention|appointments\/\d+(?:\/read)?)$/.test(route))return true;
 if(method==='PATCH' && /^\/api\/secure-session-comments\/appointments\/\d+\/comments\/\d+$/.test(route))return true;
 if(method==='GET' && route==='/api/secure-family-sharing-notice')return true;
 if(method==='POST' && route==='/api/secure-family-sharing-notice/ack')return true;
 if(/^\/api\/(guardian-portal|guardian-billing|family-billing|dependent-portal)(?:\/|$)/.test(route))return true;
 if(method==='GET' && /^\/api\/(?:learning-progress\/students\/\d+|learning-recommendations\/students\/\d+|tutoring-learning-os\/clients\/\d+)(?:\/|$)/.test(route))return true;
 if(method==='GET' && /^\/api\/(?:agencies\/(?:slug\/[^/]+|portal\/[^/]+\/theme|\d+\/(?:branding|public))|icons\/[^/]+|platform-branding|dependent-portal\/status)$/.test(route))return true;
 return method==='GET' && route===`/api/users/${Number(userId)}/preferences`;
}
