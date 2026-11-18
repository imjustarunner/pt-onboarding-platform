import pool from '../config/database.js';
import {plotlineFailure,plotlineTrial} from './plotlineSelfService.service.js';
import {assertPlotlineHiringResources} from './plotlineHiringResources.service.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
export function assertPlotlineCareersPublished(agency){
 const flags=parse(agency?.feature_flags);
 if(flags.plotlineOnly===true && flags.plotlineCareersPublished!==true)throw plotlineFailure(404,'CAREERS_NOT_PUBLISHED','This company’s careers page is not published.');
}
export const plotlineApiAllowed=(path,method='GET')=>/^\/api\/(?:plotline|auth|account-security|passkeys|session-security|sessions|users|agencies|branding|platform-branding|fonts|uploads|icons|notifications|hiring|contracts|evaluations|employee-relations|lifecycle|prehire-portal|modules|tracks|tasks|documents|training|onboarding|learning|user-activity|preferences|public-intake|public|intake-links)(?:\/|$)/.test(path)
  || /^\/api\/presence\/(?:heartbeat|me|status(?:\/clear)?)\/?$/.test(path)
  || (['GET','HEAD','OPTIONS'].includes(method) && /^\/api\/(?:onboarding-packages|document-templates)\/?$/.test(path));
export function createPlotlineCompanyPolicy({db=pool,now=()=>new Date()}={}) {
 async function record(agencyId){
   const [[agency]]=await db.execute('SELECT id,feature_flags FROM agencies WHERE id=?',[agencyId]);
   if(parse(agency?.feature_flags).plotlineOnly!==true)return null;
   // A missing trial record/schema for a flagged company fails closed.
   const [[company]]=await db.execute('SELECT * FROM plotline_companies WHERE agency_id=?',[agencyId]);
   if(!company)throw plotlineFailure(503,'PLOTLINE_COMPANY_UNAVAILABLE','This company needs setup review.');
   return company;
 }
 async function assertWritable(agencyId){const row=await record(agencyId);if(row&&!plotlineTrial(row,now()).canWrite)throw plotlineFailure(409,'PLOTLINE_TRIAL_ENDED','Your trial has ended. This company is read-only. Open Plotline to request continuation; no payment is taken automatically.');}
 async function assertRequest(req){
   const path=String(req.originalUrl||req.path||'').split('?')[0];
   // Account and self-service routes perform their own exact membership checks.
   if(/^\/api\/(?:plotline|auth|account-security|passkeys|session-security|sessions)(?:\/|$)/.test(path))return;
   if(req.scopedAgencyFeatureFlags && parse(req.scopedAgencyFeatureFlags).plotlineOnly!==true)return;
   const agencyId=Number(req.user?.scopedAgencyId||req.user?.agencyId);
   if(!Number.isSafeInteger(agencyId)||agencyId<1)return;
   const row=await record(agencyId);if(!row)return;
   if(!plotlineApiAllowed(path,req.method))throw plotlineFailure(403,'PLOTLINE_PRODUCT_BOUNDARY','This company uses Plotline People Operations. This product is not enabled for it.');
   if(!['GET','HEAD','OPTIONS'].includes(req.method) && /^\/api\/agencies(?:\/|$)/.test(path))throw plotlineFailure(403,'PLOTLINE_COMPANY_SETUP_REQUIRED','Manage this company through Plotline. New companies use the verified setup flow and its trial limits.');
   const explicit=[req.query?.agencyId,req.body?.agencyId,req.headers?.['x-agency-id']].filter(v=>v!==undefined&&v!==null&&v!=='').map(Number);
   if(explicit.some(id=>id!==agencyId))throw plotlineFailure(403,'PLOTLINE_COMPANY_MISMATCH','Choose the same company for this action.');
   await assertPlotlineHiringResources(req,agencyId,path,db);
   if(!['GET','HEAD','OPTIONS'].includes(req.method))await assertWritable(agencyId);
 }
 return {record,assertWritable,assertRequest};
}
export default createPlotlineCompanyPolicy();
