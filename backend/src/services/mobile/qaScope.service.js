import {isQaPreviewIdentity,assertPreviewActor} from '../auricwellPreviewPolicy.js';
import {isAuricwellQaAgency} from '../../utils/auricwellQaPolicy.js';
import {failure} from './policy.js';

/** Reuse the established clinical QA grant; a demo flag alone grants nothing. */
export function mobileQaScope(user, memberships) {
 if([undefined,null,false,0,'0'].includes(user?.is_demo))return {agencies:memberships,qaAgencyIds:null};
 const agencies=isQaPreviewIdentity(user)?memberships.filter(isAuricwellQaAgency):[];
 if(!agencies.length)throw failure(403,'MOBILE_ACCOUNT_UNAVAILABLE','This test account does not have an approved synthetic mobile workspace.');
 assertPreviewActor(user,{}, {qaAgencyId:Number(agencies[0].id)});
 return {agencies,qaAgencyIds:agencies.map(a=>Number(a.id))};
}

export function qaAgencyAllowed(qaAgencyIds, agencyId) {
 return !qaAgencyIds || qaAgencyIds.includes(Number(agencyId));
}

export function assertMobileQaInputs(value, qaAgencyIds) {
 if(!qaAgencyIds || !value || typeof value!=='object')return;
 for(const[key,item]of Object.entries(value)){
  if(['agencyId','agency_id','organizationId','organization_id'].includes(key)&&item!==undefined&&item!==null&&item!==''&&item!=='all'&&!qaAgencyAllowed(qaAgencyIds,item))
   throw failure(403,'MOBILE_QA_SCOPE','This test account is limited to its approved synthetic workspace.');
  if(['agencyIds','agency_ids'].includes(key)&&item!=null){const ids=Array.isArray(item)?item:String(item).split(',');if(ids.some(id=>!qaAgencyAllowed(qaAgencyIds,id)))throw failure(403,'MOBILE_QA_SCOPE','This test account is limited to its approved synthetic workspace.');}
  if(item&&typeof item==='object')assertMobileQaInputs(item,qaAgencyIds);
 }
}

// Keep this list aligned with reviewed mobileClinical adapters. A new route does
// not inherit QA access; IDs must use canonical decimal path segments.
export function qaClinicalRouteAllowed(method,path,body={}) {
 const routes={
  GET:[
   /^\/clinical\/(?:context|assessments|notes-to-sign|narriva\/preferences|recording\/session\/context)$/,
   /^\/clinical\/clients\/[1-9][0-9]*\/summary$/,
   /^\/clinical\/assessments\/(?:client_document|session_material)\/[1-9][0-9]*\/view$/,
   /^\/clinical\/service-reference\/[A-Z0-9_\-]+$/,
   /^\/clinical\/narriva\/reviews\/[1-9][0-9]*$/,
   /^\/clinical\/narriva\/notes\/[1-9][0-9]*\/status$/,
   /^\/clinical\/sessions\/[1-9][0-9]*\/service$/,
   /^\/clinical\/notes\/[1-9][0-9]*$/,
   /^\/clinical\/recording\/session\/[1-9][0-9]*\/narrative$/,
   /^\/clinical\/recording\/session\/[1-9][0-9]*\/consent\/[1-9][0-9]*\/pdf$/
  ],
  POST:[
   /^\/clinical\/(?:assessments|drafts|generate|narriva\/reviews|sessions\/bootstrap|recording\/session\/start-setup)$/,
   /^\/clinical\/assessments\/[1-9][0-9]*\/scan$/,
   /^\/clinical\/sessions\/[1-9][0-9]*\/(?:service|notes)$/,
   /^\/clinical\/notes\/[1-9][0-9]*\/(?:sign|cosign)$/,
   /^\/clinical\/objectives\/[1-9][0-9]*\/ratings$/,
   /^\/clinical\/recording\/session\/[1-9][0-9]*\/(?:participants|consent|confirm|control|audio|finish)$/,
   /^\/clinical\/recording\/session\/[1-9][0-9]*\/consent\/[1-9][0-9]*\/(?:sign|withdraw)$/
  ],
  PATCH:[
   /^\/clinical\/narriva\/preferences$/,
   /^\/clinical\/narriva\/reviews\/[1-9][0-9]*\/findings$/,
   /^\/clinical\/drafts\/[1-9][0-9]*$/
  ]
 };
 if(method==='POST'&&/^\/clinical\/clients\/[1-9][0-9]*\/contact$/.test(path))return body.channel==='secure';
 return (routes[method]||[]).some(pattern=>pattern.test(path));
}

/** Unknown surfaces stay closed until their tenant and direct-ID checks are reviewed. */
export async function enforceMobileQaBoundary(req) {
 const ids=req.quickView?.qaAgencyIds;if(!ids)return;
 if(!req.quickView.mobileDeviceSessionId || !qaAgencyAllowed(ids,req.quickView.agencyId))throw failure(403,'MOBILE_QA_SCOPE','Open your approved synthetic workspace with your primary account.');
 assertMobileQaInputs(req.query,ids);assertMobileQaInputs(req.body,ids);assertMobileQaInputs(req.params,ids);
 for(const[key,value]of Object.entries(req.params||{}))if(/(?:^id$|Id$|_id$)/.test(key)&&(!/^[1-9][0-9]*$/.test(String(value))||!Number.isSafeInteger(Number(value))))throw failure(403,'MOBILE_QA_SURFACE_UNAVAILABLE','Use the canonical record link in the synthetic mobile workspace.');
 const path=String(req.originalUrl||req.path||'').split('?')[0].replace(/^\/api\/quick-view/,'').replace(/\/$/,'');
 const method=String(req.method).toUpperCase();
 let allowed=method==='GET'&&['/my-work','/calendar/day','/tasks'].includes(path);
 // Clinical adapters enforce the exact token agency, author/assigned reviewer and
 // client/record bindings. Outbound family delivery remains a separate QA grant.
 if(qaClinicalRouteAllowed(method,path,req.body))allowed=true;
 if(/^\/messages\/preferences$/.test(path)&&['GET','PATCH'].includes(method))allowed=true;
 if(!allowed){const {qaConversaRouteAllowed}=await import('./qaConversaScope.service.js');allowed=qaConversaRouteAllowed(method,path);}
 if(!allowed)throw failure(403,'MOBILE_QA_SURFACE_UNAVAILABLE','This action is not enabled for the synthetic mobile pilot. Use an authorized staff account to test it.');
}
