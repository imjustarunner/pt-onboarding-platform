import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { getSmsSender, resolveRegisteredSmsSender, isSmsSuppressed } from './smsCompliance.service.js';
import { buildSmsConsentDisclosure } from '../utils/smsConsentDisclosure.js';
import { smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { allowQaSmsDelivery } from '../utils/auricwellQaPolicy.js';

export const PLOTLINE_HIRING_CONSENT_VERSION = 'plotline-hiring-2026-11-26.1';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
export const hiringDisclosureHash = disclosure => createHash('sha256').update(JSON.stringify(disclosure)).digest('hex');
export function isPlotlineHiringSender(sender) {
  const r = sender?.registration;
  return sender?.agency_id === null && sender.number_purpose === 'platform_contact'
    && !validateSmsRegistration(r).length && r.provider === 'vonage' && /^Plotline\b/i.test(r.brandName)
    && r.platformHiringSender === true && r.hiringJourneyApproved === true && r.applicationOptInApproved === true
    && r.hiringConsentVersion === PLOTLINE_HIRING_CONSENT_VERSION && r.interviewOnly !== true
    && /^[a-f0-9]{64}$/.test(r.hiringJourneyApprovalDigest||'')
    && r.purposes.length === 1 && r.purposes[0] === 'workforce' && sender.campaign_id === r.campaignId;
}
export async function resolvePlotlineHiringSender(agencyId) {
  const id = Number(agencyId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  let config;
  try {
    const programs = JSON.parse(process.env.PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON || '{}');
    config = Object.hasOwn(programs, String(id)) ? programs[id] : programs.platform;
  } catch { return null; }
  if (!config?.from || config.scope !== 'all_agencies') return null;
  const sender = await getSmsSender(config.from).catch(() => null);
  return isPlotlineHiringSender(sender) && sender.registration.brandId === config.brandId
    && sender.registration.campaignId === config.campaignId ? sender : null;
}
export async function resolveHiringTextSender(agencyId) {
  if (process.env.PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON) return resolvePlotlineHiringSender(agencyId);
  const from = await resolveRegisteredSmsSender({ agencyId, purpose: 'workforce' });
  return from ? getSmsSender(from) : null;
}
export async function hiringAgency(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT id,name,slug,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0', [Number(agencyId)]);
  if (!agency?.name) throw smsPolicyError('sms_hiring_agency_unavailable', 'The hiring organization is unavailable.');
  return agency;
}
export async function hiringDisclosure(sender, agencyId, { version = null } = {}) {
  if (!isPlotlineHiringSender(sender)) return buildSmsConsentDisclosure(sender.registration, { signerRole: 'staff', enrollmentCategory: 'hiring', version });
  const agency = await hiringAgency(agencyId);
  const r = sender.registration;
  return {
    enrollmentCategory: 'hiring', program: 'plotline_hiring', version: PLOTLINE_HIRING_CONSENT_VERSION,
    brandId: r.brandId, campaignId: r.campaignId, brandName: r.brandName, legalName: r.legalName,
    hiringAgencyId: Number(agency.id), hiringAgencyName: agency.name,
    termsUrl: r.termsUrl, privacyUrl: r.privacyUrl, supportContact: r.supportContact,
    purposes: [{ purpose: 'workforce', label: 'Application and interview updates, interview reminders, reference progress, pre-hire and onboarding portal invitations, and new documents or tasks assigned to me' }],
    text: `${r.brandName} sends optional hiring texts for ${agency.name} about your application, interview scheduling and reminders, reference outreach and completion, pre-hire and onboarding portal invitations, and documents or tasks assigned to you. This choice applies to your phone number and this hiring organization. Email continues. Consent is optional and is not a condition of applying or employment. Message frequency varies. Message and data rates may apply. Reply STOP to opt out of the Plotline texting program across its sending numbers. Reply HELP for help or contact ${r.supportContact}. Read the linked terms and privacy policy before signing. Enrollment requires staff review before texts begin.`,
    signatureText: 'I control this mobile number and electronically sign my optional hiring text choice. Declining does not affect my application or employment.'
  };
}
export async function consentSenderForHiring(agencyId, numberId) {
  const sender = await resolvePlotlineHiringSender(agencyId);
  return sender && Number(sender.id) === Number(numberId) ? sender : null;
}
export async function currentPlotlineHiringConsent({ agencyId, userId, sender, phone = null, confirmationRequestId = null }) {
  const configured = await resolvePlotlineHiringSender(agencyId);
  if (!configured || Number(configured.id) !== Number(sender?.id) || !Number(userId)) return null;
  const [[row]] = await pool.execute(`SELECT p.phone,r.id AS request_id,r.disclosure_json,r.disclosure_hash,r.activation_json,r.review_token
    FROM hire_communication_preferences p JOIN sms_consent_requests r
      ON r.id=p.consent_request_id AND r.agency_id=p.agency_id AND r.phone=p.phone
    JOIN users u ON u.id=p.user_id
    WHERE p.user_id=? AND p.agency_id=? AND p.channel='email_sms' AND r.number_id=?
      AND r.signed_at IS NOT NULL AND r.signed_payload_json IS NOT NULL AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','DELETED','TERMINATED','INACTIVE') LIMIT 1`,
  [Number(userId), Number(agencyId), sender.id]);
  if (!row || !/^\+1\d{10}$/.test(row.phone || '') || (phone && row.phone !== phone)) return null;
  const activation = parse(row.activation_json)?.workforce;
  const disclosure = parse(row.disclosure_json);
  if (activation?.activated !== true || activation.choice !== 'yes' || disclosure?.program !== 'plotline_hiring') return null;
  if (confirmationRequestId != null) {
    if (Number(confirmationRequestId) !== Number(row.request_id) || !row.review_token || activation.confirmed === true) return null;
  } else if (activation.confirmed !== true) return null;
  const current = await hiringDisclosure(sender, agencyId);
  if (row.disclosure_hash !== hiringDisclosureHash(current)) return null;
  if (await isSmsSuppressed(sender, row.phone)) return null;
  const agency = await hiringAgency(agencyId);
  if (!allowQaSmsDelivery(agency, { to: row.phone, purpose: 'workforce' })) return null;
  return { phone: row.phone, requestId: row.request_id, agencyId: Number(agencyId), agencyName: agency.name };
}
export async function authorizePlotlineHiringSms(input) {
  const consent = await currentPlotlineHiringConsent(input);
  if (!consent) throw smsPolicyError('sms_hiring_consent_required', 'Current reviewed application text consent is required for this organization, program and phone.');
  return consent;
}
export function hiringSmsLabel(brandName, agencyName) {
  return `${brandName} · ${String(agencyName).replace(/[\r\n\t]+/g, ' ').trim()}`;
}
