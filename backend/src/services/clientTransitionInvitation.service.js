import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Agency from '../models/Agency.model.js';
import { prepareMigrationCohort, inviteMigrationFamily } from './portalMigration.service.js';
import { buildPortalMigrationEmail } from './portalMigrationContent.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { getReadiness } from './familyLedger/readiness.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import { computeRenewalFlagsForClients } from './clientRenewalFlags.service.js';
import { resolveClientPortalContext, clientPortalAppUrl } from './clientPortalContext.service.js';
import { familyEnrollmentContext,portalUrlWithLocale } from './familyPortalLocale.service.js';
import { createPaymentTask } from './familyLedger/tasks.js';
import { clientUpdatesEnabled, createClientUpdate, assignClientUpdateToPortal,assignSmartDisclosureToPortal } from './clientUpdate.service.js';
import { billingError } from './familyBillingPolicy.service.js';
import {getClientDisclosureStatus,buildSmartDisclosureContext} from './smartDisclosure.service.js';
import {hasPortalMigrationEnrollment} from './portalMigrationEnrollment.service.js';

const cohortLabel=clientId=>`Client transition ${Number(clientId)}`;
const kindForName=name=>/disclosure|divulgaci[oó]n/i.test(name)?'disclosure':/school.*(roi|release)|roi.*school|autorizaci[oó]n.*escuel/i.test(name)?'school_roi':null;
export const transitionLanguage=value=>/^(es|spanish|espa[nñ]ol)/i.test(String(value||'').trim())?'es':'en';

