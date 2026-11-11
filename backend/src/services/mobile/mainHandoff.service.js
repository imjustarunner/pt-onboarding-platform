import {randomUUID} from 'node:crypto';
import config from '../../config/config.js';
import {touchSession} from '../quickViewAuth.service.js';
import {assertFullSuiteIdentity,signFullSuiteToken} from '../productIdentity.service.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../../utils/agencyAccessPolicy.js';
import {buildPublicAppUrl,DEDICATED_APP_HOSTS,platformFrontendBase} from '../../utils/publicPortalUrl.js';
import {mobileSessions,parsePrimaryAuthentication} from './session.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {mobileClientDirectoryContext} from './clientDirectory.service.js';

const STAFF_ROLES=new Set(['super_admin','admin','support','staff','provider','provider_plus','intern','intern_plus','clinical_practice_assistant','school_staff','school_admin']);
const CLIENT_ROLES=new Set(['super_admin','admin','support','staff','provider','provider_plus','intern','intern_plus','clinical_practice_assistant']);
const NATIVE_ORIGINS=new Set(['capacitor://localhost','ionic://localhost']);
const PRIVATE_HEADERS={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const fail=status=>Object.assign(new Error('Mobile main-app handoff unavailable.'),{status});
function positiveId(value){return ['string','number'].includes(typeof value)&&/^(?:[1-9]\d*)$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):null;}
function httpsOrigin(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.origin:null;}catch{return null;}}

export function mobileMainTrustedOrigins(platformOrigin=platformFrontendBase()){
 const origins=new Set(['https://auricwell.com','https://www.auricwell.com','https://schoolcarebridge.org','https://www.schoolcarebridge.org','https://app.schoolcarebridge.org','https://mh4kidz.org',...Object.values(DEDICATED_APP_HOSTS).map(host=>`https://${host}`)]);
 const configured=httpsOrigin(platformOrigin);if(configured)origins.add(configured);
 return origins;
}

async function freshActor(user,agencyId){
 const access=await readAgencyAccess(user.id,agencyId);
 if(!access&&user.role!=='super_admin')throw fail(403);
 return {...applyAgencyAccess({...user},access),scopedAgencyId:agencyId};
}

/**
 * Top-level POST only: the private unlocked mobile grant stays in the form body.
 * The target host sets its own short HttpOnly cookie; the URL never carries a grant.
 * Ordinary main-app permissions, session security and MFA checks still apply.
 */
