export const SMS_PURPOSES = ['care', 'reminders', 'workforce', 'billing', 'marketing', 'account_security', 'polling'];

export function parseSmsKeyword(body) {
  const text = String(body || '').trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPT OUT', 'OPTOUT'].includes(text)) return 'STOP';
  // YES is an appointment / support response, never subscription consent.
  if (['START', 'UNSTOP'].includes(text)) return 'START';
  if (['HELP', 'INFO'].includes(text)) return 'HELP';
  return null;
}

export function smsPolicyError(code, message) {
  return Object.assign(new Error(message), { code, status: 403 });
}

export function validateSmsRegistration(registration) {
  const errors = [];
  for (const key of ['brandId', 'campaignId', 'resellerId', 'brandName', 'legalName', 'supportContact']) {
    if (!String(registration?.[key] || '').trim()) errors.push(`${key} is required`);
  }
  for (const key of ['website', 'privacyUrl', 'termsUrl', 'evidenceUrl']) {
    try {
      const url = new URL(registration?.[key]);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    } catch { errors.push(`${key} must be a public HTTPS URL`); }
  }
  if (!Array.isArray(registration?.purposes) || !registration.purposes.length
      || registration.purposes.some((p) => !SMS_PURPOSES.includes(p))) errors.push('Valid purposes are required');
  if (registration?.purposes?.includes('marketing') && registration.purposes.length > 1) {
    errors.push('AuricWell requires a separate marketing campaign and sender');
  }
  if (!['application', 'vonage'].includes(registration?.keywordOwner)) errors.push('keywordOwner must be application or vonage');
  if (registration?.approved !== true || registration?.numberLinked !== true) errors.push('Carrier approval and number linking must be verified');
  return errors;
}

export function formatRegisteredSms(body, brandName, senderFirstName = null) {
  const text = String(body || '').trim();
  if (!text) throw smsPolicyError('sms_empty_body', 'SMS body is required');
  if (senderFirstName) {
    const name = String(senderFirstName).replace(/[\r\n\t:]+/g, ' ').trim();
    const authored = text.startsWith(`${name}:`) ? text : `${name}: ${text}`;
    return `${authored}\n${brandName}. Reply STOP to opt out.`;
  }
  const branded = text.startsWith(`${brandName}:`) ? text : `${brandName}: ${text}`;
  return /\bSTOP\b/i.test(branded) ? branded : `${branded} Reply STOP to opt out.`;
}

export function validateSmsConsentEvidence({ purpose, status, evidence }) {
  if (!SMS_PURPOSES.includes(purpose) || !['opted_in', 'opted_out'].includes(status)) return ['A valid purpose and status are required'];
  if (status === 'opted_out') return [];
  const errors = [];
  if (!['web_form', 'paper_form', 'preference_center'].includes(evidence?.source)) errors.push('A signed consent collection method is required');
  for (const field of ['reference', 'disclosure', 'collectedAt', 'signatureReference']) {
    if (!String(evidence?.[field] || '').trim()) errors.push(`Consent evidence ${field} is required`);
  }
  if (evidence?.signerVerified !== true) errors.push('Verify the recipient or authorized guardian signature before enrollment');
  const date = Date.parse(evidence?.collectedAt);
  if (!Number.isFinite(date) || date > Date.now()) errors.push('Consent collection time must be a valid past timestamp');
  if (purpose === 'marketing' && (evidence?.source === 'verbal_script' || evidence?.separateMarketingConsent !== true)) {
    errors.push('Marketing requires separate affirmative written consent');
  }
  return errors;
}
