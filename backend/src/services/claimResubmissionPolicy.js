const parseObject = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const policyError = (status, message) => Object.assign(new Error(message), { status });

export const kinds = { original_retry: '1', replacement: '7', void: '8' };
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Claim.MD's published field list identifies frequency_code (1/7/8) and
// icn_dcn_1 (payer control number, at most 32 characters). A new local record
// preserves the original claim and submission/payment audit trail.
export function claimResubmissionFields(claim) {
  const entry = parseObject(claim.metadata_json).resubmission;
  if (!entry) return { frequency_code: '1' };
  const frequency = kinds[entry.kind];
  if (!frequency || !positiveId(entry.sourceClaimId)) throw policyError(409, 'The linked resubmission record is invalid. Reopen billing review.');
  if (frequency !== '1' && !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,31}$/.test(String(entry.payerControlNumber || ''))) throw policyError(409, 'A valid original payer claim/control number is required for a replacement or void.');
  return { frequency_code: frequency, ...(frequency !== '1' ? { icn_dcn_1: entry.payerControlNumber } : {}) };
}

export function validateResubmissionRequest(source, input) {
  if (!kinds[input.kind] || input.attested !== true || String(input.reason || '').trim().length < 10 || String(input.reason).length > 2000) throw policyError(400, 'Select the resubmission type, explain its reason and attest to the source claim review.');
  if (Number(source.billing_revision) !== Number(input.revision)) throw policyError(409, 'The source claim changed. Reopen its billing history.');
  if (input.kind === 'original_retry') {
    if (source.claim_lifecycle !== 'rejected') throw policyError(409, 'An original retry is only available after a confirmed rejection. Accepted claims need payer-specific correction review.');
  } else {
    if (!['paid', 'denied', 'adjusted'].includes(source.claim_lifecycle)) throw policyError(409, 'Wait for payer adjudication before preparing a replacement or void.');
    if (input.payerSupportsElectronicCorrection !== true) throw policyError(400, 'Confirm that this payer accepts the selected electronic correction type.');
    if (/medicare/i.test(source.payer_name || '')) throw policyError(409, 'Medicare adjudicated claims require the payer appeal/correction process; an electronic replacement or void is unavailable here.');
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,31}$/.test(String(input.payerControlNumber || ''))) throw policyError(400, 'Enter the original payer claim/control number from the ERA or EOB (up to 32 characters).');
  }
}
