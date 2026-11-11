import {mobileToolAccess} from './toolAccess.service.js';
import {runWithAgencyAccess} from '../../utils/agencyAccessContext.js';
import {invokeSupportHandler,requireSupportResult} from './supportContext.service.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const positive=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):null;
const contact=user=>({id:Number(user.id),name:[user.first_name,user.last_name].filter(Boolean).join(' '),email:user.personal_email||user.email||null,phone:user.phone_number||null});
export function applicantSummary(row,agency){return{...contact(row),agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency),stage:row.stage||'applied',stageLabel:row.stage_label||row.stage||'Applied',role:row.job_title||row.applied_role||null,submittedAt:row.latest_application_at||row.hiring_created_at||null,updatedAt:row.hiring_updated_at||null,applicationCount:Number(row.application_count)||0,isNew:row.is_new_for_me===true};}
export function applicantDetail(body,agency){const profile=body.profile||{};return{...applicantSummary({...body.user,...profile,id:body.user?.id,stage_label:profile.stage_label,job_title:body.jobDescription?.title},agency),applications:(body.applications||[]).map(row=>({submissionId:row.submissionId,submittedAt:row.submittedAt,jobTitle:row.jobTitle,coverLetterPreview:row.coverLetterPreview||null,hasPdf:!!row.hasPdf})),interview:{start:profile.interview_starts_at||null,timeZone:profile.interview_timezone||null,status:profile.interview_status||null}};}
/** Read-only, fixed hiring operations. The canonical controllers retain agency/candidate checks. */
export function createMobileApplicants({access=mobileToolAccess,scope=runWithAgencyAccess,handlers=null}={}){
 const main=async()=>handlers||await import('../../controllers/hiring.controller.js');
 return async function applicants(req,res,next){try{res.set('Cache-Control','no-store');const h=await main(),selected=req.query?.agencyId==='all'?null:req.query?.agencyId;
  if(req.params?.candidateId){const candidateId=positive(req.params.candidateId);if(!candidateId||!selected)throw fail(400,'Choose a valid applicant and agency.');const{agency,actor}=await access(req,'applicants',selected);const overrides={user:actor,params:{userId:String(candidateId)},query:{agencyId:String(agency.id)}};
   if(req.params.resumeId){const docId=positive(req.params.resumeId);if(!docId)throw fail(400,'Choose a valid résumé.');const resume=await scope(Number(agency.id),async()=>requireSupportResult(await invokeSupportHandler(h.viewCandidateResume,req,{...overrides,params:{...overrides.params,docId:String(docId)}})));return res.json({resume:{url:resume.url,title:resume.title||resume.originalName||'Résumé',mimeType:resume.mimeType,extractedText:resume.extractedText||null,expiresInMinutes:resume.expiresInMinutes}});}
   const [body,resumes]=await scope(Number(agency.id),()=>Promise.all([invokeSupportHandler(h.getCandidate,req,overrides).then(requireSupportResult),invokeSupportHandler(h.listCandidateResumes,req,overrides).then(requireSupportResult)]));return res.json({candidate:{...applicantDetail(body,agency),resumes:(resumes||[]).map(row=>({id:row.id,title:row.title||row.originalName||'Résumé',hasFile:!!row.hasFile,mimeType:row.mimeType||null}))}});}
  const entries=selected?[await access(req,'applicants',selected)]:await access(req,'applicants');const recent=req.query?.view==='recent';const q=String(req.query?.q||'').trim().slice(0,100);const candidates=[];
  for(const{agency,actor}of entries){const rows=await scope(Number(agency.id),async()=>requireSupportResult(await invokeSupportHandler(h.listCandidates,req,{user:actor,query:{agencyId:String(agency.id),q,status:'PROSPECTIVE',...(recent?{stageFilter:'all'}:{}),limit:'150'}})));for(const row of rows||[])candidates.push(applicantSummary(row,agency));}
  candidates.sort((a,b)=>String(b.submittedAt||b.updatedAt||'').localeCompare(String(a.submittedAt||a.updatedAt||''))||b.id-a.id);return res.json({agencies:entries.map(({agency})=>({id:Number(agency.id),name:agency.name,logoUrl:mobileAgencyIcon(agency)})),candidates});
 }catch(error){next(error);}};
}
export const mobileApplicants=createMobileApplicants();
