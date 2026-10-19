import {createHash} from 'node:crypto';
import StorageService from './storage.service.js';
import {clientAccess,agencyBrand,recipientOptions} from './safetyPlans/access.js';
import {fail,positiveId} from './safetyPlans/template.js';

/** The caller chooses a document, never its authoritative text or field schema. */
export async function enrollmentDocumentContext(user,clientId,input={}) {
 const client=await clientAccess(user,positiveId(clientId));
 if(input.agencyId&&Number(input.agencyId)!==Number(client.agency_id))fail(403,'Choose a client in this organization.');
 const channel=input.channel||'office',audience=input.audience||'guardian',service=input.service||'counseling',locale=input.locale||'en';
 if(!['school','office'].includes(channel)||!['self','guardian'].includes(audience)||!['counseling','tutoring'].includes(service)||!['en','es'].includes(locale))fail(400,'Choose an enrollment setting, audience, service, and language.');
 const organizationId=channel==='school'?(client.school_organization_id||client.organization_id||null):null;
 if(input.organizationId&&Number(input.organizationId)!==Number(organizationId))fail(403,'Use the school linked to this client.');
 return {client,options:{agencyId:client.agency_id,channel,audience,service,locale,organizationId}};
}
async function documents(options) {
 const {getEnrollmentPacketDocuments}=await import('./enrollmentPacket.service.js');
 const result=await getEnrollmentPacketDocuments(options);
 return Array.isArray(result)?result:result.documents||[];
}
export async function enrollmentPortalCatalog(user,clientId,input={}) {
 const {client,options}=await enrollmentDocumentContext(user,clientId,input);
 const list=await documents(options);
 return {context:options,client:{id:client.id,name:client.full_name||client.initials||''},branding:await agencyBrand(client.agency_id),recipients:await recipientOptions(user,{client_id:client.id,agency_id:client.agency_id,document_key:'enrollment-document'}),documents:list.map(d=>({key:d.key,title:d.title,version:d.version,hash:d.hash,hasFields:!!d.sections?.some(s=>s.fields?.length)}))};
}
export async function resolveEnrollmentFoundation(user,{clientId,agencyId,foundationKey,...context}={}) {
 if(!clientId)fail(400,'Start enrollment documents in the client’s medical file.');
 const {options}=await enrollmentDocumentContext(user,clientId,{agencyId,...context});
 if(typeof foundationKey!=='string'||!foundationKey.trim())fail(400,'Choose an enrollment document.');
 const available=await documents(options);
 const document=available.find(d=>d.key===foundationKey);
 if(!document)fail(404,'This document is not included in the selected enrollment packet.');
 // The combined receipt is never detached from the notices it acknowledges.
 const sources=document.key==='packet-acknowledgment'?available:[document];
 const sourcePdfs=[];let totalBytes=0;
 for(const source of sources.filter(d=>d.attachmentPath)){
  const path=String(source.attachmentPath);
  const bytes=path.includes('/templates/')||!path.includes('/')?await StorageService.readTemplate(path.split('/').pop()):await StorageService.readObject(path.replace(/^\/uploads\//,''));
  if(!Buffer.isBuffer(bytes)||bytes.subarray(0,5).toString()!=='%PDF-')fail(400,'This enrollment attachment must be a PDF before it can be shared for signing.');
  totalBytes+=bytes.length;
  if(totalBytes>6*1024*1024)fail(413,'The source PDFs exceed 6 MB. An administrator can upload smaller PDFs before sharing this document to the portal.');
  sourcePdfs.push({title:source.title,base64:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex'),mimeType:'application/pdf'});
 }
 const seen=new Set();const sections=sources.filter(d=>d.key!=='school-roi'||sources.length===1).flatMap(d=>d.sections||[]).map(section=>({...section,fields:(section.fields||[]).filter(([key])=>{if(seen.has(key))return false;seen.add(key);return true;})})).filter(section=>section.fields.length);
 const sourceHtml=sources.filter(d=>!d.attachmentPath).map(d=>d.sections?.length?String(d.html||'').replace(/<section class="enrollment-section">[\s\S]*?<\/section>/g,''):d.html||'').join('\n');
 return {key:'enrollment-document',version:document.version||1,title:document.title,description:'Review and retain this enrollment document. Your completed answers and signature are saved for the care team to review.',sourceHtml,sourcePdf:sourcePdfs.length===1?sourcePdfs[0]:null,sourcePdfs:sourcePdfs.length>1?sourcePdfs:[],source:{kind:'enrollment-foundation',foundationKey:document.key,version:document.version,hash:document.hash,context:options,documents:sources.map(d=>({key:d.key,title:d.title,version:d.version,hash:d.hash}))},sections,portalCompletion:true};
}
