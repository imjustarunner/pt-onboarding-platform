import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {notificationTransportReceipt} from '../utils/notificationTransportReceipt.js';
import {renderPortalEmail,escapePortalHtml} from './portalEmailBranding.service.js';

export const SCHOOL_FAMILY_STATUS_TEMPLATE='school_family_status_update';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const email=value=>String(value || '').trim().toLowerCase();
const hash=value=>createHash('sha256').update(value).digest('hex');
const recipientKey=value=>hash(email(value));
const fail=message=>Object.assign(new Error(message),{status:403,code:'SCHOOL_FAMILY_STATUS_PROOF_REQUIRED'});
const defaults={database:pool,encrypt:maybeEncryptNotePayload,decrypt:maybeDecryptNotePayload,
  context:async(db,args)=>(await import('./schoolClientStatusEmail.service.js')).schoolClientStatusContext(db,args),
  actor:async(db,args)=>(await import('./schoolClientStatusEmail.service.js')).schoolFamilyStatusActorPermitted(db,args),
  contacts:async(...args)=>(await import('./cancellationRecipients.service.js')).cancellationRecipients.review(...args),
  allowed:async(...args)=>(await import('./cancellationRecipients.service.js')).cancellationRecipients.operationalEmailPermitted(...args),
  emailContext:async args=>(await import('./clientPortalEmail.service.js')).clientEmailContext(args),
  mailbox:async id=>(await import('./tenantMessageMailboxes.service.js')).resolveMessagesSendMailbox(id),
  domain:async id=>(await import('./tenantMessageMailboxes.service.js')).inferAgencyMailDomain(id),
  communication:async args=>(await import('../models/UserCommunication.model.js')).default.create(args),
  updateCommunication:async(...args)=>(await import('../models/UserCommunication.model.js')).default.updateDeliveryStatus(...args),
  send:async args=>(await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(args)};

async function load(d,id) {
  const [[job]]=await d.database.execute(`SELECT f.*,e.state_json,e.state_hash AS source_state_hash,e.agency_id AS source_agency_id,
    e.client_id AS source_client_id,e.school_organization_id AS source_school_id,s.revision AS current_revision,s.state_hash AS current_state_hash
    FROM school_family_status_emails f JOIN school_client_status_emails e ON e.id=f.school_status_email_id
    JOIN school_client_status_email_states s ON s.client_id=f.client_id AND s.school_organization_id=f.school_organization_id WHERE f.id=?`,[id]);
  if(!job || Number(job.actor_user_id)<1 || Number(job.agency_id)!==Number(job.source_agency_id)
    || Number(job.client_id)!==Number(job.source_client_id) || Number(job.school_organization_id)!==Number(job.source_school_id)
    || Number(job.revision)!==Number(job.current_revision) || job.state_hash!==job.current_state_hash || job.state_hash!==job.source_state_hash)return null;
  if(!await d.actor(d.database,{actorUserId:job.actor_user_id,agencyId:job.agency_id,schoolId:job.school_organization_id}))return null;
  const state=parse(job.state_json);
  if(!['assigned','waitlist'].includes(state.kind))return null;
  const context=await d.context(d.database,{clientId:job.client_id,schoolId:job.school_organization_id,reason:state.reason});
  if(!context || Number(context.client.agency_id)!==Number(job.agency_id) || hash(JSON.stringify(context.state))!==job.state_hash)return null;
  return {job,context};
}

/** A future saved transition, not a template flag, authorizes operational mail. */
export async function schoolFamilyStatusEmailContext(input,overrides={}) {
  if(String(input.templateType || '').replace(/^trigger:/,'')!==SCHOOL_FAMILY_STATUS_TEMPLATE)return null;
  if(!Number(input.existingCommunicationId))throw fail('A saved school transition and recipient are required.');
  const d={...defaults,...overrides};
  const [[communication]]=await d.database.execute('SELECT agency_id,client_id,recipient_address,generated_by_user_id,template_type,channel,metadata FROM user_communications WHERE id=?',[input.existingCommunicationId]);
  const metadata=parse(communication?.metadata || {}),loaded=await load(d,metadata.schoolFamilyStatusJobId);
  if(!communication || !loaded)throw fail('This school transition is no longer current.');
  const {job,context}=loaded,plan=parse(d.decrypt(job.plan_json || 'null')),results=parse(job.results_json || '{}');
  const key=recipientKey(input.to),recipient=plan?.recipients?.find(value=>email(value.email)===email(input.to));
  if(Number(communication.agency_id)!==Number(input.agencyId) || Number(communication.client_id)!==Number(input.clientId)
    || Number(job.agency_id)!==Number(input.agencyId) || Number(job.client_id)!==Number(input.clientId)
    || communication.template_type!==SCHOOL_FAMILY_STATUS_TEMPLATE || communication.channel!=='email'
    || Number(communication.generated_by_user_id)!==Number(job.actor_user_id) || email(communication.recipient_address)!==email(input.to)
    || metadata.schoolFamilyRecipientKey!==key || Number(results[key]?.communicationId)!==Number(input.existingCommunicationId)
    || !recipient || !await d.allowed(job.client_id,job.agency_id,recipient,plan.contacts))throw fail('The school family contact or notification permission changed. Review the recipient again.');
  if(overrides.verifyEnvelope) {
    const support=`support@${email(await d.domain(job.agency_id))}`;
    if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(support))throw fail('Configure the agency support mailbox.');
    const copies=value=>Array.isArray(value)?value.map(email):String(value || '').split(',').map(email).filter(Boolean);
    const check=value=>{if(!copies(value.cc).includes(support) || copies(value.cc).some(address=>address!==support) || copies(value.bcc).length)throw fail('School family notices may copy only the agency support mailbox.');};
    check(input);if(Object.hasOwn(metadata,'cc') || Object.hasOwn(metadata,'bcc'))check(metadata);
  }
  return {schoolFamilyStatus:true,actorUserId:Number(job.actor_user_id),agencyId:Number(job.agency_id),clientId:Number(job.client_id),job,context};
}

