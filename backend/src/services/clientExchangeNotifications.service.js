import pool from '../config/database.js';
import { buildExchangeEmail, exchangeNotificationSummary } from '../utils/clientExchangeSummary.js';
import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import NotificationDispatcher from './notificationDispatcher.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

export async function notifyExchangeMatches({ listing, client, send = true, report = true }) {
  const { withExchangeLock, startExchangeRun, finishExchangeRun, saveExchangeDecision, saveExchangeDelivery,
    exchangeDeliveryHistory, isExchangeListingOpen, terminalDelivery, enrollExchangeAuditClient, parseAuditJson } = await import('./clientExchangeAudit.service.js');
  const { loadExchangeCandidates, evaluateExchangeCandidate } = await import('./clientExchangeCandidates.service.js');
  return withExchangeLock(listing.id, async () => {
    await startExchangeRun(listing);
    const summary = { matched: 0, sent: 0, queued: 0, skipped: 0, failed: 0 };
    try {
      const agencyId = Number(listing.agencyId);
      const agency = await Agency.findById(agencyId);
      const config = parseAuditJson(agency?.feature_flags)?.clientExchangeAudit;
      await enrollExchangeAuditClient(listing, config);
      const identities = await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
      const sender = identities.find(row=>row.identity_key==='client_exchange') || identities.find(row=>row.identity_key==='notifications') || identities.find(row=>/^notifications@/i.test(row.from_email||''));
      const noReply = sender?.identity_key==='client_exchange' ? sender.reply_to : identities.find(row=>/^(no-?reply)@/i.test(row.from_email||''))?.from_email || sender?.reply_to;
      const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${listing.id}&agencyId=${agencyId}`;
      const {users,facets}=await loadExchangeCandidates(agencyId);
      const history=await exchangeDeliveryHistory(listing);
      for(const user of users) {
        const previous=history.get(Number(user.id))||{};
        let decision;
        try { decision=await evaluateExchangeCandidate({user,listing,client,facets:facets.get(Number(user.id))}); }
        catch(error) { decision={matched:false,checks:[{field:'evaluation',status:'error',reason:'Provider data could not be evaluated; retry required.'}]};summary.failed++; }
        await saveExchangeDecision(listing.id,user.id,decision);
        await saveExchangeDelivery(listing.id,user.id,previous);
        if(!decision.matched) {
          await saveExchangeDelivery(listing.id,user.id,{
            email:previous.email||{status:'not_sent',reason:'Provider did not match this evaluation.'},
            sms:previous.sms||{status:'not_sent',reason:'Provider did not match this evaluation.'}
          });continue;
        }
        summary.matched++;
        if(!send)continue;
        if(!await isExchangeListingOpen(listing)) {
          await saveExchangeDelivery(listing.id,user.id,{email:previous.email||{status:'not_sent',reason:'Listing or client is no longer available.'},sms:previous.sms||{status:'not_sent',reason:'Listing or client is no longer available.'}});
          summary.skipped++;continue;
        }
        try {
          let notification=previous.notificationId ? {id:previous.notificationId,user_id:user.id,agency_id:agencyId,type:'client_exchange_match',related_entity_id:listing.id,related_entity_type:'client_exchange_listing'} : null;
          if(!notification) {
            notification=await Notification.create({type:'client_exchange_match',severity:'info',title:'New client added to the exchange',
              message:'A client is a possible match for your care preferences. Open Client Exchange to review the requested care and request the client.',
              userId:user.id,agencyId,relatedEntityType:'client_exchange_listing',relatedEntityId:listing.id,
              actorUserId:listing.postedByUserId,actorSource:'client_exchange',audienceJson:{agencySlug:agency?.slug||agency?.portal_url}});
            await saveExchangeDelivery(listing.id,user.id,{notificationId:notification.id});
          }
          if(!terminalDelivery(previous.sms)) {
            await saveExchangeDelivery(listing.id,user.id,{sms:{status:'sending',attemptedAt:new Date().toISOString()}});
            try {
              const result=await NotificationDispatcher.dispatchForNotification(notification,{context:{exchangeSummary:exchangeNotificationSummary({listing,client}).join(' · ')}});
              await saveExchangeDelivery(listing.id,user.id,{sms:{status:result?.dispatched?'sent':result?.reason==='send_failed'?'failed':'skipped',reason:result?.reason||null,messageId:result?.providerRef||null}});
            }catch(error){await saveExchangeDelivery(listing.id,user.id,{sms:{status:'unknown',reason:'Text attempt did not return a confirmed result; verify before retrying.'}});}
          }
          if(terminalDelivery(previous.email)) {
            if(['sent','delivered'].includes(previous.email.status))summary.sent++;
            else if(previous.email.status==='queued')summary.queued++;
            else summary.failed++;
            continue;
          }
          const enabled=await isNotificationChannelEnabled({userId:user.id,userRole:user.role,agencyId,type:'client_exchange_match',channel:'email'});
          if(!enabled){summary.skipped++;await saveExchangeDelivery(listing.id,user.id,{email:{status:'skipped',reason:'Exchange email notifications are disabled in recipient preferences.'}});continue;}
          const to=user.work_email||user.email;
          if(!sender?.id||!to||!noReply){summary.failed++;await saveExchangeDelivery(listing.id,user.id,{email:{status:'failed',reason:!to?'No recipient email address.':'Sender or reply mailbox is not configured.'}});continue;}
          await saveExchangeDelivery(listing.id,user.id,{email:{status:'sending',from:sender.from_email,to,attemptedAt:new Date().toISOString()}});
          let result;
          try {
            result=await sendEmailFromIdentity({senderIdentityId:sender.id,to,userId:user.id,source:'auto',subject:'New client added to the exchange',
              replyToOverride:noReply,...buildExchangeEmail({listing,link,client}),templateType:'client_exchange_match',linkUrl:link,fromDisplayNameOverride:'Client Exchange',
              internetMessageIdOverride:`<client-exchange-${listing.id}-${user.id}@auricwell.com>`});
          }catch(error){summary.failed++;await saveExchangeDelivery(listing.id,user.id,{email:{status:'unknown',reason:'Email attempt did not return a confirmed result; check delivery records before retrying.',from:sender.from_email,to}});continue;}
          const status=result?.redirected?'redirected':result?.queued?'queued':result?.blocked||result?.failed?'failed':result?.skipped?'skipped':result?.id||result?.sent?'sent':'unknown';
          await saveExchangeDelivery(listing.id,user.id,{email:{status,communicationId:result?.communicationId||null,messageId:result?.id||null,reason:result?.reason||null,from:sender.from_email,to}});
          if(status==='sent')summary.sent++;else if(status==='queued')summary.queued++;else if(status==='skipped')summary.skipped++;else summary.failed++;
        }catch(error){summary.failed++;console.error('[clientExchange] Match delivery needs review',{listingId:listing.id,userId:user.id,code:error?.code||'delivery_failed'});}
      }
      const candidateIds=new Set(users.map(user=>Number(user.id)));
      for(const [userId,previous] of history)if(!candidateIds.has(userId)){
        await saveExchangeDecision(listing.id,userId,{matched:false,checks:[{field:'eligibility',status:'fail',reason:'Previous recipient is no longer an eligible provider in this agency.'}]});
        await saveExchangeDelivery(listing.id,userId,previous);
      }
      await finishExchangeRun(listing.id,summary.failed?'delivery_needs_review':null);
      if(report){
        try {const {sendExchangeAuditReport}=await import('./clientExchangeAuditReport.service.js');const result=await sendExchangeAuditReport({listing,agency,identities});
          if(result?.status&&!['sent'].includes(result.status))await finishExchangeRun(listing.id,'audit_delivery_needs_review');
        }catch(error){await finishExchangeRun(listing.id,'audit_send_failed');console.error('[clientExchange] Support audit needs retry',{listingId:listing.id,code:error?.code||'audit_send_failed'});}
      }
      return summary;
    }catch(error){await finishExchangeRun(listing.id,'evaluation_failed');throw error;}
  });
}

async function exchangeActivityNotification({ listing, userId, type, title, message, actorUserId }) {
  const agency = await Agency.findById(listing.agency_id);
  await Notification.create({
    type, severity: 'info', title, message, userId, agencyId: listing.agency_id,
    relatedEntityType: 'client_exchange_listing', relatedEntityId: listing.id, actorUserId,
    actorSource: 'client_exchange', audienceJson: { agencySlug: agency?.slug || agency?.portal_url }
  });
  const [[recipient]] = await pool.execute(`SELECT u.id, u.role, u.work_email, u.email, u.personal_email FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? WHERE u.id = ? AND COALESCE(u.is_active,1) = 1 AND COALESCE(u.is_archived,0) = 0 LIMIT 1`, [listing.agency_id, userId]);
  if (!recipient || !await isNotificationChannelEnabled({ userId, userRole: recipient.role, agencyId: listing.agency_id, type, channel: 'email' })) return;
  const identities = await EmailSenderIdentity.list({ agencyId: listing.agency_id, includePlatformDefaults: false, onlyActive: true });
  const sender = identities.find(row => row.identity_key === 'notifications') || identities.find(row => /^notifications@/i.test(row.from_email || ''));
  const to = recipient.work_email || recipient.email || recipient.personal_email;
  if (!sender?.id || !to) throw new Error('Client Exchange notification email sender or recipient is unavailable.');
  const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${listing.id}&agencyId=${listing.agency_id}`;
  const result = await sendEmailFromIdentity({ senderIdentityId: sender.id, to, userId, source: 'auto',
    subject: title, text: `${message}\n\n${link}`, templateType: type, linkUrl: link });
  if (result?.blocked || result?.skipped || result?.failed) throw new Error('Client Exchange email was not delivered.');
}

export async function notifyExchangeClaim({ listing, requestingProviderUserId }) {
  const [reviewers] = await pool.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND u.role IN ('admin','super_admin','support','staff')
    AND COALESCE(u.is_active,1) = 1 AND COALESCE(u.is_archived,0) = 0`, [listing.agency_id]);
  const recipients = new Set([listing.current_provider_user_id, listing.posted_by_user_id, ...reviewers.map(user => user.id)].filter(Boolean).map(Number));
  recipients.delete(Number(requestingProviderUserId));
  const results = await Promise.allSettled([...recipients].map(userId => exchangeActivityNotification({ listing, userId, type: 'client_exchange_claim',
    title: 'New Client Exchange request', message: 'A provider has requested a referral. Review the request in Client Exchange.', actorUserId: requestingProviderUserId })));
  if (results.some(result => result.status === 'rejected')) throw new Error('Some Client Exchange request notifications could not be delivered.');
}

export async function notifyExchangeAssignment({ listing, request, actingUserId }) {
  await exchangeActivityNotification({ listing, userId: request.requesting_provider_user_id, type: 'client_exchange_assigned',
    title: 'Client Exchange assignment confirmed', message: 'You have been assigned the client you requested. Open the exchange to view the client record.', actorUserId: actingUserId });
}
