import pool from '../config/database.js';
import Conversation from '../models/CommunicationConversation.model.js';
import {schoolContactRouting} from './schoolContactPlan.service.js';
import {loadSchoolContactStaff,schoolContactComposePath} from './schoolContactStaffEmail.service.js';
import {resolveMessagesSendMailbox} from './tenantMessageMailboxes.service.js';
import {schoolContactDelivery} from './schoolContactRollout.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';

const esc = value => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const validEmail = value => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(value || ''));

export async function sendSchoolContactProviderNotice(workflow,ctx,{reminder=false,stepKey}={}) {
  const state = await loadSchoolContactStaff({agencyId:workflow.agency_id,providerUserId:workflow.provider_user_id,workflowId:workflow.id});
  if (state.attemptCount !== 3 || !state.completedPhases?.third) throw Object.assign(new Error('Three accepted contact attempts are required before the no-response provider notice.'),{code:'school_contact_attempts_incomplete'});
  const [copies] = await pool.execute(`SELECT DISTINCT u.id,u.email FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
      AND (u.role IN ('admin','support','clinical_practice_assistant') OR EXISTS(SELECT 1 FROM supervisor_assignments sa
        WHERE sa.agency_id=ua.agency_id AND sa.supervisee_id=? AND sa.supervisor_id=u.id))`,[workflow.agency_id,workflow.provider_user_id]);
  const mailbox = await resolveMessagesSendMailbox(workflow.agency_id);
  if (!mailbox.identity?.id || !mailbox.inbox?.id || Number(mailbox.identity.agency_id)!==Number(workflow.agency_id)) throw Object.assign(new Error('A current messages mailbox is required.'),{code:'school_contact_mailbox_missing'});
  const routing=schoolContactRouting(ctx.provider,mailbox.fromEmail,ctx.agency);
  if (!validEmail(routing.providerEmail)) throw Object.assign(new Error('The provider email needs review.'),{code:'school_contact_provider_email_missing'});
  const cc=[...new Set(copies.map(c=>String(c.email || '').trim().toLowerCase()).filter(validEmail))].filter(e=>e!==routing.providerEmail);
  const code=state.workflow.initials || 'client';
  const subject=`${reminder?'Reminder: Intake Documentation Outstanding':'Intake Follow-Up Required'} | ${code}`;
  const staffText=state.contacts.length ? state.contacts.map(s=>`${s.name} — ${s.email}\nStart an email: https://app.itsco.health${schoolContactComposePath(state.workflow,s)}`).join('\n\n')
    : 'No school staff currently have an individual ROI permission to discuss this client and a valid email on file. Ask support to review the release; do not contact unapproved staff.';
  const outreachSummary=reminder || state.hasGuardianReply ? `The intake for ${code} at ${workflow.school_name} still awaits finalized documentation. Three outreach attempts were recorded.` : `Three outreach attempts to the parent or guardian of ${code} at ${workflow.school_name} have been sent without a documented reply.`;
  const text=`Hello ${ctx.provider.first_name || 'there'},\n\n${outreachSummary} The intake is marked Intake Follow-Up Required.\n\nReview the enrollment information, gather developmentally appropriate information from the client, and coordinate only with school staff authorized by this client's current release of information (ROI). These contact attempts do not replace required consent, authorizations or intake prerequisites. Missing requirements need support review; this notice does not authorize services.\n\nApproved to discuss this client:\n${staffText}\n\nEach link opens an editable email in the app with the approved recipient and client initials. Review it before sending. Permissions are checked again when you open and send the draft.\n\nPlease complete and document the intake in the EHR. A draft or scheduled meeting does not count as completed. We will remind you every 48 hours until the finalized intake is documented.\n\nIf you need help, contact your support team or assigned supervisor.\n\nThank you,\nYour ${ctx.agency.name} support team`;
  const contactsHtml=state.contacts.length ? `<ul>${state.contacts.map(s=>`<li><strong>${esc(s.name)}</strong> — ${esc(s.email)}<br><a href="https://app.itsco.health${esc(schoolContactComposePath(state.workflow,s))}">Start an email to ${esc(s.name)}</a></li>`).join('')}</ul>` : `<p>${esc(staffText)}</p>`;
  const html=`<div style="max-width:680px;font:16px/1.6 Arial,sans-serif;color:#102e53"><h2>${esc(subject)}</h2><p>Hello ${esc(ctx.provider.first_name || 'there')},</p><p>${esc(outreachSummary)}</p><p><strong>Intake Follow-Up Required</strong></p><p>Review the enrollment information and gather developmentally appropriate information from the client. Contact attempts do not replace required consent, authorizations or intake prerequisites. Missing requirements need support review; this notice does not authorize services.</p><h3>Approved to discuss this client under the current ROI</h3>${contactsHtml}<p>Open an editable email in the app, then review before sending. Permissions are checked again when opening and sending.</p><p>Please complete and document the intake in the EHR. A draft or scheduled meeting does not count as completed. Reminders continue every 48 hours until the finalized intake is documented.</p><p>Thank you,<br>Your ${esc(ctx.agency.name)} support team</p></div>`;
  const conv=await Conversation.create({agencyId:workflow.agency_id,inboxId:mailbox.inbox.id,channel:'email',subject,ownerUserId:workflow.provider_user_id,status:'open'});
  await Conversation.upsertLink(conv.id,'client',workflow.client_id,'Intake follow-up required');
  const stableId=`<school-contact-${workflow.id}-${stepKey}@itsco.health>`;
  const messageId=await Conversation.addMessage({conversationId:conv.id,channel:'email',direction:'outbound',authorUserId:workflow.provider_user_id,
    from:{email:mailbox.fromEmail,schoolContactAutomation:{workflowId:workflow.id,stepKey}},to:[{email:routing.providerEmail}],cc:cc.map(email=>({email})),bcc:[],
    subject,bodyText:text,bodyHtml:html,sendStatus:'preparing',internetMessageId:stableId});
  let accepted=false;
  try {
    const [[plan]]=await pool.execute(`SELECT p.status,p.decided_at,w.plan_decided_at FROM school_provider_contact_plans p JOIN school_contact_workflows w
      ON w.agency_id=p.agency_id AND w.provider_user_id=p.provider_user_id WHERE w.id=? AND p.agency_id=? AND p.provider_user_id=?`,[workflow.id,workflow.agency_id,workflow.provider_user_id]);
    if(plan?.status!=='enabled' || String(plan.decided_at)!==String(plan.plan_decided_at)) throw Object.assign(new Error('The provider contact plan changed before sending.'),{code:'school_contact_plan_changed'});
    const receipt=await sendEmailFromIdentity({senderIdentityId:mailbox.identity.id,...schoolContactDelivery(workflow.agency_id,{to:routing.providerEmail,cc:cc.length?cc.join(','):null}),
      subject,text,html,source:'auto',templateType:'school_contact_intake_followup',generatedByUserId:ctx.userId,clientId:workflow.client_id,schoolOrganizationId:workflow.school_id,internetMessageIdOverride:stableId});
    if (!receipt?.id || receipt.queued || receipt.pendingApproval || receipt.skipped) throw Object.assign(new Error('Email needs delivery review.'),{code:'email_receipt_missing'});
    accepted=true;
    await Conversation.updateMessage(messageId,{sendStatus:'sent',sentAt:new Date(),internetMessageId:receipt.internetMessageId || stableId});
    return {sent:true,messageId,conversationId:conv.id};
  } catch(error) {
    if (accepted) return {sent:true,messageId,conversationId:conv.id,recordPending:true};
    await Conversation.updateMessage(messageId,{sendStatus:'failed'});throw error;
  }
}
