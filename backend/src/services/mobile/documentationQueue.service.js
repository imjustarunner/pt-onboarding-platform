import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import {runWithAgencyAccess} from '../../utils/agencyAccessContext.js';
import {publicUploadsUrlFromStoredPath} from '../../utils/uploads.js';
import {buildPublicAppUrl} from '../../utils/publicPortalUrl.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {requireNarrivaAgency,maskMobileClientName} from '../narrivaAccess.service.js';
import {authorizedMobileClientCards,sanitizeMobileWorkItem,mobileClinicalAge} from '../mobileClinicalPrivacy.service.js';

function invoke(handler,request) {
 return new Promise((resolve,reject)=>{
  let status=200;const response={set(){return this;},status(code){status=code;return this;},json(body){if(status>=400)reject(Object.assign(new Error('Documentation could not be loaded.'),{status}));else resolve(body);return this;}};
  Promise.resolve(handler(request,response,reject)).catch(reject);
 });
}
const work=async req=>invoke((await import('../../controllers/noteAidWorkQueue.controller.js')).listNoteAidWorkQueue,req);
const cosign=async req=>invoke((await import('../../controllers/notesToSign.controller.js')).listNotesToSign,req);
const source=async(...args)=>(await import('../narrivaSource.service.js')).loadNarrivaSource(...args);

/** Aggregate only fresh memberships; clinical actions still require an exact workspace token. */
export function createMobileDocumentationQueue({db=pool,findUser=id=>User.findById(id,{raw:true}),authorize=requireNarrivaAgency,
 cards=authorizedMobileClientCards,listWork=work,listCosign=cosign,loadSource=source,scope=runWithAgencyAccess}={}) {
 return async request=>{
  const user=await findUser(request.quickView.userId);
  if(!user || [0,false,'0'].includes(user.is_active))throw Object.assign(new Error('Your account is no longer active.'),{status:403});
  const {agencies:memberships}=await listMobileAgencies(user,{db});
  const items=[],agencies=[],failures=[];
  let isSupervisor=false;
  for(const agency of memberships){
   // requireNarrivaAgency mutates the actor to the agency's effective role. Never reuse it.
   const actor={...user};
   try{await authorize(actor,Number(agency.id));}catch(error){if([403,404].includes(error.status))continue;throw error;}
   const innerStrength=['tisi','innerstrength','theinnerstrengthinstitute'].includes(String(agency.slug || '').toLowerCase()) || /^(the )?inner strength institute$/i.test(String(agency.name || '').trim());
   const brand={agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:innerStrength?'/assets/branding/innerstrength-icon.png':publicUploadsUrlFromStoredPath(agency.logo_path || agency.logo_url) || null};
   agencies.push({id:brand.agencyId,name:brand.agencyName,logoUrl:brand.agencyLogoUrl});
   await scope(brand.agencyId,async()=>{
    const req=Object.assign(Object.create(request),{user:actor,query:{agencyId:brand.agencyId},params:{},body:{},
     headers:{...request.headers,'x-agency-id':String(brand.agencyId)},quickView:{...request.quickView,agencyId:brand.agencyId},
     mobileClinical:undefined,medicalBillingAgencyId:brand.agencyId,auricwellPreview:{agencyId:brand.agencyId},notesIncludeAll:true});
    try{
     const result=await listWork(req),rows=(result.items || []).filter(item=>Number(item.agencyId)===brand.agencyId);
     const allowed=await cards(actor,brand.agencyId,rows.map(item=>item.clientId));
     for(const row of rows){if(!row.clientId || !allowed.has(Number(row.clientId)))continue;items.push({...sanitizeMobileWorkItem(row,allowed.get(Number(row.clientId))),...brand,queueKind:'own'});}
    }catch(error){failures.push({...brand,section:'notes',message:'Your notes could not be loaded. Try again.'});}
    try{
     const result=await listCosign(req);isSupervisor ||= result.isSupervisor===true;
     for(const row of result.notes || []){
      if(Number(row.agency_id || row.agencyId)!==brand.agencyId)continue;
      let note;try{note=await loadSource(actor,{agencyId:brand.agencyId,noteId:Number(row.clinical_note_id || row.clinicalNoteId)});}catch(error){if([403,404].includes(error.status))continue;throw error;}
      const client=note.client,masked=maskMobileClientName(client),session=note.session || {},meta=note.meta || {};
      items.push({id:`cosign_${row.id}`,clinicalNoteId:row.clinical_note_id || row.clinicalNoteId,clinicalRevisionId:row.clinical_revision_id || null,
       clientId:Number(client.id),maskedName:masked,clientName:masked,age:mobileClinicalAge(client),...brand,
       ...(row.clinical_revision_id?{desktopReviewUrl:`${buildPublicAppUrl(agency,'note-aid')}?${new URLSearchParams({agencyId:String(brand.agencyId),noteId:String(row.clinical_note_id || row.clinicalNoteId),launchIntent:'cosign'})}`} : {}),
       date:row.date_of_service || meta.dateOfService || null,serviceCode:row.service_code || meta.serviceCode || null,
       scheduledStart:session.scheduled_start_at || null,scheduledEnd:session.scheduled_end_at || null,sourceTimezone:session.source_timezone || null,
       providerName:[row.provider_first_name,row.provider_last_name].filter(Boolean).join(' '),status:'awaiting_cosign',queueKind:'cosign',
       narriva:row.clinical_revision_id?{status:'pending',quickSignEligible:false}:row.narriva || {status:'pending',quickSignEligible:false}});
     }
    }catch(error){failures.push({...brand,section:'cosign',message:'Co-sign requests could not be loaded. Try again.'});}
   },{userId:actor.id,access:actor.agencyAccess});
  }
  return {items,agencies,failures,isSupervisor,clinicalAvailable:agencies.length>0,scope:'all_authorized_agencies'};
 };
}
export const getMobileDocumentationQueue=createMobileDocumentationQueue();
