import EmailService from './email.service.js';
import UserCommunication from '../models/UserCommunication.model.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';

export async function communicationRecordAttachments(comm,meta,userId){
  if(comm.template_type==='payroll_posted_reconciliation'){
    const senderIdentityId=Number(meta.senderIdentityId||meta.sender_identity_id||0)||null;
    return (await import('./payrollReportEmail.service.js')).default.retryAttachments({communication:comm,actorUserId:userId,senderIdentityId});
  }
  if(comm.template_type!=='family_payment_receipt')return [];
  const senderIdentityId=Number(meta.senderIdentityId||meta.sender_identity_id||0)||null;
  return (await import('./familyLedger/receiptDeliveryRetry.js')).receiptRetryAttachments({communication:comm,actorUserId:userId,senderIdentityId});
}
export async function sendCommunicationRecord(comm,meta,userId,{attachments=null}={}){
  if(meta.isSiblingMirror)throw Object.assign(new Error('This is a history copy of the family email. Review or retry the original communication instead.'),{status:409});
  const subject=String(comm.subject||'').trim(),body=String(comm.body||'').trim(),looksLikeHtml=/<[a-z][\s\S]*>/i.test(body);
  const senderIdentityId=Number(meta.senderIdentityId||meta.sender_identity_id||0)||null,linkUrl=meta.linkUrl||meta.link_url||null;
  attachments||=await communicationRecordAttachments(comm,meta,userId);
  const message={to:comm.recipient_address,cc:meta.cc||null,subject:subject||'Notification',text:looksLikeHtml?null:body,html:looksLikeHtml?body:null,
    source:'manual',clientId:comm.client_id||null,userId:comm.user_id||null,templateType:comm.template_type||null,templateId:comm.template_id||null,
    generatedByUserId:userId||null,existingCommunicationId:comm.id,linkUrl,attachments,schoolSessionScopeKey:meta.schoolSessionScopeKey||null,
    reviewedCancellationToken:meta.reviewedCancellationToken||null,reviewedCancellationItemKey:meta.reviewedCancellationItemKey||null};
  if(senderIdentityId)return sendEmailFromIdentity({...message,senderIdentityId,
    fromDisplayNameOverride:meta.fromDisplayName||meta.fromName||null,
    internetMessageIdOverride:meta.internetMessageIdOverride||null,replyToOverride:meta.replyTo||null});
  return EmailService.sendEmail({...message,agencyId:comm.agency_id,templateType:comm.template_type||'manual',
    fromAddress:meta.fromEmail||meta.from_email||null,fromName:meta.fromName||meta.fromDisplayName||null,
    replyTo:meta.replyTo||meta.reply_to||null,usedFallbackSender:meta.usedFallbackSender===false?false:null});
}
export async function recordCommunicationSent(comm,meta,result,actorUserId,{approved=false}={}){
  const providerMessageId=result?.id||result?.messageId||null;
  if(!providerMessageId||result.queued||result.pendingApproval||result.skipped||result.blocked)throw Object.assign(new Error('Delivery has not been confirmed. Review this communication before retrying.'),{status:409});
  const at=new Date().toISOString();
  const sentMeta={...meta,...(approved?{approvedByUserId:actorUserId,approvedAt:at}:{retriedByUserId:actorUserId,retriedAt:at}),...(result.threadId?{threadId:result.threadId}:{}),...(result.relay?{relay:result.relay,internetMessageId:result.internetMessageId||result.relay.messageId}:{})};
  for(const key of ['qualityFlags','qualityBlockedAt','failedListRemovedAt','failedListRemovedByUserId'])delete sentMeta[key];
  // The fourth model argument is a delivery timestamp, never Gmail's thread ID.
  return UserCommunication.updateDeliveryStatus(comm.id,'sent',providerMessageId,null,null,sentMeta);
}
