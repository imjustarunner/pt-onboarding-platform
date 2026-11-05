import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {notificationTransportReceipt} from '../utils/notificationTransportReceipt.js';
import {relaySelected} from './workspaceRelayConfig.js';

export const PEOPLE_OPERATIONS_SUBMISSION_TEMPLATE='people_operations_submission';
const json=value=>{try{return typeof value==='string'?JSON.parse(value):value || {};}catch{return {};}};
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const address=value=>String(value || '').trim().toLowerCase();
export function singlePeopleOperationsMailbox(value) {
 if(typeof value!=='string'||/[\r\n]/.test(value))return false;
 const email=value.trim();
 return email.length<=254&&email.split('@')[0].length<=64
  &&/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(email);
}
const reviewerAddress=user=>user?.work_email || user?.email || '';
const reviewerEligible=user=>singlePeopleOperationsMailbox(reviewerAddress(user));
const stamp=value=>value instanceof Date?value.toISOString():String(value || '').replace(' ','T').replace(/(?<!Z)$/,'Z');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=403)=>Object.assign(new Error(message),{status,code:'PEOPLE_OPERATIONS_SUBMISSION_REVIEW_REQUIRED'});
const senderChecks=new Map();
const active=`u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`;

export async function peopleOperationsNotificationRecipients(agencyId,db=pool) {
 const [rows]=await db.execute(`SELECT DISTINCT u.id,u.email,u.work_email,u.first_name,u.last_name,
  COALESCE(p.enabled,0) AS enabled FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
  LEFT JOIN people_operations_notification_recipients p ON p.user_id=u.id AND p.agency_id=ua.agency_id
  WHERE ua.agency_id=? AND ${active}
   AND u.role IN ('admin','super_admin','support','staff','provider','provider_plus','clinical_practice_assistant','schedule_manager','supervisor','intern','intern_plus')
   AND (u.role IN ('admin','super_admin') OR COALESCE(u.has_hiring_access,0)=1)
  ORDER BY u.last_name,u.first_name,u.id`,[agencyId]);
 return rows;
}

async function settings(agencyId,db) {
 const [rows]=await db.execute('SELECT id,name,slug,custom_domain,feature_flags,is_active,is_archived FROM agencies WHERE id=?',[agencyId]);
 const agency=Array.isArray(rows)?rows[0]:null;
 const flags=json(agency?.feature_flags),review=flags.peopleOperationsSubmissionReview;
 return {agency,enabled:agency?.is_active===1&&!Number(agency.is_archived)&&flags.peopleOperationsSubmissionNotificationsEnabled===true
  && positive(review?.reviewedByUserId)&&positive(review?.senderIdentityId)&&Number.isFinite(Date.parse(review?.reviewedAt)),review};
}

export async function peopleOperationsSenders(agencyId,db=pool) {
 const [rows]=await db.execute("SELECT id,agency_id,identity_key,from_email,reply_to,is_active FROM email_sender_identities WHERE agency_id=? AND is_active=1 AND identity_key IN ('people_operations','people_ops','people_operations_notifications','messages') ORDER BY identity_key,id",[agencyId]);
 const options=[];
 for(const identity of Array.isArray(rows)?rows:[]){let ready=false,reason='The selected mailbox connection needs administrator review.';
  const transport=relaySelected(identity.from_email)?'workspace_smtp_relay':'gmail_send_as',cacheKey=`${agencyId}:${address(identity.from_email)}:${transport}`;
  if((senderChecks.get(cacheKey)||0)>Date.now())ready=true;
  else try{
   if(transport==='workspace_smtp_relay'){const {verifyWorkspaceRelaySender}=await import('./workspaceRelaySender.js');await verifyWorkspaceRelaySender(identity.from_email,{db});}
   else {
    // Read only the existing accepted Send As identity. No alias registration,
    // transport pin changes or fallback to a different address occurs here.
    const {google}=await import('../utils/googleApis.js'),{buildImpersonatedJwtClient,GOOGLE_WORKSPACE_SCOPES}=await import('./googleWorkspaceAuth.service.js');
    const {resolveAppEmailTransport}=await import('./unifiedEmail/transportMailbox.js');
    const auth=await buildImpersonatedJwtClient({subjectEmail:resolveAppEmailTransport(),scopes:GOOGLE_WORKSPACE_SCOPES});
    const alias=(await google.gmail({version:'v1',auth}).users.settings.sendAs.get({userId:'me',sendAsEmail:identity.from_email})).data;
    if(address(alias?.sendAsEmail)!==address(identity.from_email)||alias.verificationStatus!=='accepted')throw fail('Mailbox verification is incomplete.');
   }
   ready=true;senderChecks.set(cacheKey,Date.now()+300000);
  }catch{ /* Display a setup state; delivery still verifies the sender again. */ }
  if(ready)reason=null;
  options.push({id:Number(identity.id),email:identity.from_email,replyTo:identity.reply_to || identity.from_email,label:identity.identity_key==='messages'?'Agency messages':'People Operations',transport,ready,reason});
 }
 return options;
}