export function schoolFamilyStatusMessage(context) {
  const assigned=context.state.kind==='assigned';
  const names=context.providers.map(provider=>[provider.preferred_name || provider.first_name,provider.last_name].filter(Boolean).join(' ')).filter(Boolean);
  const update=assigned?`Your dependent has been assigned to ${names.join(' and ') || 'a provider'} for services at ${context.school.name}. The care team will contact you about next steps and scheduling.`
    :`Your dependent is on the waitlist for services at ${context.school.name}. The care team will contact you when a provider is available.`;
  return {subject:assigned?'Your school care provider assignment':'Your school care waitlist update',text:`${update}\n\nNo appointment is created by this message. Reply to reach the care team.`};
}

/** Independent from school/group mail and the demo contact-plan pilot. */
export function createSchoolFamilyStatusEmailWorker(overrides={}) {
  const d={...defaults,...overrides};
  return async function run() {
    const [jobs]=await d.database.execute("SELECT id FROM school_family_status_emails WHERE delivery_status IN ('pending','processing') AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 30");
    const outcomes=[];
    for(const entry of jobs) {
      const db=await d.database.getConnection(),lock=`school-family-status:${entry.id}`;let locked=false;
      try {
        const [[claim]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);locked=!!claim?.acquired;if(!locked)continue;
        const loaded=await load(d,entry.id);
        if(!loaded){await d.database.execute("UPDATE school_family_status_emails SET delivery_status='obsolete' WHERE id=?",[entry.id]);continue;}
        const {job,context}=loaded;let plan=job.plan_json?parse(d.decrypt(job.plan_json)):null;
        const results=parse(job.results_json || '{}');
        if(!plan) {
          const reviewed=await d.contacts(job.client_id,job.agency_id,undefined,{required:false,allowMissingEmail:true});
          plan={contacts:reviewed.contacts,recipients:reviewed.recipients.filter(recipient=>recipient.enabled!==false && recipient.email)};
          await d.database.execute("UPDATE school_family_status_emails SET plan_json=?,delivery_status='processing' WHERE id=?",[d.encrypt(JSON.stringify(plan)),job.id]);
        }
        const save=()=>d.database.execute('UPDATE school_family_status_emails SET results_json=? WHERE id=?',[JSON.stringify(results),job.id]);
        if(!plan.recipients.length && !results.missing) {
          const record=await d.communication({agencyId:job.agency_id,clientId:job.client_id,channel:'email',templateType:SCHOOL_FAMILY_STATUS_TEMPLATE,
            subject:'School family update needs contact follow-up',body:'No current authorized family email address is available. Follow up through an approved contact method.',
            deliveryStatus:'skipped',generatedByUserId:job.actor_user_id,metadata:{schoolFamilyStatusJobId:job.id}});
          results.missing={status:'skipped',communicationId:record.id};await save();
        }
        for(const recipient of plan.recipients) {
          const key=recipientKey(recipient.email);
          if(results[key]) {
            if(results[key].status==='sending'){results[key].status='held';results[key].reason='Delivery was interrupted. Review Communications before retrying.';await save();}
            continue;
          }
          const message=schoolFamilyStatusMessage(context);
          const record=await d.communication({agencyId:job.agency_id,clientId:job.client_id,userId:recipient.userId || null,channel:'email',
            templateType:SCHOOL_FAMILY_STATUS_TEMPLATE,subject:message.subject,body:message.text,recipientAddress:recipient.email,
            generatedByUserId:job.actor_user_id,metadata:{schoolFamilyStatusJobId:job.id,schoolFamilyRecipientKey:key},deliveryStatus:'pending'});
          results[key]={status:'sending',communicationId:record.id};await save();
          try {
            if(!await d.allowed(job.client_id,job.agency_id,recipient,plan.contacts)) {
              results[key]={status:'skipped',communicationId:record.id,reason:'Current contact or notification preferences do not permit this update.'};
            } else {
              const [mailbox,emailContext,domain]=await Promise.all([d.mailbox(job.agency_id),d.emailContext({agencyId:job.agency_id,clientId:job.client_id}),d.domain(job.agency_id)]);
              if(!mailbox?.identity?.id || Number(mailbox.identity.agency_id)!==Number(job.agency_id) || Number(mailbox.identity.is_active)===0 || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain || ''))throw new Error('Configure the agency messages sender and support mailbox.');
              const support=`support@${domain}`,brand={...emailContext.brand,displayName:'SchoolCareBridge',replyTo:support};
              const result=await d.send({...message,html:renderPortalEmail({brand,html:`<p>${escapePortalHtml(message.text).replaceAll('\n','<br>')}</p>`}),
                senderIdentityId:mailbox.identity.id,agencyId:job.agency_id,clientId:job.client_id,to:recipient.email,cc:[support],replyToOverride:support,
                fromDisplayNameOverride:'SchoolCareBridge',portalEmailBrand:brand,templateType:SCHOOL_FAMILY_STATUS_TEMPLATE,source:'auto',
                generatedByUserId:job.actor_user_id,existingCommunicationId:record.id});
              const receipt=notificationTransportReceipt(result,job.agency_id);
              results[key]={status:receipt.accepted?'sent':'held',communicationId:record.id,externalId:receipt.externalId,
                ...(receipt.accepted?{}:{reason:result?.reason || 'Transport did not confirm delivery.'})};
            }
          } catch(error){results[key]={status:'held',communicationId:record.id,reason:String(error.message || 'Delivery needs review.').slice(0,500)};}
          await d.updateCommunication(record.id,results[key].status==='held'?'flagged':results[key].status,results[key].externalId || null,null,results[key].reason || null);
          await save();
        }
        await d.database.execute("UPDATE school_family_status_emails SET delivery_status='processed',last_error=NULL WHERE id=?",[job.id]);
        outcomes.push({id:job.id,status:'processed'});
      } catch(error) {
        await d.database.execute("UPDATE school_family_status_emails SET attempts=attempts+1,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?",[String(error.message || 'Preparation needs review.').slice(0,500),entry.id]);
      } finally {if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
    }
    return outcomes;
  };
}
export const sendPendingSchoolFamilyStatusEmails=createSchoolFamilyStatusEmailWorker();