export async function previewClientTransitionInvitation({actor,agencyId,clientId}) {
  const preview=await prepareMigrationCohort({actor,agencyId,clientIds:[clientId],cohortLabel:cohortLabel(clientId)});
  const client=await Client.findById(clientId);
  if(!client||Number(client.agency_id)!==Number(agencyId))throw billingError(403,'Select a client in this agency.');
  const insurance=await readClientInsurance(clientId,agencyId),readiness=await getReadiness(agencyId,clientId);
  const medicaid=hasMedicaidCoverage(insurance)||hasMedicaidCoverage({primary:{insurerName:client.primary_insurer_name}});
  const coverageKnown=medicaid||!!insurance?.primary?.memberId||!!insurance?.secondary?.memberId||readiness.coverage_mode==='self_pay';
  const flags=(await computeRenewalFlagsForClients([client])).get(Number(clientId));
  const [templates]=await pool.execute("SELECT id,name,language_code,document_type FROM document_templates WHERE is_active=1 AND (agency_id=? OR agency_id IS NULL) AND document_type IN ('authorization','disclosure','consent','school','compliance') ORDER BY agency_id IS NULL,version DESC,id DESC",[agencyId]);
  const links=await ClientGuardian.listForClient(clientId);
  const recipients=[];
  let disclosureStatus;
  const disclosureContexts=new Map();
  async function currentDisclosure(language){
    if(!disclosureContexts.has(language)){
      const agency=await Agency.findById(agencyId),organization=client.organization_id?await Agency.findById(client.organization_id):null;
      disclosureContexts.set(language,await buildSmartDisclosureContext({boundClient:client,agency,organization,locale:language,link:{form_type:'smart_disclosure',language_code:language}}));
    }
    return disclosureContexts.get(language);
  }
  for(const recipient of preview.recipients){
    const link=links.find(link=>Number(link.guardian_user_id)===Number(recipient.guardianUserId));
    const context=await familyEnrollmentContext(recipient.guardianUserId,agencyId);
    const permissions=ClientGuardian.parsePermissions(link?.permissions_json)||{};
    let packet={};try{packet=typeof client.onboarding_docs_json==='string'?JSON.parse(client.onboarding_docs_json):client.onboarding_docs_json||{};}catch{}
    const language=transitionLanguage(permissions.portalLanguage||(context.locale==='es'?'es':null)||packet.paperProcessing?.consentReview?.locale||client.preferred_language||context.locale);
    const billingOnly=permissions.billingOnly===true;
    const clinicalClient=['school','clinical','mental_health','healthcare'].includes(String(client.client_type||'').toLowerCase());
    if(!billingOnly&&clinicalClient&&disclosureStatus===undefined)disclosureStatus=await getClientDisclosureStatus(clientId);
    const acknowledgement=disclosureStatus?.lastAcknowledgement;
    let changedSignedDisclosure=false;
    if(!billingOnly&&clinicalClient&&/^[a-f0-9]{40}$/.test(String(acknowledgement?.contentHash||''))&&['en','es'].includes(acknowledgement?.languageCode)){
      const liveAcknowledgement=await currentDisclosure(acknowledgement.languageCode);
      changedSignedDisclosure=!liveAcknowledgement||liveAcknowledgement.contentHash!==acknowledgement.contentHash;
    }
    const disclosureNeeded=!billingOnly&&(!!flags?.recommended?.smartDisclosure||changedSignedDisclosure||clinicalClient&&(disclosureStatus?.disclosureRequired===true||['missing','re_sign_needed','expired','outdated'].includes(disclosureStatus?.status)));
    const [assigned]=await pool.execute(`SELECT i.id,i.title,i.item_type,i.reference_key,i.status,t.language_code FROM client_update_items i JOIN client_update_requests r ON r.id=i.request_id LEFT JOIN document_templates t ON i.item_type='document' AND t.id=CAST(i.reference_key AS UNSIGNED) WHERE r.agency_id=? AND r.client_id=? AND r.guardian_user_id=? AND r.status IN ('in_progress','sent') AND i.status<>'complete'`,[agencyId,clientId,recipient.guardianUserId]);
    const documents=[];
    for(const [kind,needed,title] of [['school_roi',!!flags?.recommended?.smartRoi,'School release of information']]){
      if(!needed||billingOnly)continue;
      const existing=assigned.find(item=>kindForName(item.title)===kind);
      const template=templates.find(template=>kindForName(template.name)===kind&&transitionLanguage(template.language_code)===language);
      documents.push({kind,title:language==='es'?(kind==='school_roi'?'Autorización para compartir información con la escuela':'Declaración de divulgación actualizada'):title,templateId:existing?null:template?.id||null,assigned:!!existing,available:existing?transitionLanguage(existing.language_code)===language:!!template,language});
    }
    if(disclosureNeeded){
      const current=await currentDisclosure(language),reference=current?.contentHash?`smart_disclosure:${language}:${current.contentHash}`:null;
      const existing=reference?assigned.find(item=>item.reference_key===reference):null;
      documents.push({kind:'disclosure',title:language==='es'?'Declaración de divulgación actualizada':'Updated disclosure statement',assigned:!!existing,requiresReplacement:assigned.some(item=>item.item_type==='document'&&kindForName(item.title)==='disclosure'&&item.reference_key!==reference),available:!!current?.contentHash&&current.locale===language,language,contentHash:current?.contentHash||null,assignmentType:'smart_disclosure',referenceKey:reference});
    }
    for(const item of assigned.filter(item=>!billingOnly&&item.item_type==='document'))if(!documents.some(doc=>doc.title===item.title||kindForName(item.title)===doc.kind))documents.push({kind:'document',title:item.title,assigned:true,available:transitionLanguage(item.language_code)===language,language:transitionLanguage(item.language_code)});
    const [tasks]=await pool.execute("SELECT id,status FROM family_billing_tasks WHERE agency_id=? AND guardian_user_id=? AND (status='completed' OR (status='pending' AND expires_at>UTC_TIMESTAMP())) AND JSON_CONTAINS(client_ids_json,CAST(? AS JSON)) ORDER BY id DESC",[agencyId,recipient.guardianUserId,JSON.stringify(Number(clientId))]);
    const enrollment=await hasPortalMigrationEnrollment({agencyId,clientId,guardianUserId:recipient.guardianUserId});
    const forms=[{kind:'notifications',title:language==='es'?'Preferencias de comunicación':'Communication preferences',assigned:!!enrollment,available:true},...documents];
    if(coverageKnown&&!medicaid)forms.push({kind:'payment_authorization',title:language==='es'?'Autorización de pago y tarjeta':'Payment authorization and card setup',assigned:!!tasks.length,available:true,taskId:tasks[0]?.id||null});
    const portal=await resolveClientPortalContext(client),portalUrl=portalUrlWithLocale(clientPortalAppUrl(portal.portal,'guardian'),language);
    const email=buildPortalMigrationEmail({firstName:recipient.name?.split(' ')[0],agencyName:portal.tenant.name,clients:[client],url:portalUrl,portalUrl,existingAccount:false,username:recipient.email,locale:language,documents:forms});
    recipients.push({...recipient,relationshipType:link?.relationship_type,language,forms,emailPreview:email,billingOnly,needsPreparation:forms.some(form=>!form.assigned||form.requiresReplacement),blockedReason:!coverageKnown?'Confirm coverage or self-pay billing before inviting.':forms.some(form=>!form.available)?'A required form is unavailable in the recipient’s language. Configure that form before inviting.':documents.some(form=>!form.assigned||form.requiresReplacement)&&!clientUpdatesEnabled()?'Document assignments are on hold until the client update workflow is enabled.':null});
  }
  return {...preview,recipients,clientId:Number(clientId),agencyId:Number(agencyId),medicaid,coverageKnown,launchEnabled:preview.launchEnabled,reminderIntervalHours:48};
}

