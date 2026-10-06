import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

export async function sendSchoolRoiEmail({agencyId,...message}) {
  const domain = await inferAgencyMailDomain(agencyId);
  const identities = await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
  const sender = identities.find(row => Number(row.agency_id) === Number(agencyId) && String(row.from_email || '').toLowerCase() === `schools@${domain}`);
  if (!sender?.id || !domain) throw new Error('Configure the agency schools@ sender before sending ROI emails.');
  return sendEmailFromIdentity({...message,senderIdentityId:sender.id,replyToOverride:`support@${domain}`,usedFallbackSender:false});
}
export function schoolRoiDelivery(result) {
  if (result?.pendingApproval) return {sent:false,pending_approval:true,communication_id:result.communicationId || null};
  if (result?.skipped || result?.blocked || result?.queued || result?.redirected || !result?.id) return {sent:false,error:result?.reason || 'send_failed',communication_id:result?.communicationId || null};
  return {sent:true,redirected:!!result.redirected,communication_id:result.communicationId || null};
}
