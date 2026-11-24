import {createHash} from 'node:crypto';
import directory from '../config/database.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { TreatmentPlanAckLink } from '../models/TreatmentPlanAckLink.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import StorageService from './storage.service.js';
import { assertTreatmentPlanShareApproval } from './treatmentPlanApproval.service.js';
import { guardianPlanRevision, isSharedPlanStatus, sharedPlanGoals } from './guardianPlanProgress.service.js';
import { ensurePlanAccess, signAcknowledgment, markPlanAckStatus } from './treatmentPlanAck.service.js';
import { resolveEnrollmentFoundation } from './enrollmentPortal.service.js';
import { isStandaloneEnrollmentForm,isCurrentFamilyDocument,familyOutcomeMeasure } from './familySharingCatalog.js';
import { portalScreenDefinition } from './familyPortalScreening.service.js';
import { savePlan, addSigner, readPlan, directFormItem, signDirectForm } from './safetyPlans/records.js';
import { validateClinicalReady } from './safetyPlans/clinicalTemplates.js';
import { fail, positiveId, signatureEvidence } from './safetyPlans/template.js';
import { maybeEncryptNotePayload as encrypt,maybeDecryptNotePayload as decrypt } from './clinicalNoteCrypto.service.js';

const editable = new Set(['safety-plan','release-of-information','client-information-update','enrollment-document']);
const templateTypes=new Set(['acknowledgment','authorization','agreement','compliance','disclosure','consent','audio_recording_consent','hipaa_security']);
const fileTypes = /^(?:client_document|client_shared_document|general_document|assigned_document)$/i;
const fileVersion = file => createHash('sha256').update(JSON.stringify([file.id,file.storage_path,file.title,file.document_type])).digest('hex');

export async function sharedFile(item) {
  const file = await ClientPhiDocument.findById(item.source_id);
  if (!file || Number(file.client_id)!==Number(item.client_id)||Number(file.agency_id)!==Number(item.agency_id)
      || file.removed_at || file.scan_status !== 'clean' || file.mime_type !== 'application/pdf' || !fileTypes.test(file.document_type||''))
    fail(404,'This file is unavailable for client sharing.');
  return file;
}

