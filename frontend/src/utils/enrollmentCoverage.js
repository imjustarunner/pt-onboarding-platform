/**
 * The enrollment record is the only copy of coverage and authorization.
 * The payment step edits this object. It does not keep a second copy.
 */

export function isSelfPayCoverage(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.isSelfPay === true || info.payerChoice === 'self_pay') return true;
  const carrier = String(info.primary?.insurerName || '').trim().toLowerCase();
  return carrier === 'self-pay' || carrier === 'self pay';
}

function signedAt(auth, previous) {
  const typed = String(auth?.signature || '').trim();
  const drawn = String(auth?.signatureData || previous?.authorizationSignatureData || '').trim();
  if (auth?.agreed === true && (typed.length >= 2 || drawn.length >= 50)) {
    return auth.signedAt || previous?.authorizationSignedAt || new Date().toISOString();
  }
  return previous?.authorizationSignedAt || '';
}

/**
 * Records the payment choice. Declared coverage stays on the record so switching
 * back to insurance does not lose it; the form hides while self-pay is selected.
 * Authorization fields already on the record are left untouched.
 */
export function coverageWithChoice(info, selfPay) {
  const current = info && typeof info === 'object' ? info : {};
  return {
    ...current,
    isSelfPay: !!selfPay,
    payerChoice: selfPay ? 'self_pay' : 'insurance'
  };
}

/** Writes the agreement onto the same enrollment object. Never drops a signature already there. */
export function coverageWithAuthorization(info, auth = {}) {
  const current = info && typeof info === 'object' ? info : {};
  const signature = String(auth.signature ?? current.authorizationSignature ?? '').trim();
  const signatureData = String(auth.signatureData || current.authorizationSignatureData || '');
  const agreed = auth.agreed === undefined ? current.authorizationAgreed === true : auth.agreed === true;
  return {
    ...current,
    authorizationAgreed: agreed,
    authorizationSignature: signature,
    authorizationSignatureData: signatureData,
    authorizationSignedAt: signedAt({ ...auth, agreed, signature }, current),
    authorizationSourceMethod: auth.sourceMethod || current.authorizationSourceMethod || 'typed_full_name'
  };
}

export function authorizationIsComplete(info, { paymentChoice = '' } = {}) {
  if (!info || info.authorizationAgreed !== true) return false;
  if (!paymentChoice) return false;
  const typed = String(info.authorizationSignature || '').trim().length >= 2;
  const drawn = String(info.authorizationSignatureData || '').trim().length >= 50;
  return typed || drawn;
}
