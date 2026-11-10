import { hasMedicaidCoverage } from './insurancePaymentPolicy.js';

/** Coverage, confirmation, and authorization are saved on the enrollment record. */
export function isSelfPayCoverage(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.isSelfPay === true || info.payerChoice === 'self_pay') return true;
  const carrier = String(info.primary?.insurerName || '').trim().toLowerCase();
  return carrier === 'self-pay' || carrier === 'self pay';
}

export function clearCoverageAuthorization(info = {}) {
  return {
    ...info,
    authorizationAgreed: false,
    authorizationSignature: '',
    authorizationSignatureData: '',
    authorizationSignedAt: null,
    authorizationSourceMethod: '',
    authorizationSignatureMeta: null,
    authorizationSignedIp: null,
    authorizationSignedUserAgent: null
  };
}

// Ignore display/default differences and consent itself when comparing policies.
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined && value[key] !== null && value[key] !== '' && value[key] !== false)
    .map(key => [key, normalize(value[key])]));
}
export function enrollmentCoverageFingerprint(info = {}) {
  return JSON.stringify(normalize({
    isSelfPay: isSelfPayCoverage(info),
    primary: info.primary || {},
    secondary: info.hasSecondary === true || info.secondary?.insurerName ? (info.secondary || {}) : null,
    hasSecondary: info.hasSecondary === true,
    coverageScope: info.coverageScope || 'client',
    medicaidByClient: info.medicaidByClient || [],
    clientPolicies: (info.clientCoverages || []).filter(row => row.primary || row.secondary)
      .map(({ confirmed, clientName, ...policy }) => policy).sort((a, b) => Number(a.clientIndex) - Number(b.clientIndex)),
    primary_front_url: info.primary_front_url,
    primary_back_url: info.primary_back_url,
    secondary_front_url: info.secondary_front_url,
    secondary_back_url: info.secondary_back_url,
    noPrimaryCardAvailable: info.noPrimaryCardAvailable === true
  }));
}

/** An explicit payer change requires signing the newly displayed agreement. */
export function coverageWithChoice(info, selfPay) {
  const current = info && typeof info === 'object' ? info : {};
  const changed = isSelfPayCoverage(current) !== !!selfPay;
  let chosen = {
    ...current,
    isSelfPay: !!selfPay,
    payerChoice: selfPay ? 'self_pay' : 'insurance'
  };
  // Known Medicaid remains a protective billing signal. The UI does not offer
  // switching it to Self-Pay. Abandoned commercial fields are not active coverage.
  if (selfPay && !hasMedicaidCoverage(current)) {
    chosen = {
      ...chosen,
      primary: { insurerName: 'Self-Pay', isMedicaid: false },
      primaryIsMedicaid: false,
      secondary: null,
      hasSecondary: false,
      medicaidPlanPosition: null,
      medicaidByClient: [],
      clientCoverages: [],
      primary_front_url: null,
      primary_back_url: null,
      secondary_front_url: null,
      secondary_back_url: null,
      noPrimaryCardAvailable: false,
      photos: {}
    };
  } else if (!selfPay && /^self[ -]?pay$/i.test(String(chosen.primary?.insurerName || '').trim())) {
    chosen.primary = { insurerName: '', isMedicaid: false };
  }
  return changed || enrollmentCoverageFingerprint(chosen) !== enrollmentCoverageFingerprint(current)
    ? clearCoverageAuthorization(chosen) : chosen;
}

/** Explicit blanks and false values must never revive a previous signature. */
export function coverageWithAuthorization(info, auth = {}) {
  const current = info && typeof info === 'object' ? info : {};
  const signature = String(auth.signature ?? current.authorizationSignature ?? '').trim();
  const signatureData = String(auth.signatureData ?? current.authorizationSignatureData ?? '');
  const agreed = auth.agreed === undefined ? current.authorizationAgreed === true : auth.agreed === true;
  const complete = agreed && (signature.length >= 2 || signatureData.length >= 50);
  return {
    ...current,
    authorizationAgreed: agreed,
    authorizationSignature: signature,
    authorizationSignatureData: signatureData,
    authorizationSignedAt: complete ? (auth.signedAt || current.authorizationSignedAt || new Date().toISOString()) : null,
    authorizationSourceMethod: complete ? (auth.sourceMethod || current.authorizationSourceMethod || 'typed_full_name') : ''
  };
}

export function authorizationIsComplete(info, { paymentChoice = '' } = {}) {
  if (!info || info.authorizationAgreed !== true || !paymentChoice) return false;
  return String(info.authorizationSignature || '').trim().length >= 2
    || String(info.authorizationSignatureData || '').trim().length >= 50;
}
