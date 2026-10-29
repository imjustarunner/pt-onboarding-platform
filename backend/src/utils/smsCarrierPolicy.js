import { SMS_PURPOSES, smsPolicyError } from './smsCompliancePolicy.js';

export const CLIENT_SMS_PURPOSES = Object.freeze(['care', 'reminders', 'billing', 'account_security']);

// A missing provider is supported only for existing Vonage staff registrations.
// A client's clinician being the sender does not make a care message workforce traffic.
export function assertSmsCarrierPurpose({ registration = {}, purpose, controlReply = false }) {
  const carrier = registration.provider || 'vonage';
  if (!['vonage', 'notifyre'].includes(carrier)) {
    throw smsPolicyError('sms_carrier_unknown', 'The SMS carrier must be explicitly configured.');
  }
  if (!controlReply && !SMS_PURPOSES.includes(purpose)) {
    throw smsPolicyError('sms_campaign_purpose_mismatch', 'An approved SMS purpose is required.');
  }
  if (carrier === 'notifyre') {
    if (!registration.purposes?.length || registration.purposes.some(p => !CLIENT_SMS_PURPOSES.includes(p))
        || (!controlReply && !CLIENT_SMS_PURPOSES.includes(purpose))) {
      throw smsPolicyError('notifyre_client_scope_required', 'Notifyre is reserved for the approved client care campaign.');
    }
  } else if (!controlReply && CLIENT_SMS_PURPOSES.includes(purpose)) {
    throw smsPolicyError('sms_client_notifyre_required', 'Client care, appointment, billing and portal texts require Notifyre. Nothing was sent.');
  }
  return carrier;
}

// Bind the actual carrier brand/campaign IDs to each app agency. There is no
// global campaign fallback: another organization's approval cannot authorize a send.
export function notifyreCampaignForAgency(agencyId, env = process.env) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) return null;
  let campaigns;
  try { campaigns = JSON.parse(env.NOTIFYRE_CLIENT_CAMPAIGNS_JSON || '{}'); }
  catch { throw smsPolicyError('notifyre_campaign_configuration_invalid', 'Notifyre agency campaign configuration needs review.'); }
  if (!campaigns || Array.isArray(campaigns) || typeof campaigns !== 'object') {
    throw smsPolicyError('notifyre_campaign_configuration_invalid', 'Notifyre agency campaign configuration needs review.');
  }
  const campaign = Object.hasOwn(campaigns, String(Number(agencyId))) ? campaigns[String(Number(agencyId))] : null;
  if (!campaign || typeof campaign.brandId !== 'string' || !campaign.brandId.trim()
      || typeof campaign.campaignId !== 'string' || !campaign.campaignId.trim()) return null;
  return { brandId: campaign.brandId, campaignId: campaign.campaignId };
}

export function assertNotifyreAgencyCampaign(registration, agencyId, env = process.env) {
  const expected = notifyreCampaignForAgency(agencyId, env);
  if (registration?.provider !== 'notifyre' || !expected
      || registration.brandId !== expected.brandId || registration.campaignId !== expected.campaignId) {
    throw smsPolicyError('notifyre_agency_campaign_mismatch', 'The sender must use this organization’s approved Notifyre brand and client campaign.');
  }
  return expected;
}
