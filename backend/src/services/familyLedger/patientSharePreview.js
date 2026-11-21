import pool from '../../config/database.js';
import { automaticBenefitFacts } from '../billingBenefitsEmailContent.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { coverageDate, coverageFingerprint, listCoverageEvidence } from '../coverageVerification.service.js';
import { auditBilling, billingError } from '../familyBillingPolicy.service.js';
import { cents, requireClient } from './policy.js';

export function estimatePatientShare({ insurance, coverage, serviceDate, allowedAmountCents, now }) {
  const check = coverage.checks[0];
  if (coverage.discoveryPending || (coverage.latestReview && coverage.latestReview.status !== 'verified')
    || check?.evidence?.summary?.otherCoverageReported) {
    throw billingError(409, 'Resolve the outstanding coverage findings before estimating the patient share.');
  }
  if (!check || Number(check.id) !== coverage.latestCheckId || check.policy_slot !== 'primary'
    || check.status !== 'returned' || check.insurance_fingerprint !== coverageFingerprint(insurance)
    || check.evidence?.summary?.status !== 'active_reported' || check.evidence?.summary?.identityMatches !== true) {
    throw billingError(409, 'An active eligibility response for the current primary policy and date of service is required.');
  }
  const { ready, facts } = automaticBenefitFacts({ insurance, result: check.evidence.result, serviceDate, now });
  if (!ready || facts.copayCents !== 0) {
    throw billingError(409, 'Review the plan benefits. This estimate requires current individual in-network mental health benefits, a confirmed zero copay, and explicit deductible and coinsurance amounts.');
  }
  const deductibleAppliedCents = Math.min(allowedAmountCents, facts.deductibleRemainingCents);
  const coinsuranceCents = Math.round((allowedAmountCents - deductibleAppliedCents) * facts.coinsuranceBasisPoints / 10000);
  return {
    serviceDate,
    coverageCheckId: Number(check.id),
    allowedAmountCents,
    deductibleAppliedCents,
    deductibleRemainingCents: facts.deductibleRemainingCents,
    coinsuranceBasisPoints: facts.coinsuranceBasisPoints,
    coinsuranceCents,
    estimatedPatientCents: deductibleAppliedCents + coinsuranceCents
  };
}

export async function previewPatientShare({ agencyId, clientId, userId, serviceDate, allowedAmountCents, allowedAmountSource, standardCostShareConfirmed }, db = pool) {
  const date = coverageDate(serviceDate);
  if (!Number.isSafeInteger(allowedAmountCents)) throw billingError(400, 'Enter an allowed amount in whole cents.');
  const allowed = cents(allowedAmountCents);
  if (!['negotiated_rate', 'matching_remittance'].includes(allowedAmountSource)) {
    throw billingError(400, 'Select where you confirmed the allowed amount.');
  }
  if (standardCostShareConfirmed !== true) {
    throw billingError(400, 'Confirm how the plan applies the deductible and coinsurance to this service.');
  }
  await requireClient(agencyId, clientId, db);
  const insurance = await readClientInsurance(clientId, agencyId, db);
  const coverage = await listCoverageEvidence({ agencyId, clientId, serviceDate: date }, db);
  const estimate = estimatePatientShare({ insurance, coverage, serviceDate: date, allowedAmountCents: allowed });
  await auditBilling({ agencyId, userId, clientId, action: 'insured_visit_share_previewed', objectId: estimate.coverageCheckId }, db);
  return { ...estimate, allowedAmountSource };
}
