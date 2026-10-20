// Fictional guardian experience data only. The caller owns the transaction.
// Direct inserts never invoke processors, consent capture, claims, or notifications.
import crypto from 'node:crypto';
import { encryptFamilyBilling, decryptFamilyBilling } from '../services/familyBillingEncryption.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import { guardianExperienceAppointmentDates, guardianExperienceClinicalDefaults } from './guardianExperienceClinicalFixture.mjs';

const guardianEmail = 'guardian-test-bennett-20261020@example.com';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
// Match familyLedger/readiness.js without importing modules that open database pools.
const insuranceFingerprint = insurance => crypto.createHash('sha256')
  .update(JSON.stringify(canonical({ primary: insurance?.primary || null, secondary: insurance?.secondary || null }))).digest('hex');

/**
 * Seed the two office children's fictional copays and an expired display-only card
 * per agency. Insurance and guardian relationships must already exist.
 * Pass production BILLING_TERMS and BILLING_TERMS_VERSION as billingTerms and
 * billingTermsVersion; injection avoids opening database pools in this helper.
 */
export async function seedGuardianExperienceFinancial({
  db, actorId, guardianId, clients, run, billingTerms, billingTermsVersion, now = new Date()
}) {
  if (!/^[a-zA-Z0-9_-]{4,40}$/.test(String(run || ''))) throw new Error('A safe, unique fixture run ID is required.');
  if (!(now instanceof Date) || !Number.isFinite(+now)) throw new Error('A valid fixture date is required.');
  if (!Number.isSafeInteger(Number(actorId)) || Number(actorId) < 1) throw new Error('A valid audit actor is required.');
  if (typeof billingTerms !== 'string' || !billingTerms.trim()
    || typeof billingTermsVersion !== 'string' || !billingTermsVersion.trim() || billingTermsVersion.length > 80) {
    throw new Error('Pass the production billing terms and version.');
  }
  if (!Array.isArray(clients) || clients.length !== 3 || new Set(clients.map(client => Number(client.id))).size !== 3) {
    throw new Error('This fixture requires exactly three distinct fictional children.');
  }
  const [[guardian]] = await db.execute('SELECT id,is_demo,role,email,first_name,last_name FROM users WHERE id=?', [guardianId]);
  if (Number(guardian?.is_demo) !== 1 || guardian.role !== 'client_guardian'
    || String(guardian.email).toLowerCase() !== guardianEmail) {
    throw new Error('Refusing to seed financial fixtures for an unexpected or non-demo guardian.');
  }
  const contexts = new Set();
  const offices = [];
  for (const client of clients) {
    const context = `${Number(client.agencyId)}:${client.setting}`;
    if (!['2:office', '6:office', '2:school'].includes(context) || contexts.has(context)) {
      throw new Error('Include one ITSCO office, one NLU office, and one ITSCO school child.');
    }
    contexts.add(context);
    const [[stored]] = await db.execute('SELECT id,agency_id,organization_id,is_demo,billing_insurance_payload FROM clients WHERE id=?', [client.id]);
    const [[link]] = await db.execute('SELECT id FROM client_guardians WHERE client_id=? AND guardian_user_id=? AND access_enabled=1',
      [client.id, guardianId]);
    if (Number(stored?.is_demo) !== 1 || Number(stored.agency_id) !== Number(client.agencyId) || !link
      || (client.setting === 'school' && Number(stored.organization_id) !== 376)) {
      throw new Error('Refusing to modify a real, differently scoped, or unrelated client.');
    }
    const [[existing]] = await db.execute(`SELECT
      EXISTS(SELECT 1 FROM family_receivables WHERE agency_id=? AND client_id=?) AS has_receivable,
      EXISTS(SELECT 1 FROM client_billing_payers WHERE agency_id=? AND client_id=?) AS has_payer,
      EXISTS(SELECT 1 FROM client_billing_readiness WHERE agency_id=? AND client_id=?) AS has_readiness`,
    [client.agencyId, client.id, client.agencyId, client.id, client.agencyId, client.id]);
    if (Number(existing?.has_receivable) || Number(existing?.has_payer) || Number(existing?.has_readiness)) {
      throw new Error('Use fresh demo children; existing financial records are never overwritten.');
    }
    if (client.setting === 'school') continue;
    const insurance = decryptFamilyBilling(stored.billing_insurance_payload, `client-insurance:${client.agencyId}:${client.id}`);
    if (!insurance?.primary?.memberId || hasMedicaidCoverage(insurance)) {
      throw new Error('Office copay fixtures require fictional commercial insurance without Medicaid.');
    }
    offices.push({ client, fingerprint: insuranceFingerprint(insurance) });
  }
  // Preflight every agency before any writes so this helper cannot partially
  // modify an existing demo family even when called without a transaction.
  for (const { client } of offices) {
    const [[existing]] = await db.execute('SELECT id FROM guardian_payment_cards WHERE guardian_user_id=? AND agency_id=? LIMIT 1',
      [guardianId, client.agencyId]);
    if (existing) throw new Error('Use a fresh demo guardian; existing cards are never overwritten.');
    const [[existingTask]] = await db.execute('SELECT id FROM family_billing_tasks WHERE guardian_user_id=? AND agency_id=? LIMIT 1',
      [guardianId, client.agencyId]);
    if (existingTask) throw new Error('Use a fresh demo guardian; existing billing tasks are never overwritten.');
  }

  const output = [];
  for (const { client, fingerprint } of offices) {
    const agencyId = Number(client.agencyId);
    const evidence = {
      fictionalDemo: true, fixtureRun: run,
      reason: 'FICTIONAL TEST DATA: synthetic copays for guardian portal testing; no real insurer verification or payment authorization.',
      at: now.toISOString()
    };
    const [card] = await db.execute(`INSERT INTO guardian_payment_cards
      (guardian_user_id,agency_id,payment_provider,private_payload,auto_charge,is_default,is_active)
      VALUES (?,?,'STRIPE',?,0,1,1)`,
    [guardianId, agencyId, encryptFamilyBilling({
      fictionalDemo: true, fixtureRun: run,
      card_brand: 'Visa', card_last4: '4242', card_exp_month: '09', card_exp_year: '2025',
      cardholder_name: `${guardian.first_name || 'Jordan'} ${guardian.last_name || 'Bennett'}`.trim()
    }, `card:${agencyId}:${guardianId}`)]);
    await db.execute(`INSERT INTO client_billing_payers
      (agency_id,client_id,guardian_user_id,status,payment_card_id,consent_id,recurring_limit_cents)
      VALUES (?,?,?,'active',?,NULL,NULL)`, [agencyId, client.id, guardianId, card.insertId]);
    await db.execute(`INSERT INTO client_billing_readiness
      (agency_id,client_id,coverage_mode,setup_status,collection_policy,insurance_fingerprint,automatic_from,evidence_encrypted,updated_by_user_id)
      VALUES (?,?,'insured','ready','manual',?,NULL,?,?)`,
    [agencyId, client.id, fingerprint, encryptFamilyBilling(evidence, `billing-readiness:${agencyId}:${client.id}`), actorId]);
    const expiresAt = new Date(+now + 7 * 86400000);
    const billingTaskToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(billingTaskToken).digest('hex');
    const [billingTask] = await db.execute(`INSERT INTO family_billing_tasks
      (agency_id,guardian_user_id,client_ids_json,title,status,token_hash,expires_at,require_card,terms_version,waiver_encrypted,created_by_user_id)
      VALUES (?,?,?,'Update expired payment card — Demo','pending',?,?,1,?,?,?)`,
    [agencyId, guardianId, JSON.stringify([Number(client.id)]), tokenHash, expiresAt, billingTermsVersion,
      encryptFamilyBilling({
        serviceTerms: [], terms: billingTerms, version: billingTermsVersion,
        additionalTerms: 'FICTIONAL TEST DATA: this demo payment card is expired and cannot be charged. This pending task lets you review the guardian card-update experience. No payment authorization or signature has been recorded.',
        fictionalDemo: true, fixtureRun: run
      }, `billing-task:${agencyId}:${guardianId}`), actorId]);

    const defaults = agencyId === 2 ? guardianExperienceClinicalDefaults.itscoOffice : guardianExperienceClinicalDefaults.nluOffice;
    const visitCount = agencyId === 2 ? 2 : 1;
    const amountCents = agencyId === 2 ? 2500 : 3000;
    const visits = guardianExperienceAppointmentDates({ now, weekday: defaults.weekday, hour: defaults.hour })
      .filter(visit => visit.status === 'completed').slice(-visitCount);
    const balances = [];
    for (const [index, visit] of visits.entries()) {
      const sourceKey = `${run}:${client.id}:copay:${index + 1}`;
      const [receivable] = await db.execute(`INSERT INTO family_receivables
        (agency_id,client_id,source_type,source_key,service_domain,service_label,service_date,amount_cents,currency,due_date,
          status,insurance_reviewed,hold_reason,source_payload,created_by_user_id,insurance_fingerprint)
        VALUES (?,?,'guardian_demo_copay',?,'clinical','Office visit copay — FICTIONAL DEMO',?,?,'USD',?,'open',1,NULL,?,?,?)`,
      [agencyId, client.id, sourceKey, visit.dateOfService, amountCents, visit.dateOfService,
        encryptFamilyBilling({ ...evidence, responsibilityType: 'copay', verificationBasis: 'fictional_demo' },
          `receivable:${agencyId}:${client.id}`), actorId, fingerprint]);
      const [allocation] = await db.execute(`INSERT INTO family_receivable_allocations
        (agency_id,receivable_id,payer_user_id,amount_cents,paid_cents,share_basis_points,share_basis)
        VALUES (?,?,?,?,0,10000,'total')`, [agencyId, receivable.insertId, guardianId, amountCents]);
      balances.push({
        receivableId: receivable.insertId, allocationId: allocation.insertId,
        serviceDate: visit.dateOfService, dueDate: visit.dateOfService, amountCents, paidCents: 0
      });
    }
    output.push({
      clientId: Number(client.id), agencyId, paymentCardId: card.insertId, billingTaskId: billingTask.insertId,
      // Caller must keep this bearer link in private output; never log it.
      billingTaskToken,
      totalDueCents: balances.reduce((sum, balance) => sum + balance.amountCents, 0), balances
    });
  }
  return { clients: output, totalDueCents: output.reduce((sum, client) => sum + client.totalDueCents, 0) };
}