export async function prepareClientTransitionInvitation(input) {
  const preview=await previewClientTransitionInvitation(input),recipient=preview.recipients.find(row=>row.key===input.recipientKey);
  if(!recipient)throw billingError(409,'Refresh the eligible portal recipients.');
  if(recipient.blockedReason)throw billingError(409,recipient.blockedReason);
  const connection=await pool.getConnection();let locked=false;
  try{
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[`transition-forms:${input.agencyId}:${input.clientId}:${recipient.guardianUserId}`]);
    if(!Number(lock?.acquired))throw billingError(409,'This account’s forms are being prepared. Try again shortly.');locked=true;
    const current=(await previewClientTransitionInvitation(input)).recipients.find(row=>row.key===input.recipientKey);
    if(!current||current.blockedReason)throw billingError(409,current?.blockedReason||'This portal account is no longer eligible.');
    const documents=current.forms.filter(form=>form.templateId&&!form.assigned);
    if(documents.length){const request=await createClientUpdate({agencyId:input.agencyId,clientId:input.clientId,body:{documents:documents.map(form=>form.templateId)},actorUserId:input.actor.id});await assignClientUpdateToPortal(request.id,{actorUserId:input.actor.id,guardianUserId:recipient.guardianUserId,consentSetup:true});}
    const disclosure=current.forms.find(form=>form.assignmentType==='smart_disclosure'&&(!form.assigned||form.requiresReplacement));
    if(disclosure)await assignSmartDisclosureToPortal({agencyId:input.agencyId,clientId:input.clientId,guardianUserId:recipient.guardianUserId,locale:disclosure.language,contentHash:disclosure.contentHash,actorUserId:input.actor.id});
    if(current.forms.some(form=>form.kind==='payment_authorization'&&!form.assigned))await createPaymentTask({agencyId:input.agencyId,guardianUserId:recipient.guardianUserId,clientIds:[input.clientId],actorUserId:input.actor.id,requireCard:true});
    await pool.execute('INSERT INTO family_portal_migration_enrollments (agency_id,client_id,guardian_user_id,cohort_label,created_by_user_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE cohort_label=VALUES(cohort_label)',[input.agencyId,input.clientId,recipient.guardianUserId,cohortLabel(input.clientId),input.actor.id]);
    return previewClientTransitionInvitation(input);
  }finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[`transition-forms:${input.agencyId}:${input.clientId}:${recipient.guardianUserId}`]);connection.release();}
}

export async function sendClientTransitionInvitation(input) {
  const preview=await previewClientTransitionInvitation(input),recipient=preview.recipients.find(row=>row.key===input.recipientKey);
  if(!recipient||recipient.blockedReason||recipient.needsPreparation)throw billingError(409,recipient?.blockedReason||'Attach and review this account’s portal forms before sending.');
  return inviteMigrationFamily({...input,clientIds:[input.clientId],cohortLabel:cohortLabel(input.clientId),migrationDocuments:recipient.forms,locale:recipient.language});
}
