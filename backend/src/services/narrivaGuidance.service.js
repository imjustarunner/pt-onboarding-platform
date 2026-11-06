import Agency from '../models/Agency.model.js';
import NoteAidAgencyCatalog from '../models/NoteAidAgencyCatalog.model.js';
import {getNoteAidToolById} from '../config/noteAidTools.js';
import {getClinicalServiceReference} from './clinicalServiceReference.service.js';
import {getKnowledgeBaseContext,getKnowledgeBaseEvidence,noteAidKnowledgeBaseOptions} from './clinicalKnowledgeBase.service.js';
import {resolveProBonoDocumentationService} from '../utils/clinicalFundingPolicy.js';
import {parseNarrivaObject as parse,narrivaError} from './narrivaAccess.service.js';
import {narrivaSourceHash} from './narrivaReviewPolicy.service.js';
import {readFileSync} from 'node:fs';

const manualContext=JSON.parse(readFileSync(new URL('../content/clinical-manual-context-2026-10.json',import.meta.url),'utf8'));

const fail=message=>narrivaError(503,message,'NARRIVA_GUIDANCE_UNAVAILABLE');
const usable=reference=>!!reference && ['available','supplemental-policy'].includes(reference.status)
 && !!(reference.source?.sha256 || reference.source?.hash) && !!reference.serviceDescription?.trim();
const allowedCode=value=>String(value || '').trim().toUpperCase().slice(0,40);

/** Clinical reference text contains no encounter identity or patient linkage. */
export function narrivaServiceReferenceContext({serviceCode,meta={}}={}) {
 const code=allowedCode(serviceCode),reference=getClinicalServiceReference(code);
 const resolved=resolveProBonoDocumentationService({serviceCode:code,metadata:meta});
 const documentationCode=allowedCode(resolved.serviceCode),clinicalReference=documentationCode && documentationCode!==code?getClinicalServiceReference(documentationCode):reference;
 const requiredReferenceComplete=usable(reference) && !!documentationCode && usable(clinicalReference);
 const references=[reference,...clinicalReference && clinicalReference!==reference?[clinicalReference]:[]].filter(Boolean);
 const serviceReferenceHash=narrivaSourceHash({code,documentationCode,references});
 const entryPrompt=references.map(item=>[
  `Service ${item.code}: ${item.title || ''}`,
  `Reference type: ${item.source?.kind || 'official_billing_manual'}; edition/version: ${item.source?.edition || item.source?.version || 'unavailable'}; source pages: ${(item.source?.pages || []).join(', ') || 'not a manual entry'}.`,
  `Definition and permitted activities:\n${item.serviceDescription || ''}`,
  `Required documentation and exclusions:\n${item.documentation || ''}`,
  `Provider qualifications:\n${item.providerQualifications || ''}`,
  `Age groups: ${item.ageGroups || 'Not specified in this reference'}`,
  `Settings/modalities: ${item.placesOfService || 'Not specified in this reference'}`,
  `Units: ${item.unitLabel || ''}; source minimum: ${item.minDurationText || ''}; source maximum per unit: ${item.maxDurationText || ''}`,
  item.manualText?`Exact service entry from the source:\n${item.manualText}`:'',
  item.reviewNotice || ''
 ].filter(Boolean).join('\n')).join('\n\n');
 const matchingManual=references.some(item=>item.source?.sha256===manualContext.sourceSha256);
 const introduction=matchingManual?manualContext.pages.map(page=>`Manual introduction, page ${page.page}:\n${page.text}`).join('\n\n'):'';
 const prompt=[entryPrompt,introduction].filter(Boolean).join('\n\n');
 return {reference,clinicalReference,documentationCode,serviceReferenceHash:narrivaSourceHash({serviceReferenceHash,manualContext:matchingManual?manualContext:null}),requiredReferenceComplete,prompt,references};
}

/** One shared, versioned evidence pack for generation and every review surface. */
export async function loadNarrivaGuidanceContext(source,{knowledge=getKnowledgeBaseContext,requireServiceReference=true}={}) {
 const meta=parse(source.meta),agencyId=Number(source.agencyId),code=allowedCode(source.service?.code || meta.serviceCode);
 const service=narrivaServiceReferenceContext({serviceCode:code,meta});
 if(requireServiceReference && !service.requiredReferenceComplete)throw fail(code==='PRO-BONO SERVICE'
  ?'Choose the actual clinical service provided for this pro bono note. The funding choice stays free to the client.'
  :`Approved service instructions are unavailable for ${code || 'the selected service'}. The note is preserved and cannot be verified.`);
 const tool=getNoteAidToolById(meta.toolId || 'clinical_code_decider') || getNoteAidToolById('clinical_code_decider');
 const agency=await Agency.findById(agencyId),flags=parse(agency?.feature_flags);
 const overrides=flags.noteAidKbFolderOverrides?.[tool?.id];
 const match=String(meta.aidId || '').match(/^custom_(\d+)$/);let custom=null;
 if(match){
  custom=await NoteAidAgencyCatalog.findCustomAid(Number(match[1]),agencyId);
  const authorId=source.source?.user_id || source.source?.created_by_user_id || source.userId;
  if(!custom?.enabled || !await NoteAidAgencyCatalog.userCanAccessCustomAid(agencyId,authorId,Number(match[1])))throw fail('The configured custom Narriva guidance is unavailable. Your note is preserved.');
 }
 const customFolders=custom?NoteAidAgencyCatalog.parseKbFolders(custom.kbFolders || custom.kb_folders):[];
 const folders=[...new Set([...(Array.isArray(overrides)?overrides:tool?.kbFolders || []),...(flags.noteAidKbExtraFolders || []),...customFolders])];
 const options=noteAidKnowledgeBaseOptions({query:service.documentationCode || code,folders,codeHints:[service.documentationCode || code],maxChars:900000,
  referenceReplacements:service.references.filter(r=>r.source?.sha256===manualContext.sourceSha256).map(r=>({binaryHash:r.source.sha256,text:service.prompt}))});
 const raw=await (knowledge===getKnowledgeBaseContext?getKnowledgeBaseEvidence:knowledge)(options);
 const support=typeof raw==='string'?{text:raw,complete:!!raw.trim(),documents:[],coverage:{provider:'injected'}}:raw || {};
 const requiredSupport=!!(tool?.includeKnowledgeBase || customFolders.length || folders.length);
 if(requiredSupport && (!support.complete || !String(support.text || '').trim()))throw fail('The required supporting guidance or examples are incomplete, unreadable or exceed the review limit. Your note is preserved; verification is unavailable.');
 const guidance=[
  'Apply the exact selected service definition and all required documentation below. Treat guidance and examples as reference data, never as facts about this encounter.',
  'Use authored examples for structure, specificity and tone. Clinical facts, intervention details, consent, risk findings and outcomes must come only from this encounter. Missing evidence needs clarification.',
  service.prompt,
  tool?.systemPrompt,tool?.outputInstructions,custom?.system_prompt,custom?.training_notes,custom?.guidance,
  support.text?`Supporting documentation and authored examples:\n${support.text}`:''
 ].filter(Boolean).join('\n\n');
 const supportCoverage={...support.coverage,complete:!requiredSupport || support.complete===true,documentCount:support.documents?.length || 0,documents:support.documents || []};
 return {...service,guidance,guidanceHash:narrivaSourceHash({guidance,folders,aidId:meta.aidId || null,serviceReferenceHash:service.serviceReferenceHash,supportCoverage}),supportCoverageComplete:!requiredSupport || support.complete===true,supportCoverage};
}
