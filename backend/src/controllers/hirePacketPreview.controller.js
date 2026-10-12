import { contractRoleLabel, jobContractExpectations, sanitizeContractExpectations, expectationsToTokens } from '../utils/contractExpectations.js';
import {findContractPlaceholders} from '../utils/contractPlaceholders.js';
import StorageService from '../services/storage.service.js';
import { rehearsalContractTokens, markRehearsalContract, sampleRehearsalContract } from '../services/hireRehearsalContract.service.js';
import { sanitizeJobDescriptionSections } from '../utils/jobDescriptionSectionsSanitize.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { listConfigs } from '../services/contractGenerator.service.js';
import { contractCompensationLevels } from '../services/contractCompensation.service.js';
import { getAgencyBuilderDefaults, renderContractHtml, loadContractBundle, applyContractTokens, inferCompensationFromCredential } from '../services/contractMerge.service.js';
import { buildReferenceReleasePdfBuffer } from '../services/referenceReleasePdf.service.js';

export async function previewAgency(req) {
  if(req.rehearsalAccess)return req.rehearsalAccess.agencyId;
  const id = Number(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Select an agency.'), {status:400});
  if (!['super_admin','superadmin'].includes(req.user?.role)) {
    const agencies = await User.getAgencies(req.user.id);
    if (!agencies.some(a=>Number(a.id)===id)) throw Object.assign(new Error('Agency access denied.'), {status:403});
  }
  return id;
}
async function selectedJob(agencyId,id) {
  const job = await HiringJobDescription.findById(Number(id));
  if (!job || Number(job.agency_id)!==agencyId || !job.is_active) throw Object.assign(new Error('Choose an active job posting in this agency.'),{status:404});
  return job;
}
export async function packetPreviewOptions(req,res,next) {
  try {
    const agencyId = await previewAgency(req);
    const [jobs,configs,levels,agency] = await Promise.all([HiringJobDescription.listByAgencyId(agencyId,{includeInactive:false,limit:500}),listConfigs(agencyId),contractCompensationLevels(agencyId),Agency.findById(agencyId)]);
    res.set('Cache-Control','no-store').json({agency:{id:agencyId,name:agency.name},jobs:jobs.map(j=>({id:j.id,title:j.title,description:j.description_text,descriptionSections:sanitizeJobDescriptionSections(j.description_sections_json),scheduleText:j.schedule_text,defaultConfigId:j.default_contract_config_id,roleType:j.role_type,contractDefaults:jobContractExpectations(j),educationLevel:j.education_level,hasFile:!!j.storage_path,suggested:inferCompensationFromCredential({credential:j.education_level,jobTitle:j.title,role:j.role_type})})),configs:configs.filter(c=>c.is_active).map(c=>({id:c.id,name:c.name,payMode:c.pay_mode})),levels});
  } catch(e){next(e);}
}
export async function packetPreviewReference(req,res,next) {
  try {
    const agencyId=await previewAgency(req),job=await selectedJob(agencyId,req.query.jobId),agency=await Agency.findById(agencyId);
    const pdf=await buildReferenceReleasePdfBuffer({agency,agencyName:agency.name,applicantName:'Alex Demo (preview)',applicantEmail:'alex.demo@example.test',jobTitle:job.title,references:[{name:'Jordan Example',email:'jordan.reference@example.test',organization:'Example Community Program'},{name:'Casey Sample',email:'casey.reference@example.test',organization:'Example University'}],preview:true});
    res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline; filename="reference-release-preview.pdf"'}).send(pdf);
  }catch(e){next(e);}
}
export async function packetPreviewContract(req,res,next) {
  try {
    const agencyId=await previewAgency(req),job=await selectedJob(agencyId,req.body.jobId),defaults=await getAgencyBuilderDefaults(agencyId);
    const configId=Number(req.body.configId || job.default_contract_config_id);
    const seeded = !!req.rehearsalAccess || req.body.seeded === true;
    const expectations={...jobContractExpectations(job),...sanitizeContractExpectations(req.body.expectations)};
    let fallbackPayMode='hourly';
    try {
    if(!configId)throw Object.assign(new Error('Select the contract configuration for this posting.'),{status:400});
    const jobDescClauseKey=job.job_desc_clause_key || (seeded?'JOB_DESC_GENERIC':undefined);
    if (!job.job_desc_clause_key && !seeded) throw Object.assign(new Error('Link this posting to its job-specific contract duties before previewing the agreement.'),{status:409});
    let sampleTokens = {};
    if(seeded) {
      const bundle=await loadContractBundle({agencyId,configId,jobDescClauseKey});
      fallbackPayMode=bundle.config?.pay_mode || 'hourly';
      sampleTokens=rehearsalContractTokens({job,defaults,category:req.body.category,level:req.body.level,sourceHtml:bundle.clauses.map(c=>c.body_html).join('\n')});
    }
    const rendered=await renderContractHtml({agencyId,configId,compensationCategory:Number(req.body.category),compensationLevel:Number(req.body.level),jobDescClauseKey,tokens:{COMPANY_NAME:defaults.agency?.name || '',COMPANY_ADDRESS:defaults.agency?.address || '',EMPLOYEE_NAME:'Alex Demo',EMPLOYEE_FULL_NAME:'Alex Demo',CANDIDATE_NAME:'Alex Demo',ROLE_LABEL:contractRoleLabel({jobTitle:job.title,roleType:job.role_type,credential:job.education_level}),EMPLOYEE_FIRST_NAME:'Alex',EMPLOYEE_LAST_NAME:'Demo',EMPLOYEE_EMAIL:'alex.demo@example.test',JOB_TITLE:job.title,JOB_DESCRIPTION:job.description_text || '',JOB_DESCRIPTION_ID:String(job.id),ROLE_TYPE:job.role_type || '',COMPENSATION_CATEGORY:String(req.body.category),COMPENSATION_LEVEL:String(req.body.level),...sampleTokens,...expectationsToTokens(expectations),CONTRACT_EXPECTATIONS:expectations}});
    const completedHtml=seeded?applyContractTokens(rendered.html,{...rehearsalContractTokens({job,defaults,sourceHtml:rendered.html,category:req.body.category,level:req.body.level}),...Object.fromEntries(Object.entries(rendered.tokens).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!==''))}):rendered.html;
    if(seeded&&findContractPlaceholders(completedHtml).length)throw Object.assign(new Error('Sample merge fields could not be populated.'),{status:409});
    res.set('Cache-Control','no-store').json({seeded,clauseManifest:rendered.clauseManifest,html:seeded?markRehearsalContract(completedHtml):completedHtml,unresolvedTokens:seeded?[]:rendered.unresolvedTokens,jobId:job.id,configId,category:Number(req.body.category),level:Number(req.body.level)});
    }catch(error){
      if(!seeded || ![400,404,409].includes(error.status))throw error;
      const category=Number(req.body.category)||1,level=Number(req.body.level)||1;
      const levels=await contractCompensationLevels(agencyId);
      const pay=levels.find(l=>Number(l.category)===category&&Number(l.level)===level);
      res.set('Cache-Control','no-store').json({...sampleRehearsalContract({job,defaults,category,level,pay,payMode:fallbackPayMode,reason:error.message,expectations}),jobId:job.id,configId,category,level});
    }
  }catch(e){next(e);}
}

export async function packetPreviewJobFile(req,res,next){try{
 const agencyId=await previewAgency(req),job=await selectedJob(agencyId,req.query.jobId);
 if(!job.storage_path)throw Object.assign(new Error('This job has no attached document.'),{status:404});
 const buffer=await StorageService.readObjectBuffer(job.storage_path);
 res.set({'Content-Type':job.mime_type || 'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}).send(buffer);
}catch(e){next(e);}}
