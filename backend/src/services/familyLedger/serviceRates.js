import pool from '../../config/database.js';
import { billingError, positiveId, auditBilling } from '../familyBillingPolicy.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import { insuranceFingerprint } from './readiness.js';
import { cents, dateOnly, transaction } from './policy.js';

export function serviceCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw billingError(400, 'Enter a service code');
  return code;
}
export function serviceTotal(amount, basis, units) {
  const count = Number(units);
  if (!['visit', 'unit'].includes(basis) || !Number.isSafeInteger(count) || count < 1 || count > 100)
    throw billingError(400, 'Choose a price basis and between 1 and 100 whole units');
  return cents(cents(amount) * (basis === 'unit' ? count : 1));
}
export async function listServiceRates(agencyId, db = pool) {
  const [rows] = await db.execute('SELECT service_code AS serviceCode,amount_cents AS amountCents,price_basis AS priceBasis,revision FROM agency_patient_service_rates WHERE agency_id=? ORDER BY service_code', [positiveId(agencyId)]);
  return rows;
}
export async function saveServiceRate({ agencyId, serviceCode: code, amountCents, priceBasis, revision = 0, reason, actorUserId }) {
  code = serviceCode(code);
  const amount = amountCents === null ? null : cents(amountCents);
  if (!['visit', 'unit'].includes(priceBasis) || !String(reason || '').trim()) throw billingError(400, 'Choose a price basis and record the reason');
  return transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    const [rows] = await db.execute('SELECT revision FROM agency_patient_service_rates WHERE agency_id=? AND service_code=? FOR UPDATE', [agencyId, code]);
    if (Number(revision) !== Number(rows[0]?.revision || 0)) throw billingError(409, 'This price changed. Refresh before saving.');
    const next = Number(revision) + 1;
    await db.execute('INSERT INTO agency_patient_service_rates (agency_id,service_code,amount_cents,price_basis,revision,updated_by_user_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount_cents=VALUES(amount_cents),price_basis=VALUES(price_basis),revision=VALUES(revision),updated_by_user_id=VALUES(updated_by_user_id)', [agencyId, code, amount, priceBasis, next, actorUserId]);
    await db.execute('INSERT INTO agency_patient_service_rate_history (agency_id,service_code,revision,amount_cents,price_basis,reason,actor_user_id) VALUES (?,?,?,?,?,?,?)', [agencyId, code, next, amount, priceBasis, String(reason).trim().slice(0,2000), actorUserId]);
    await auditBilling({ agencyId, userId: actorUserId, action: 'patient_service_rate_saved' }, db);
    return { serviceCode: code, amountCents: amount, priceBasis, revision: next };
  });
}

// The signed task holds an immutable price/coverage snapshot. Browser prices are
// never trusted for self-pay, and estimates never become collectible balances here.
export async function snapshotServiceTerms({ agencyId, clientIds, serviceTerms = [] }, db = pool) {
  if (!Array.isArray(serviceTerms) || serviceTerms.length > 30) throw billingError(400, 'Select at most 30 service terms');
  const rates = serviceTerms.length ? await listServiceRates(agencyId, db) : [];
  const seen = new Set(), result = [];
  for (const input of serviceTerms) {
    const clientId = positiveId(input.clientId), code = serviceCode(input.serviceCode);
    if (!clientIds.map(Number).includes(clientId) || seen.has(`${clientId}:${code}`)) throw billingError(400, 'Each service must belong to one of the selected clients and appear only once');
    seen.add(`${clientId}:${code}`);
    if (!['self_pay', 'copay'].includes(input.paymentBasis)) throw billingError(400, 'Choose self-pay or a verified copay');
    const insurance = await readClientInsurance(clientId, agencyId, db);
    if (hasMedicaidCoverage(insurance)) throw billingError(409, 'Do not assign patient service charges to Medicaid-protected care');
    if (input.paymentBasis === 'self_pay' && (insurance?.primary?.memberId || insurance?.secondary?.memberId)) throw billingError(409, 'Resolve recorded coverage before assigning self-pay terms');
    if (input.paymentBasis === 'copay' && (!insurance?.primary?.memberId || insurance?.secondary)) throw billingError(409, 'Verify primary benefits; secondary coverage requires final payer responsibility review');
    const rate = rates.find(r => r.serviceCode === code);
    if (input.paymentBasis === 'self_pay' && rate?.amountCents == null) throw billingError(409, `Set an explicit self-pay rate for ${code} first`);
    if (input.paymentBasis === 'self_pay' && Number(input.rateRevision) !== Number(rate.revision)) throw billingError(409, 'The service price changed. Refresh and review it before creating the task.');
    if (!String(input.evidence || '').trim()) throw billingError(400, 'Document the agreed self-pay terms or verified copay benefit');
    const amount = input.paymentBasis === 'self_pay' ? Number(rate.amountCents) : cents(input.amountCents);
    const basis = input.paymentBasis === 'self_pay' ? rate.priceBasis : 'visit';
    const units = input.paymentBasis === 'copay' ? 1 : Number(input.units || 1);
    result.push({ clientId, serviceCode: code, paymentBasis: input.paymentBasis, amountCents: amount,
      priceBasis: basis, units, totalCents: serviceTotal(amount,basis,units),
      effectiveFrom: dateOnly(input.effectiveFrom), effectiveThrough: dateOnly(input.effectiveThrough),
      rateRevision: input.paymentBasis === 'self_pay' ? rate.revision : null,
      insuranceFingerprint: insuranceFingerprint(insurance), evidence: String(input.evidence).trim().slice(0,2000) });
    if (result.at(-1).effectiveThrough < result.at(-1).effectiveFrom) throw billingError(400, 'The end date must follow the start date');
  }
  return result;
}
export async function assertServiceTermsCurrent(terms, agencyId, db = pool) {
  for (const term of terms || []) {
    const insurance = await readClientInsurance(term.clientId, agencyId, db);
    if (hasMedicaidCoverage(insurance) || term.insuranceFingerprint !== insuranceFingerprint(insurance))
      throw billingError(409, 'Coverage changed. Ask billing for updated service terms before signing.');
  }
}
