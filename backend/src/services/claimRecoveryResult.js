// Recovery logs identify the action needed without echoing clinical text, SQL,
// payer payloads, credentials, or database error messages.
export function claimRecoveryFailure(status, body = {}, error = {}) {
  const httpStatus = Number(status) || Number(error.status) || 500;
  const message = String(body?.error?.message || error.message || '');
  const code = body?.error?.code || error.code;
  if (httpStatus >= 500) return { httpStatus, code:'CLAIM_PREPARATION_UNAVAILABLE', reason:'Claim preparation failed. Review server diagnostics before retrying this note.' };
  if (httpStatus === 401 || httpStatus === 403) return { httpStatus, code:'BILLING_ACCESS_REQUIRED', reason:'The selected actor needs billing access to this agency.' };
  if (httpStatus === 404) return { httpStatus, code:'CLINICAL_RECORD_UNAVAILABLE', reason:'The linked note or session is unavailable in this client and agency scope.' };
  if (code === 'DIAGNOSIS_REVIEW_REQUIRED' || /primary diagnosis is required|diagnostic justification|diagnosis.*documentation/i.test(message)) return { httpStatus, code:'DIAGNOSIS_REVIEW_REQUIRED', reason:'The clinical signer must review diagnosis codes, individual justifications and required supporting evidence.' };
  if (code === 'INSURANCE_VERIFICATION_REQUIRED' || /insurance.*verif|coverage.*verif/i.test(message)) return { httpStatus, code:'INSURANCE_VERIFICATION_REQUIRED', reason:'Billing must verify current primary and secondary coverage.' };
  if (/version|amendment|signed|supervisor|service details|claim services/i.test(message)) return { httpStatus, code:'APPROVED_CLINICAL_VERSION_REQUIRED', reason:'Review the latest approved clinical version, signatures and service details before preparing the claim.' };
  return { httpStatus, code:'BILLING_PREPARATION_REVIEW_REQUIRED', reason:'Open the ready note in Billing and review its service lines, payer and provider configuration.' };
}
