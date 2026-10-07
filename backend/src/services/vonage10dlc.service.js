import { smsPolicyError } from '../utils/smsCompliancePolicy.js';

const API = 'https://api-eu.vonage.com/v1/10dlc';
const part = value => encodeURIComponent(String(value || ''));

// Read-only carrier checks. Never redirect credentials, retry delivery through a
// different number, or trust an old local "approved" checkbox after suspension.
export async function readVonage10dlc(path) {
  const { VONAGE_API_KEY: key, VONAGE_API_SECRET: secret } = process.env;
  if (!key || !secret) throw smsPolicyError('sms_carrier_unavailable', 'Vonage credentials are not configured');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid 10DLC resource path');
  try {
    const response = await fetch(`${API}${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    // Do not log response bodies, credentials or recipient information.
    throw smsPolicyError('sms_carrier_unavailable', 'Unable to verify Vonage campaign readiness; nothing was sent');
  }
}

export async function listVonage10dlc(path, collection) {
  const items = [];
  for (let page = 1; page <= 1000; page++) {
    const data = await readVonage10dlc(`${path}?page=${page}&page_size=100`);
    const rows = data?._embedded?.[collection];
    if (!Array.isArray(rows) || !Number.isInteger(data.total_pages) || data.total_pages < 0) {
      throw new Error('Invalid or incomplete Vonage inventory response');
    }
    items.push(...rows);
    if (page >= data.total_pages) return items;
  }
  throw new Error('Vonage inventory exceeded the page limit; audit incomplete');
}

export function campaignPath(registration) {
  return `/brands/${part(registration.brandId)}/campaigns/${part(registration.campaignId)}`;
}

const usecases = {
  care: ['CUSTOMER_CARE'], reminders: ['ACCOUNT_NOTIFICATION'],
  workforce: ['ACCOUNT_NOTIFICATION'], billing: ['ACCOUNT_NOTIFICATION'],
  polling: ['POLLING_VOTING'], marketing: ['MARKETING'], account_security: ['2FA', 'ACCOUNT_NOTIFICATION']
};

export function assertCarrierSmsPolicy({ campaign, number, registration, from, body, purpose, controlReply = false }) {
  if (campaign?.campaign_id !== registration.campaignId || campaign?.brand_id !== registration.brandId
      || campaign.status !== 'ACTIVE' || campaign.traffic_enabled !== true) {
    throw smsPolicyError('sms_carrier_campaign_blocked', 'Vonage has not enabled traffic for this exact brand and campaign');
  }
  if (number?.number !== from.replace(/^\+/, '') || number.status !== 'LINKED') {
    throw smsPolicyError('sms_carrier_number_unlinked', 'Vonage has not linked this sending number to this campaign');
  }
  if (registration.resellerId !== campaign.reseller_id) {
    throw smsPolicyError('sms_carrier_registration_mismatch', 'Local reseller information differs from the registered campaign');
  }
  if ((registration.hipaaRequired === true || campaign.hipaa === true)
      && !number.compliance?.includes('HIPAA')) {
    throw smsPolicyError('sms_carrier_hipaa_required', 'The sending number requires HIPAA provisioning before use');
  }
  if (controlReply) return; // Only the one-use keyword capability can reach this branch.
  const registeredUses = [campaign.usecase, ...(campaign.sub_usecases || [])];
  if (!usecases[purpose]?.some(use => registeredUses.includes(use))) {
    throw smsPolicyError('sms_carrier_purpose_mismatch', 'The requested message purpose is outside the carrier-approved use cases');
  }
  if ((registration.keywordOwner === 'vonage') !== (campaign.opt_out_assist === true)) {
    throw smsPolicyError('sms_carrier_keyword_mismatch', 'The app and Vonage must agree on who handles STOP and HELP');
  }
  const text = String(body || '');
  const urls = text.match(/(?:https?:\/\/|www\.)[^\s<>]+/gi) || [];
  if (urls.length && campaign.embedded_link !== true) {
    throw smsPolicyError('sms_carrier_links_not_declared', 'Links were not declared for this campaign');
  }
  // Public shorteners obscure the destination and are prohibited by Vonage.
  if (/(?:^|[^a-z0-9.-])(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|shorturl\.at)\//i.test(text)) {
    throw smsPolicyError('sms_public_shortener', 'Use your full branded HTTPS link instead of a public URL shortener');
  }
  for (const link of urls) {
    let url;
    try { url = new URL(link); } catch { /* rejected below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
      throw smsPolicyError('sms_unsafe_link', 'SMS links must use HTTPS without embedded credentials');
    }
  }
  if (campaign.embedded_phone !== true
      && /(?:\+?1[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/.test(text)) {
    throw smsPolicyError('sms_carrier_phone_not_declared', 'Callback numbers were not declared for this campaign');
  }
}

export async function verifyCarrierSmsDelivery(delivery) {
  const { registration, from } = delivery;
  if (!registration?.brandId || !registration?.campaignId) {
    throw smsPolicyError('sms_campaign_not_ready', 'A registered brand and campaign are required');
  }
  const path = campaignPath(registration);
  // Recheck each attempted send, including control replies. No stale-success cache.
  const [campaign, number] = await Promise.all([
    readVonage10dlc(path), readVonage10dlc(`${path}/numbers/${part(from.replace(/^\+/, ''))}`)
  ]);
  assertCarrierSmsPolicy({ ...delivery, campaign, number });
}
