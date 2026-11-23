const object = value => {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
const yes = value => value === true || value === 1 || value === '1' || value === 'true';

/** The two-page application submits these choices at the root; packet forms nest them. */
export function applicationReferenceConsent(raw) {
  const data = object(raw), submission = object(data.responses?.submission || data.submission);
  const consent = object(data.referencesConsent ?? submission.referencesConsent);
  const signature = String(data.referenceReleaseSignature || submission.referenceReleaseSignature || '').trim();
  return {
    consentVersion: Number(consent.consentVersion) || 1,
    digitalFormAtInterviewOrOffer: yes(consent.digitalFormAtInterviewOrOffer),
    referenceContentWaiverAcknowledged: yes(consent.referenceContentWaiverAcknowledged),
    referencesWaived: yes(data.referencesWaived ?? submission.referencesWaived ?? consent.referencesWaived),
    referenceReleaseSigned: !!signature
  };
}

export function legacyApplicationConsentProjection(profile, submittedAt) {
  const consent = object(profile?.references_consent_json);
  const date = value => {
    if (value instanceof Date) return +value;
    const raw = String(value || '').replace(' ', 'T');
    return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`);
  };
  return consent.consentVersion === 1 && consent.digitalFormAtInterviewOrOffer === false
    && consent.referenceContentWaiverAcknowledged === false && consent.referenceReleaseSigned === false
    && consent.referencesWaived === false && !consent.revoked && !consent.revokedAt
    && Number.isFinite(date(submittedAt)) && Math.abs(date(profile.references_consent_at) - date(submittedAt)) < 1000;
}