function treatmentDocument(plan) {
  return {title:plan.title||'Treatment plan',effectiveDate:plan.effective_date,problem:plan.presenting_problem,
    frequency:plan.prescribed_frequency,discharge:plan.discharge_plan,diagnosticJustification:plan.diagnostic_justification,
    diagnoses:(plan.planDiagnoses||[]).map(d=>({description:d.description,justification:d.justification})),
    goals:sharedPlanGoals(plan).map(g=>({text:g.goal_text,projectedCompletion:g.projected_completion,
      objectives:(g.objectives||[]).map(o=>({text:o.objective_text,projectedCompletion:o.projected_completion,
        target:o.scale_target,direction:o.scale_direction,measurement:o.measurement_method,interventions:o.interventions||[]}))}))};
}
export async function describeDocument(user,client,selection) {
  const item = {agency_id:client.agency_id,client_id:client.id};
  if (selection.treatmentPlanId) {
    const plan = await ensurePlanAccess({reqUser:user,agencyId:client.agency_id,clientId:client.id,treatmentPlanId:selection.treatmentPlanId});
    if (!isSharedPlanStatus(plan.status)) fail(409,'Finalize the active plan before sharing.');
    await assertTreatmentPlanShareApproval(plan);
    return {...item,source_kind:'treatment_plan',source_id:plan.id,source_version:guardianPlanRevision(plan),
      document_key:'treatment-plan',title:plan.title||'Treatment plan',action:'sign',snapshot:encrypt(JSON.stringify(treatmentDocument(plan)))};
  }
  if (selection.fileId) {
    const file = await sharedFile({...item,source_id:positiveId(selection.fileId)});
    return {...item,source_kind:'file',source_id:file.id,source_version:fileVersion(file),document_key:'client-document',
      title:file.title||'Document',action:selection.action==='view'?'view':'sign'};
  }
  let prefill=null;
  let form = null, template, recordId = null;
  if (selection.recordId) {
    recordId = positiveId(selection.recordId);
    form = await readPlan(user,recordId);
    if (Number(form.clientId)!==Number(client.id)||Number(form.agencyId)!==Number(client.agency_id)) fail(404,'Choose a document from this chart.');
    if (Number(selection.version)!==Number(form.currentVersion)||form.revocation) fail(409,'Refresh this document before sharing.');
    template = form.template;
  } else if (selection.release === true) {
    template = {key:'release-of-information',title:'Release of information'};
    if (selection.contactId) {
      const contact=await ClientContactAffiliation.findById(positiveId(selection.contactId));
      if (!contact||Number(contact.client_id)!==Number(client.id)||Number(contact.agency_id)!==Number(client.agency_id)
          ||!Number(contact.is_active)||!Number(contact.contact_is_active)) fail(404,'Choose an active contact on this chart.');
      prefill={recipientName:contact.contact_full_name,recipientEmail:contact.contact_email,recipientPhone:contact.contact_phone};
    }
  } else if (selection.templateId) {
    const row=await DocumentTemplate.findById(positiveId(selection.templateId));
    if (!row||!Number(row.is_active)||(row.agency_id&&Number(row.agency_id)!==Number(client.agency_id))||Number(row.is_archived)||(row.organization_id&&Number(row.organization_id)!==Number(client.agency_id))||!templateTypes.has(row.document_type)||!isCurrentFamilyDocument(row))
      fail(404,'This template is unavailable for client sharing.');
    let sourcePdf=null;
    if (row.file_path) {
      const bytes=await StorageService.readTemplate(row.file_path.split('/').pop());
      if(!Buffer.isBuffer(bytes)||bytes.length>6*1024*1024||String(bytes.subarray(0,5))!=='%PDF-')fail(400,'Choose a valid document PDF up to 6 MB.');
      sourcePdf={title:row.name,base64:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex')};
    }
    if (!sourcePdf&&!row.html_content) fail(400,'This template has no document content.');
    template={key:'enrollment-document',title:row.name,version:row.version,sourceHtml:row.html_content,
      sourcePdf,sections:[],source:{kind:'agency-document-template',templateId:row.id,version:row.version}};
  } else if (selection.assessmentKey) {
    const measure=familyOutcomeMeasure(selection.assessmentKey);
    if (!measure||measure.respondent==='observer') fail(400,'This assessment uses its dedicated workflow.');
    if (measure.referenceQuestionnaire) fail(400,'This assessment requires its official instrument workflow.');
    template={key:'enrollment-document',title:measure.title,version:measure.version,sections:[],
      outcomeMeasure:measure,source:{kind:'client-outcome-measure',measureId:measure.id}};
  } else if (selection.foundationKey && isStandaloneEnrollmentForm(selection.foundationKey)) {
    template = await resolveEnrollmentFoundation(user,{...selection.context,agencyId:client.agency_id,clientId:client.id,foundationKey:selection.foundationKey});
  } else {
    fail(400,'Choose a client-facing document or form.');
  }
  if (template.key==='cssrs-screener'||(template.source?.foundationKey&&!isStandaloneEnrollmentForm(template.source.foundationKey)))
    fail(400,'This form uses its dedicated workflow.');
  const screen = portalScreenDefinition(template.source?.foundationKey);
  const action = template.key==='attendance-verification' ? 'view' :
    template.source?.kind==='agency-document-template' ? 'sign' :
    template.outcomeMeasure ? 'complete' :
    (screen||template.key==='client-information-update'||(!form && editable.has(template.key))||
      (selection.action==='complete'&&editable.has(template.key))) ? 'complete' : 'sign';
  if (form&&action==='sign') validateClinicalReady(form.data,template);
  if (form&&action==='view'&&!form.signers.some(signer=>signer.kind==='clinician'&&signer.signedAt&&!signer.revokedAt))
    fail(400,'Sign the attendance letter before sharing a copy.');
  const outcome=template.outcomeMeasure;
  return {...item,form,source_kind:'form',source_id:recordId,source_version:form?.currentVersion||null,
    document_key:template.key,title:form?.data.documentName||template.title,action,respondent:screen?.recipient||(outcome?(outcome.respondent==='caregiver'?'guardian':'client'):null),outcome:Boolean(outcome),
    template:template.source||prefill?template:null,prefill,selection,clientName:client.full_name||client.initials||''};
}

export async function prepareFormItem(db,actor,item,recipient,copyForRecipient) {
  let recordId = item.source_id;
  let version = item.source_version;
  if (!recordId || copyForRecipient || (item.action==='complete' && item.form?.signers.length)) {
    const planDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
    const fileForNewResponse=item.action==='complete'&&item.form?.signers.some(signer=>signer.signedAt);
    const data = (!fileForNewResponse&&item.form?.data)||{personLabel:item.clientName,planDate,...item.prefill};
    const saved = await savePlan(actor,{clientId:item.client_id,agencyId:item.agency_id,documentKey:item.document_key,
      foundationKey:item.selection.foundationKey||item.form?.template.source?.foundationKey,
      enrollmentContext:item.selection.context,data},null,{database:db,returnReference:true,preparedTemplate:item.form?.template||item.template});
    recordId = saved.id;
    version = saved.version;
  }
  const {signerId} = await addSigner(actor,recordId,{version,kind:recipient.kind,userId:recipient.userId,name:recipient.name,
    authorityConfirmed:true,allowCompletion:item.action==='complete',copyOnly:item.action==='view'},
  {notify:false,database:db,returnReference:true,managed:true,portalVisible:Boolean(recipient.portal)});
  return {recordId,version,signerId};
}

async function treatmentPlan(item) {
  const plan = await ClinicalTreatmentPlan.findById(item.source_id);
  if (!plan || Number(plan.agency_id)!==Number(item.agency_id) || Number(plan.client_id)!==Number(item.client_id)
      || !isSharedPlanStatus(plan.status) || guardianPlanRevision(plan)!==item.source_version)
    fail(409,'This treatment plan changed. Ask your care team for the current version.');
  await assertTreatmentPlanShareApproval(plan);
  return plan;
}

async function treatmentLink(item,recipient,request) {
  const db = await directory.getConnection();
  const lock = 'guardian-plan-share:'+item.source_id;
  let locked = false;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired',[lock]);
    if (!(locked=Number(result?.acquired)===1)) fail(409,'This plan is being updated. Please try again.');
    const plan = await treatmentPlan(item);
    const links = await TreatmentPlanAckLink.listForPlan({agencyId:item.agency_id,clientId:item.client_id,treatmentPlanId:item.source_id});
    const prior = links.find(link => Number(link.meta_json?.clinicalRequestItemId)===Number(item.id));
    if (prior) return {link:prior,plan};
    const dashboard=recipient.userId&&links.find(candidate=>candidate.dashboard_visible&&
      Number(candidate.recipient_user_id)===Number(recipient.userId)&&candidate.meta_json?.planRevision===item.source_version&&
      !['cancelled','expired'].includes(candidate.status));
    if(dashboard&&!dashboard.meta_json.clinicalRequestItemId){
      const link=await TreatmentPlanAckLink.updateFields(dashboard.id,{meta:{...dashboard.meta_json,clinicalRequestItemId:Number(item.id)}});
      return {link,plan};
    }
    if(dashboard)fail(409,'This plan revision already has a sharing request for this recipient. Use Sharing activity to resend it.');
    const link = await TreatmentPlanAckLink.create({agencyId:item.agency_id,clientId:item.client_id,treatmentPlanId:item.source_id,
      channel:recipient.portal?'dashboard_share':'email_link',issuedByUserId:request.issued_by_user_id,
      recipientKind:recipient.kind,recipientUserId:recipient.userId,recipientName:recipient.name,dashboardVisible:Boolean(recipient.portal),
      meta:{planRevision:item.source_version,portalOnly:true,clinicalRequestItemId:Number(item.id)}});
    if (plan.client_ack_status!=='signed') await markPlanAckStatus({planId:plan.id,status:'shared',at:false});
    return {link,plan};
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)',[lock]); } finally { db.release(); }
  }
}