export async function peopleOperationsNotificationSettings(agencyId,db=pool) {
 const [state,recipients,senders]=await Promise.all([settings(agencyId,db),peopleOperationsNotificationRecipients(agencyId,db),peopleOperationsSenders(agencyId,db)]);
 return {enabled:state.enabled,reviewedAt:state.review?.reviewedAt || null,
  senderIdentityId:state.review?.senderIdentityId || null,senders,senderReady:senders.some(sender=>sender.id===Number(state.review?.senderIdentityId)&&sender.ready),
  recipients:recipients.map(user=>({id:Number(user.id),name:[user.first_name,user.last_name].filter(Boolean).join(' '),email:reviewerAddress(user),emailEligible:reviewerEligible(user),emailIssue:reviewerEligible(user)?null:'Save one valid work email address before selecting this reviewer.',enabled:Number(user.enabled)===1}))};
}

export async function savePeopleOperationsNotificationSettings({agencyId,actorUserId,enabled,recipientIds,senderIdentityId},database=pool,overrides={}) {
 if(typeof enabled!=='boolean'||!Array.isArray(recipientIds)||recipientIds.some(id=>!positive(id)))throw fail('Choose reviewers and whether submission notices are enabled.',400);
 const db=await database.getConnection();
 try {
  await db.beginTransaction();
  const [[actor]]=await db.execute(`SELECT u.id,u.role FROM users u WHERE u.id=? AND ${active}
   AND u.role IN ('admin','super_admin','support') AND (u.role='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua
    WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1)) FOR UPDATE`,[actorUserId,agencyId]);
  if(!actor)throw fail('An active agency administrator must review notification recipients.');
  const [[agency]]=await db.execute('SELECT id FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0 FOR UPDATE',[agencyId]);
  if(!agency)throw fail('Select an active agency.');
  const available=await peopleOperationsNotificationRecipients(agencyId,db),selected=new Set(recipientIds.map(Number));
  if([...selected].some(id=>!available.some(user=>Number(user.id)===id)))throw fail('A selected reviewer no longer has active hiring access. Refresh the list.',409);
  if(enabled&&(!selected.size||[...selected].some(id=>!reviewerEligible(available.find(row=>Number(row.id)===id)))))throw fail('Every selected reviewer needs one valid saved work email address before enabling notices.',400);
  const sender=(await (overrides.senders || peopleOperationsSenders)(agencyId,db)).find(row=>row.id===Number(senderIdentityId));
  if(enabled&&!sender?.ready)throw fail('Choose a ready agency sender before enabling submission notices.',409);
  for(const user of available)await db.execute(`INSERT INTO people_operations_notification_recipients(agency_id,user_id,enabled) VALUES(?,?,?)
   ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)`,[agencyId,user.id,selected.has(Number(user.id))?1:0]);
  const review={reviewedByUserId:Number(actorUserId),reviewedAt:new Date().toISOString(),senderIdentityId:sender?.id || null};
  await db.execute(`UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),
   '$.peopleOperationsSubmissionNotificationsEnabled',CAST(? AS JSON),'$.peopleOperationsSubmissionReview',CAST(? AS JSON)) WHERE id=?`,[JSON.stringify(enabled),JSON.stringify(review),agencyId]);
  await db.commit();return peopleOperationsNotificationSettings(agencyId,database);
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

/** References are supplied only by saved hiring workflows; event text and email
 * destinations are always reloaded from authoritative tenant records. */
export async function peopleOperationsSubmissionSource({agencyId,userId,kind,id},db=pool) {
 if(![agencyId,userId,id].every(positive))return null;
 const [[candidate]]=await db.execute(`SELECT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
  WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
   AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','TERMINATED_PENDING')`,[agencyId,userId]);
 if(!candidate)return null;
 let source,authority;
 if(['prehire_complete','onboarding_complete'].includes(kind)&&Number(id)===Number(userId)) {
  const column=kind==='prehire_complete'?'prehire_completed_at':'onboarding_completed_at';
  const [[row]]=await db.execute(`SELECT ${column} AS submitted_at FROM hire_journeys WHERE user_id=? AND agency_id=?`,[userId,agencyId]);source=row;authority={type:'agency_hiring_journey',agencyId:Number(agencyId)};
 }else if(kind==='task') {
  const [[row]]=await db.execute(`SELECT t.title,t.completed_at AS submitted_at,t.reference_id,t.assigned_to_agency_id,t.metadata,
   t.task_list_id,list.id AS source_task_list_id,list.agency_id AS task_list_agency_id,template.agency_id AS template_agency_id
   FROM tasks t JOIN document_templates template ON template.id=t.reference_id LEFT JOIN task_lists list ON list.id=t.task_list_id
   WHERE t.id=? AND t.assigned_to_user_id=? AND t.task_type='document' AND t.status='completed'`,[id,userId]);
  if(!row)return null;
  const metadata=json(row.metadata),scopes=[row.assigned_to_agency_id,row.template_agency_id,row.task_list_agency_id,metadata.agencyId];
  if(row.task_list_id&&!row.source_task_list_id)return null;
  if(scopes.some(scope=>scope!=null&&(!positive(scope)||Number(scope)!==Number(agencyId)))||!scopes.some(positive))return null;
  source=row;authority={type:row.template_agency_id==null?'agency_assigned_global_document':'agency_document_task',agencyId:Number(agencyId),
   templateId:Number(row.reference_id),assignedAgencyId:row.assigned_to_agency_id==null?null:Number(row.assigned_to_agency_id),
   templateAgencyId:row.template_agency_id==null?null:Number(row.template_agency_id),taskListId:row.task_list_id==null?null:Number(row.task_list_id),
   taskListAgencyId:row.task_list_agency_id==null?null:Number(row.task_list_agency_id),metadataAgencyId:metadata.agencyId==null?null:Number(metadata.agencyId)};
 }else if(kind==='background_authorization') {
  const [[row]]=await db.execute('SELECT signed_at AS submitted_at FROM hiring_background_check_authorizations WHERE user_id=? AND agency_id=?',[userId,agencyId]);
  if(Number(id)===Number(userId)&&row){source={...row,title:'Background check authorization'};authority={type:'agency_background_authorization',agencyId:Number(agencyId)};}
 }else if(kind==='receipt') {
  const [[row]]=await db.execute(`SELECT d.title,d.created_at AS submitted_at,c.id AS source_checklist_id
   FROM user_admin_docs d JOIN hiring_prehire_checklist_items c ON c.submission_admin_doc_id=d.id AND c.user_id=d.user_id
    AND c.agency_id=? AND c.completed_on IS NOT NULL
   WHERE d.id=? AND d.user_id=? AND d.created_by_user_id=? AND COALESCE(d.is_deleted,0)=0
    AND d.doc_type IN ('background_check_authorization','job_description_acknowledgement','prehire_company_document_ack','prehire_document_receipt','prehire_upload')`,[agencyId,id,userId,userId]);
  source=row;authority=row?{type:'agency_checklist_receipt',agencyId:Number(agencyId),checklistId:Number(row.source_checklist_id)}:null;
 }
 if(!source?.submitted_at||!Number.isFinite(Date.parse(stamp(source.submitted_at))))return null;
 const reference={kind,id:Number(id),submittedAt:stamp(source.submitted_at),authority};
 return {...reference,version:digest(reference),candidate,title:source.title || null,eventType:['prehire_complete','onboarding_complete'].includes(kind)?kind:'document_submitted'};
}

export async function queuePeopleOperationsSubmission({agencyId,userId,kind,id},db=pool) {
 const config=await settings(agencyId,db);if(!config.enabled)return;
 const source=await peopleOperationsSubmissionSource({agencyId,userId,kind,id},db);
 if(!source||Date.parse(source.submittedAt)<=Date.parse(config.review.reviewedAt))return;
 const sourceJson=JSON.stringify({kind:source.kind,id:source.id,version:source.version,submittedAt:source.submittedAt,authority:source.authority});
 for(const reviewer of await peopleOperationsNotificationRecipients(agencyId,db))if(Number(reviewer.enabled)===1&&reviewerEligible(reviewer))await db.execute(`INSERT IGNORE INTO people_operations_submission_notifications
  (agency_id,candidate_user_id,recipient_user_id,event_key,event_type,document_title,source_json) VALUES(?,?,?,?,?,?,?)`,
 [agencyId,userId,reviewer.id,`${kind}:${id}:${source.version}`,source.eventType,source.title?.slice(0,255)||null,sourceJson]);
}

const defaults={database:pool,source:peopleOperationsSubmissionSource,recipients:peopleOperationsNotificationRecipients,settings,
 communication:async input=>(await import('../models/UserCommunication.model.js')).default.create(input),
 updateCommunication:async(...args)=>(await import('../models/UserCommunication.model.js')).default.updateDeliveryStatus(...args),
 notify:async input=>(await import('../models/Notification.model.js')).default.create(input),
 identity:async agencyId=>{const config=await settings(agencyId,pool),sender=(await peopleOperationsSenders(agencyId,pool)).find(row=>row.id===Number(config.review?.senderIdentityId)&&row.ready);return sender?{id:sender.id,agency_id:Number(agencyId),from_email:sender.email,reply_to:sender.replyTo}:null;},
 send:async input=>(await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(input)};

async function currentEvent(event,d) {
 const config=await d.settings(event.agency_id,d.database),reference=json(event.source_json);
 if(!config.enabled||!reference.kind)return null;
 const source=await d.source({agencyId:event.agency_id,userId:event.candidate_user_id,kind:reference.kind,id:reference.id},d.database);
 const recipient=(await d.recipients(event.agency_id,d.database)).find(user=>Number(user.id)===Number(event.recipient_user_id)&&Number(user.enabled)===1);
 if(!source||source.version!==reference.version||Date.parse(source.submittedAt)<=Date.parse(config.review.reviewedAt)||!recipient||!reviewerEligible(recipient))return null;
 return {source,recipient,agency:config.agency,senderIdentityId:Number(config.review.senderIdentityId)};
}

export async function assertPeopleOperationsSubmissionRecipient(input,overrides={}) {
 if(String(input.templateType || '').replace(/^trigger:/,'')!==PEOPLE_OPERATIONS_SUBMISSION_TEMPLATE)return null;
 if(!positive(input.existingCommunicationId))throw fail('A saved submission notice is required.');
 const d={...defaults,...overrides};
 const [[record]]=await d.database.execute('SELECT * FROM user_communications WHERE id=?',[input.existingCommunicationId]);
 const [[event]]=await d.database.execute('SELECT * FROM people_operations_submission_notifications WHERE id=?',[json(record?.metadata).peopleOperationsSubmissionId || 0]);
 const current=event?await currentEvent(event,d):null;
 const [[selectedSender]]=current?await d.database.execute("SELECT id FROM email_sender_identities WHERE id=? AND agency_id=? AND is_active=1 AND identity_key IN ('people_operations','people_ops','people_operations_notifications','messages')",[current.senderIdentityId,event.agency_id]):[[]];
 if(!record||!event||!current||!selectedSender||Number(event.communication_id)!==Number(input.existingCommunicationId)
  ||Number(event.agency_id)!==Number(input.agencyId)||Number(record.agency_id)!==Number(input.agencyId)
  ||record.template_type!==PEOPLE_OPERATIONS_SUBMISSION_TEMPLATE||record.channel!=='email'||record.client_id
  ||Number(record.user_id)!==Number(event.recipient_user_id)||Number(record.generated_by_user_id)!==Number(event.candidate_user_id)
  ||!singlePeopleOperationsMailbox(input.to)||!singlePeopleOperationsMailbox(record.recipient_address)
  ||Number(input.senderIdentityId)!==current.senderIdentityId
  ||address(record.recipient_address)!==address(input.to)||address(input.to)!==address(current.recipient.work_email || current.recipient.email)
  ||input.cc?.length||input.bcc?.length||json(record.metadata).cc?.length||json(record.metadata).bcc?.length)throw fail('The submission, reviewer, agency or address changed. Review this notice before sending.');
 return current;
}

export function buildPeopleOperationsSubmissionEmail({agency,source,userId}) {
 const name=[source.candidate.first_name,source.candidate.last_name].filter(Boolean).join(' ')||'A candidate';
 const detail=source.eventType==='prehire_complete'?'submitted pre-hire materials':source.eventType==='onboarding_complete'?'submitted onboarding':'submitted a hiring document';
 const message=`${name} ${detail} for review. Open the hiring workspace to review the saved submission and next steps.`;
 const url=buildPublicAppUrl(agency,`admin/hiring/people/${userId}/packages`);
 return {subject:`People Operations submission — ${name}`,text:`${message}\n\nReview submitted documents: ${url}\n\nPeople Operations · ${agency.name}`};
}

/** Only future opted-in tenant events are claimed. Sending/failed/held rows are
 * retained for staff review; no automatic retry or historical queue replay. */
export function createPeopleOperationsSubmissionWorker(overrides={}) {
 const d={...defaults,...overrides};
 return async()=>{
  const [events]=await d.database.execute("SELECT * FROM people_operations_submission_notifications WHERE email_status='pending' AND source_json IS NOT NULL ORDER BY id LIMIT 100");
  for(const event of events) {
   const current=await currentEvent(event,d);
   const [claim]=await d.database.execute("UPDATE people_operations_submission_notifications SET email_status=? WHERE id=? AND email_status='pending'",[current?'sending':'skipped',event.id]);
   if(!current||!claim.affectedRows)continue;
   let status='held',record;
   try {
    const content=buildPeopleOperationsSubmissionEmail({agency:current.agency,source:current.source,userId:event.candidate_user_id});
    const to=current.recipient.work_email || current.recipient.email;
    record=await d.communication({agencyId:event.agency_id,userId:event.recipient_user_id,channel:'email',templateType:PEOPLE_OPERATIONS_SUBMISSION_TEMPLATE,
     subject:content.subject,body:content.text,recipientAddress:to,generatedByUserId:event.candidate_user_id,deliveryStatus:'pending',metadata:{peopleOperationsSubmissionId:event.id}});
    await d.database.execute('UPDATE people_operations_submission_notifications SET communication_id=? WHERE id=?',[record.id,event.id]);
    if(!event.notification_created){await d.notify({type:'pending_completed',severity:'info',title:content.subject,message:'A hiring submission is ready for review.',userId:event.recipient_user_id,agencyId:event.agency_id,relatedEntityType:'user',relatedEntityId:event.candidate_user_id,actorSource:'People Operations'});await d.database.execute('UPDATE people_operations_submission_notifications SET notification_created=1 WHERE id=?',[event.id]);}
    const identity=await d.identity(event.agency_id);if(!identity||!to)throw fail('Configure the agency People Operations sender and reviewer work address.');
    const result=await d.send({...content,to,senderIdentityId:identity.id,agencyId:event.agency_id,userId:event.recipient_user_id,
     generatedByUserId:event.candidate_user_id,existingCommunicationId:record.id,preloggedReceipt:true,templateType:PEOPLE_OPERATIONS_SUBMISSION_TEMPLATE,replyToOverride:identity.reply_to || identity.from_email,source:'auto'});
    const receipt=notificationTransportReceipt(result,event.agency_id);status=receipt.accepted?'sent':result?.pendingApproval?'pending_approval':result?.skipped?'skipped':'held';
    if(!receipt.accepted&&!result?.pendingApproval)await d.updateCommunication(record.id,status==='held'?'flagged':'skipped',null,null,result?.reason || 'Delivery needs staff review.');
   }catch(error){if(record)await d.updateCommunication(record.id,'flagged',null,null,String(error.message || 'Delivery needs review.').slice(0,500));}
   await d.database.execute('UPDATE people_operations_submission_notifications SET email_status=? WHERE id=?',[status,event.id]);
  }
 };
}
export async function runPeopleOperationsSubmissionNotifications(database=pool){return createPeopleOperationsSubmissionWorker({database})();}
