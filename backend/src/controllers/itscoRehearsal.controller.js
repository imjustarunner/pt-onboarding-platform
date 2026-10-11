import {createRehearsalAccess} from '../services/rehearsalAccess.service.js';
import {readFile} from 'node:fs/promises';
import Agency from '../models/Agency.model.js';
import {previewAgency} from './hirePacketPreview.controller.js';
import {getHandbookSource,handbookMetadata} from '../services/workplaceHandbookContent.js';
import {referenceCatalogFor,referenceSource,referenceMetadata} from '../services/companyReferenceContent.js';
import {trainingDefinitionsFor,requiredTrainingKeys} from '../services/documentTrainingContent.js';
import {PREEMPLOYMENT_FIELDS} from '../utils/hirePortalWorkflow.js';
import {hireFormDefinitions} from '../services/hireFormDefinitions.service.js';
import {getClinicalTemplate,clinicalFormCatalog} from '../services/safetyPlans/clinicalTemplates.js';
import {agencyBrand} from '../services/safetyPlans/access.js';
const i9 = new URL('../assets/hireOnboarding/itsco/i9_2025.pdf', import.meta.url);
export async function rehearsalAgency(req) {
  if(req.rehearsalAccess){const agency=await Agency.findById(req.rehearsalAccess.agencyId);if(agency?.slug!=='itsco')throw Object.assign(new Error('ITSCO rehearsal not found.'),{status:404});return agency;}
  if (!['admin','super_admin'].includes(req.user?.role) || req.user.demoMode || req.user.switchedFromUserId) throw Object.assign(new Error('Use your own administrator account to open the rehearsal.'),{status:403});
  const id=await previewAgency(req),agency=await Agency.findById(id);
  if(agency?.slug!=='itsco')throw Object.assign(new Error('This rehearsal is configured for ITSCO.'),{status:404});
  return agency;
}
export async function rehearsalBootstrap(req,res,next){
 try {
  const agency=await rehearsalAgency(req),catalog=[{key:'workplace-handbook',title:'Workplace Handbook',description:'Agency policies and reference.'},...referenceCatalogFor(agency)],books={};
  for(const [i,item] of catalog.entries()){
   const source=item.key==='workplace-handbook'?getHandbookSource(agency):referenceSource(agency,item.key);
   if(source)books[item.key]={sections:source.sections,metadata:item.key==='workplace-handbook'?handbookMetadata(source):referenceMetadata(source),updates:source.reviewUpdates||[],version:{id:i+1,version_number:1,is_draft:1}};
  }
  const definitions=trainingDefinitionsFor(agency).map(({previousEditions,...d})=>d),required={};
  for(const role of ['facilitator','provider','intern','staff'])for(const school of [true,false])required[`${role}:${school}`]=requiredTrainingKeys(agency,{role,credential:role==='facilitator'?'BA':role==='provider'?'LPC':'',status:'ONBOARDING'},school);
  const templates=Object.fromEntries(await Promise.all(clinicalFormCatalog.map(async c=>[c.key,await getClinicalTemplate(c.key,agency.id)])));
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).json({agency:{id:agency.id,slug:agency.slug,name:agency.name,primaryColor:'#12583f'},books,catalog,definitions,required,profileFields:PREEMPLOYMENT_FIELDS,formFields:await hireFormDefinitions(await readFile(i9),'i9'),templates,clinicalFormCatalog,branding:await agencyBrand(agency.id)});
 }catch(e){next(e);}
}
export async function rehearsalI9(req,res,next){try{await rehearsalAgency(req);res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'inline; filename="rehearsal-blank-i9.pdf"'}).send(await readFile(i9));}catch(e){next(e);}}

export async function rehearsalLink(req,res,next){try{const agency=await rehearsalAgency(req);const token=createRehearsalAccess(Number(agency.id),req.user.id);res.set('Cache-Control','no-store').json({token,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()});}catch(e){next(e);}}