export function createMobileMainHandoff({
 touch=touchSession,access=(...args)=>mobileSessions.access(...args),assertProduct=assertFullSuiteIdentity,
 agencies=listMobileAgencies,getActor=freshActor,clientContext=mobileClientDirectoryContext,
 sign=signFullSuiteToken,buildUrl=buildPublicAppUrl,settings=config,trustedOrigins=mobileMainTrustedOrigins(),
 now=()=>Date.now(),newSessionId=randomUUID
}={}){
 return async function mobileMainHandoff(request,response){
  for(const [name,value] of Object.entries(PRIVATE_HEADERS))response.setHeader(name,value);
  try{
   // Mount before request-body logging. Scrub even rejected forms before another middleware can inspect them.
   const body=request.body;
   const token=body?.sessionToken;
   if(body&&typeof body==='object')delete body.sessionToken;
   request.sanitizedBody='[PRIVATE MOBILE HANDOFF]';
   const header=name=>String(request.get?.(name)||request.headers?.[name.toLowerCase()]||'');
   const origin=header('origin');
   if(request.method!=='POST'||!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(header('content-type')))throw fail(400);
   if((header('sec-fetch-mode')&&header('sec-fetch-mode')!=='navigate')||(header('sec-fetch-dest')&&header('sec-fetch-dest')!=='document'))throw fail(403);
   if(!trustedOrigins.has(origin)&&!NATIVE_ORIGINS.has(origin))throw fail(403);
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['kind','agencyId','clientId'].includes(key))||Object.keys(request.query||{}).length)throw fail(400);
   const agencyId=positiveId(body.agencyId),clientId=positiveId(body.clientId),kind=body.kind;
   if(!agencyId||!['client','schedule'].includes(kind)||(kind==='client'&&!clientId)||(kind==='schedule'&&body.clientId!==undefined))throw fail(400);
   if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw fail(401);
   // Validation does not extend the mobile workspace's absolute lock deadline.
   const unlocked=await touch(token,{activity:false});
   if(!unlocked?.mobileDeviceSessionId||!positiveId(unlocked.userId)||!positiveId(unlocked.agencyId))throw fail(401);
   const remaining=Math.floor((new Date(unlocked.expiresAt).getTime()-now())/1000);
   if(!Number.isFinite(remaining)||remaining<=0)throw fail(401);
   const context=await access(unlocked.mobileDeviceSessionId,unlocked.userId,unlocked.agencyId,unlocked.credentialVersion??null);
   const proof=parsePrimaryAuthentication(context.device?.primary_authentication_json);
   if(context.surface!=='staff'||!STAFF_ROLES.has(context.user?.role)||Number(context.user?.id)!==Number(unlocked.userId))throw fail(403);
   if(!proof?.sessionKey?.trim()||!Number.isFinite(proof.issuedAt)||proof.issuedAt<=0||proof.issuedAt>Math.floor(now()/1000)+60)throw fail(401);
   if(NATIVE_ORIGINS.has(origin)&&context.device?.client_id!=='ios')throw fail(403);
   await assertProduct(context.user.id);
   // Re-enumerate memberships instead of trusting the workspace chosen at enrollment.
   const scoped=await agencies(context.user);
   // Main-app JWTs do not carry the mobile synthetic-agency boundary. Never
   // turn a limited QA/demo device into an unrestricted full-suite principal,
   // even when the requested destination itself is inside its approved scope.
   if(scoped.qaAgencyIds!=null||context.qaAgencyIds!=null||![undefined,null,false,0,'0'].includes(context.user.is_demo))throw fail(403);
   const agency=scoped.agencies.find(candidate=>Number(candidate.id)===agencyId);
   if(!agency)throw fail(403);
   const actor=await getActor(context.user,agencyId);
   if(!STAFF_ROLES.has(actor?.role))throw fail(403);
   let path='my-schedule';
   if(kind==='client'){
    if(!CLIENT_ROLES.has(actor.role))throw fail(403);
    const authorized=await clientContext({...request,quickView:unlocked},clientId,agencyId);
    if(!authorized?.fullProfileUrl||Number(authorized.client?.id)!==clientId||Number(authorized.agency?.id)!==agencyId||!CLIENT_ROLES.has(authorized.actor?.role))throw fail(403);
    path=`admin/clients/${clientId}`;
   }
   const target=new URL(buildUrl(agency,path));
   if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||!trustedOrigins.has(target.origin))throw fail(403);
   if(target.host.toLowerCase()!==header('host').toLowerCase())throw fail(403);
   // An allowlisted local path also prevents a custom-domain record becoming an open redirect.
   if(!target.pathname.startsWith('/')||target.pathname.startsWith('//')||!target.pathname.endsWith(`/${path}`))throw fail(403);
   const ttl=Math.min(300,remaining);
   const mainToken=await sign({id:Number(context.user.id),email:context.user.email,role:context.user.role,agencyId,product:'full_suite',authMethod:'mobile',sessionId:newSessionId()},settings.jwt.secret,{expiresIn:ttl});
   response.cookie('authToken',mainToken,{...settings.authCookie.set(),httpOnly:true,secure:true,maxAge:ttl*1000});
   // This public marker makes the SPA discard any old localStorage bearer before cookie bootstrap.
   response.redirect(303,`${target.pathname}?mobileHandoff=1&mobileHandoffAgency=${agencyId}`);
  }catch(error){
   const status=[400,401,403,404,423].includes(error?.status)?error.status:500;
   response.status(status).json({code:'MOBILE_MAIN_HANDOFF_UNAVAILABLE',message:status===401||status===423?'Reopen AuricWell and unlock this workspace, then try again.':'The main app could not be opened. Return to AuricWell and try again.'});
  }
 };
}

export const openMobileMainApp=createMobileMainHandoff();