export async function publishDocumentSource(item,recipient,request) {
  if (item.source_kind==='treatment_plan') await treatmentLink(item,recipient,request);
}

export async function readDocumentSource(db,item,recipient,request) {
  if (item.source_kind==='form') {
    const {plan,signer} = await directFormItem(db,item);
    return {type:'form',plan,completed:Boolean(signer.signed_at)};
  }
  if (item.source_kind==='treatment_plan') {
    const links=await TreatmentPlanAckLink.listForPlan({agencyId:item.agency_id,clientId:item.client_id,treatmentPlanId:item.source_id});
    const link=links.find(candidate=>Number(candidate.meta_json?.clinicalRequestItemId)===Number(item.id));
    if(!link||link.status==='cancelled')fail(410,'This request is no longer available.');
    if(link.status!=='signed')await treatmentPlan(item);
    return {type:'treatment_plan',completed:link.status==='signed',version:item.source_version,
      document:JSON.parse(decrypt(item.snapshot_encrypted))};
  }
  const file = await sharedFile(item);
  if (fileVersion(file)!==item.source_version) fail(409,'This document changed.');
  return {type:'file',completed:Boolean(item.completed_version),version:item.source_version,document:{title:file.title||'Document'}};
}

export async function submitDocumentSource(db,item,recipient,request,input) {
  if (item.source_kind==='form') return signDirectForm(db,item,input);
  if (item.action==='view'||input.version!==item.source_version) fail(409,'Review the current document before signing.');
  const evidence = signatureEvidence(input,item.source_kind==='treatment_plan'?'Treatment plan':'Document');
  if (item.source_kind==='treatment_plan') {
    const {link} = await treatmentLink(item,recipient,request);
    await signAcknowledgment({linkId:link.id,signedByName:evidence.name,signatureDataUrl:input.signature,verifiedRequestItemId:item.id,privateSignatureEvidence:{...evidence,version:item.source_version}});
    return {signed:true};
  }
  const file = await sharedFile(item);
  if (fileVersion(file)!==item.source_version) fail(409,'This document changed.');
  await db.execute('UPDATE clinical_document_request_items SET completed_version=1, evidence_encrypted=?, completed_at=UTC_TIMESTAMP() WHERE id=? AND completed_version IS NULL',
    [encrypt(JSON.stringify(evidence)),item.id]);
  return {signed:true};
}

export async function revokeDocumentSource(item) {
  if (item.source_kind!=='treatment_plan') return;
  const links = await TreatmentPlanAckLink.listForPlan({agencyId:item.agency_id,clientId:item.client_id,treatmentPlanId:item.source_id});
  const link = links.find(candidate=>Number(candidate.meta_json?.clinicalRequestItemId)===Number(item.id));
  if (link&&link.status!=='signed') await TreatmentPlanAckLink.updateFields(link.id,{status:'cancelled',dashboardVisible:false});
}
