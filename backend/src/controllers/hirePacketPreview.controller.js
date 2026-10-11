import HiringJobDescription from '../models/HiringJobDescription.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { listConfigs } from '../services/contractGenerator.service.js';
import { contractCompensationLevels } from '../services/contractCompensation.service.js';
import { getAgencyBuilderDefaults, renderContractHtml, inferCompensationFromCredential } from '../services/contractMerge.service.js';
import { buildReferenceReleasePdfBuffer } from '../services/referenceReleasePdf.service.js';

export async function previewAgency(req) {
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
    res.set('Cache-Control','no-store').json({agency:{id:agencyId,name:agency.name},jobs:jobs.map(j=>({id:j.id,title:j.title,description:j.description_text,defaultConfigId:j.default_contract_config_id,roleType:j.role_type,educationLevel:j.education_level,hasFile:!!j.storage_path,suggested:inferCompensationFromCredential({credential:j.education_level,jobTitle:j.title,role:j.role_type})})),configs:configs.filter(c=>c.is_active).map(c=>({id:c.id,name:c.name,payMode:c.pay_mode})),levels});
  } catch(e){next(e);}
}
export async function packetPreviewReference(req,res,next) {
  try {
    const agencyId=await previewAgency(req),job=await selectedJob(agencyId,req.query.jobId),agency=await Agency.findById(agencyId);
    const pdf=await buildReferenceReleasePdfBuffer({agencyName:agency.name,applicantName:'Alex Demo (preview)',applicantEmail:'alex.demo@example.test',jobTitle:job.title,preview:true});
    res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline; filename="reference-release-preview.pdf"'}).send(pdf);
  }catch(e){next(e);}
}
export async function packetPreviewContract(req,res,next) {
  try {
    const agencyId=await previewAgency(req),job=await selectedJob(agencyId,req.body.jobId),defaults=await getAgencyBuilderDefaults(agencyId);
    const configId=Number(req.body.configId || job.default_contract_config_id);
    if(!configId)throw Object.assign(new Error('Select the contract configuration for this posting.'),{status:400});
    if (!job.job_desc_clause_key) throw Object.assign(new Error('Link this posting to its job-specific contract duties before previewing the agreement.'),{status:409});
    const rendered=await renderContractHtml({agencyId,configId,compensationCategory:Number(req.body.category),compensationLevel:Number(req.body.level),jobDescClauseKey:job.job_desc_clause_key || undefined,tokens:{COMPANY_NAME:defaults.agency?.name || '',COMPANY_ADDRESS:defaults.agency?.address || '',EMPLOYEE_NAME:'Alex Demo',EMPLOYEE_FULL_NAME:'Alex Demo',CANDIDATE_NAME:'Alex Demo',ROLE_LABEL:job.title,EMPLOYEE_FIRST_NAME:'Alex',EMPLOYEE_LAST_NAME:'Demo',EMPLOYEE_EMAIL:'alex.demo@example.test',JOB_TITLE:job.title,JOB_DESCRIPTION:job.description_text || '',JOB_DESCRIPTION_ID:String(job.id),ROLE_TYPE:job.role_type || '',COMPENSATION_CATEGORY:String(req.body.category),COMPENSATION_LEVEL:String(req.body.level)}});
    res.set('Cache-Control','no-store').json({html:rendered.html,unresolvedTokens:rendered.unresolvedTokens,jobId:job.id,configId,category:Number(req.body.category),level:Number(req.body.level)});
  }catch(e){next(e);}
}
