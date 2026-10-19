import crypto from 'node:crypto';
import { fail, hash } from './policy.js';
import { normalizeSessionPhone } from './integrationPolicy.js';

export const CONSENT_VERSION = 'auricwell-verification-sms-2026-10-19';
export const CONSENT_TEXT = 'I agree to receive verification codes by text from AuricWell when I request them. Message frequency varies based on my requests. Msg & data rates may apply. Reply STOP to opt out or HELP for help.';
export const VERIFICATION_LINKS = { terms: 'https://auricwell.com/auricwell/terms', privacy: 'https://auricwell.com/auricwell/privacypolicy' };
export const verificationDefaults = () => ({ enabled:false, from:'', campaignId:'', approval:'draft', approvalReference:'', verifiedAt:null, carrierKeywordsConfirmed:false });
export const verificationScope = s => hash(`auricwell:verification:${s.campaignId}:${s.from}`);
export function cleanVerificationSettings(input, current, settings, previous) {
  const value={...verificationDefaults(),...input};
  value.from=String(value.from||'').trim();
  value.campaignId=String(value.campaignId||'').trim().slice(0,100);
  value.approvalReference=String(value.approvalReference||'').trim().slice(0,1000);
  value.enabled=value.enabled===true;
  value.carrierKeywordsConfirmed=value.carrierKeywordsConfirmed===true;
  if(value.from && !/^\+1\d{10}$/.test(value.from)) throw fail(400,'Enter the AuricWell verification number in US format, for example +17195550123.');
  if(!['draft','submitted','approved','rejected'].includes(value.approval)) throw fail(400,'Choose the verification campaign approval status.');
  if(value.approval==='approved'&&!value.approvalReference) throw fail(400,'Record the AuricWell verification campaign approval reference.');
  if(value.from && [settings.notifyre.from,settings.vonage.from,...(settings.clientMessaging?.routes||[]).flatMap(r=>[r.mainNumber,r.providerNumber])].includes(value.from))
    throw fail(400,'Use a separate AuricWell verification number, not an agency messaging number.');
  value.verifiedAt=current && ['from','campaignId','approval','approvalReference','carrierKeywordsConfirmed'].every(k=>current[k]===value[k]) && settings.notifyre.apiToken===previous.notifyre.apiToken ? current.verifiedAt : null;
  if(value.enabled) assertVerificationReady({...settings,verificationSms:value});
  return value;
}
export function assertVerificationReady(settings) {
  const v=settings.verificationSms;
  if(!v?.enabled || v.approval!=='approved' || !v.approvalReference || !v.campaignId || !v.verifiedAt || !v.from || !v.carrierKeywordsConfirmed || !settings.notifyre.apiToken || !settings.notifyre.baaReference || !settings.notifyre.webhookSecret || !settings.notifyre.webhookVerifiedAt)
    throw fail(409,'Text verification is not available yet. Use your authenticator or email recovery for now.');
  return v;
}
export function consentPhone(input) {
  const phone=normalizeSessionPhone(input.phone);
  if(!/^\+1\d{10}$/.test(phone)) throw fail(400,'Enter a US mobile number, including the area code.');
  if(input.consent!==true || input.consentVersion!==CONSENT_VERSION) throw fail(400,'Select the verification-text consent box before requesting a code.');
  return phone;
}
export function codeDigest(id,code) {
  const key=Buffer.from(process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64||'','base64');
  if(key.length!==32) throw new Error('Verification encryption key unavailable');
  return crypto.createHmac('sha256',key).update(`auricwell:verification:${id}:${code}`).digest('hex');
}
export function verificationMessage(purpose,code) {
  return purpose==='recovery'
    ? `AuricWell: Your account recovery code is ${code}. If you did not request it, ignore this message. Reply STOP to opt out.`
    : `AuricWell: Your ${purpose==='enroll'?'account':'sign-in'} verification code is ${code}. Do not share this code. Reply STOP to opt out.`;
}
