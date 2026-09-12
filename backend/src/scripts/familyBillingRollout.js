#!/usr/bin/env node
/** Read-only by default. No secret values or patient data are printed. */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertFamilyBillingEncryption, decryptFamilyBilling, encryptFamilyBilling } from '../services/familyBillingEncryption.service.js';
import { isIntakeResponsesEncryptionConfigured, decryptIntakePayload } from '../services/intakeResponsesEncryption.service.js';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
class RolloutConfigurationError extends Error {}
const args = process.argv.slice(2);
const apply = args.includes('--apply');
let main, clinical;
const specs = [
  { table: 'guardian_insurance_profiles', field: 'private_payload', pending: 'private_payload IS NULL', context: r => `insurance:${r.agency_id}:${r.guardian_user_id}` },
  { table: 'guardian_payment_cards', field: 'private_payload', pending: 'private_payload IS NULL', context: r => `card:${r.agency_id}:${r.guardian_user_id}` },
  { table: 'clients', field: 'billing_insurance_payload', pending: 'billing_insurance_payload IS NULL AND (insurance_member_id IS NOT NULL OR insurance_group_number IS NOT NULL OR insurance_subscriber_name IS NOT NULL)', context: r => `client-insurance:${r.agency_id}:${r.id}` },
  { table: 'clinical_claims', field: 'insurance_payload', pending: 'insurance_payload IS NULL AND member_id IS NOT NULL', clinical: true, context: r => `claim-insurance:${r.agency_id}:${r.id}` },
  { table: 'intake_submissions', pending: 'payload_encrypted IS NULL AND (intake_data IS NOT NULL OR signer_name IS NOT NULL OR signer_initials IS NOT NULL OR signer_email IS NOT NULL OR signer_phone IS NOT NULL)' },
  { table: 'intake_submission_clients', pending: 'pii_encrypted IS NULL AND (full_name IS NOT NULL OR contact_phone IS NOT NULL)' }
];
async function counts() {
  const result = {};
  for (const spec of specs) {
    const [[row]] = await (spec.clinical ? clinical : main).query(`SELECT COUNT(*) AS pending FROM ${spec.table} WHERE ${spec.pending}`);
    result[spec.table] = Number(row.pending);
  }
  return result;
}
async function verifyExistingCiphertext() {
  // Check every existing family envelope before writing with a potentially wrong key.
  for (const spec of specs.filter(s => s.field)) {
    let cursor = 0, checked = 0;
    const db = spec.clinical ? clinical : main;
    for (;;) {
      const owner = spec.table.startsWith('guardian_') ? ', guardian_user_id' : '';
      const [rows] = await db.query(`SELECT id, agency_id${owner}, ${spec.field} FROM ${spec.table} WHERE ${spec.field} IS NOT NULL AND id > ? ORDER BY id LIMIT 100`, [cursor]);
      if (!rows.length) break;
      for (const row of rows) { decryptFamilyBilling(row[spec.field], spec.context(row)); cursor = row.id; checked++; }
    }
    console.log(`${spec.table}: authenticated ${checked} encrypted records`);
  }
  for (const [table, prefix] of [['intake_submissions', 'payload'], ['intake_submission_clients', 'pii']]) {
    let cursor = 0, checked = 0;
    for (;;) {
      const [rows] = await main.query(`SELECT id, ${prefix}_encrypted AS ciphertext, ${prefix}_iv_b64 AS ivB64, ${prefix}_auth_tag_b64 AS authTagB64, ${prefix}_key_id AS keyId FROM ${table} WHERE ${prefix}_encrypted IS NOT NULL AND id > ? ORDER BY id LIMIT 100`, [cursor]);
      if (!rows.length) break;
      for (const row of rows) { decryptIntakePayload(row); cursor = row.id; checked++; }
    }
    console.log(`${table}: authenticated ${checked} encrypted records`);
  }

}
function run(script, extra = []) {
  // Old backfills can log driver errors including SQL parameters. Suppress their output;
  // the wrapper reports aggregate counts and failure only.
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...extra], { env: process.env, stdio: 'ignore' });
  if (result.error || result.status !== 0) throw new RolloutConfigurationError(`Stopped at ${script}; inspect configuration without logging patient data, then rerun the read-only check.`);
}
try {
  if (args.some(a => a !== '--apply' && a !== '--backup-confirmed' && a !== '--writes-paused' && !a.startsWith('--confirm-databases='))) throw new RolloutConfigurationError('Unknown option. Default is read-only; see docs/security/family-billing-rollout.md.');
  if (!process.env.DB_NAME || !process.env.CLINICAL_DB_NAME || process.env.DB_NAME === process.env.CLINICAL_DB_NAME) throw new RolloutConfigurationError('Set explicit, distinct DB_NAME and CLINICAL_DB_NAME. No default database is accepted by this rollout tool.');
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) throw new RolloutConfigurationError('Set the intended DB_HOST, DB_USER and DB_PASSWORD before running this tool.');
  assertFamilyBillingEncryption();
  const probe = encryptFamilyBilling({ check: true }, 'rollout-preflight');
  if (!decryptFamilyBilling(probe, 'rollout-preflight').check) throw new RolloutConfigurationError('Family encryption self-check failed.');
  if (!isIntakeResponsesEncryptionConfigured()) throw new RolloutConfigurationError('The existing intake encryption key is required. Preserve it; do not replace it with the family billing key.');
  console.log(process.env.DOCUMENTS_KMS_KEY ? 'Document KMS resource configured; live access not checked.' : 'Document KMS resource is absent in this process. Database backfill can proceed; encrypted file uploads require separate KMS configuration.');
  if (process.env.FAMILY_BILLING_AUTOMATION_ENABLED === 'true') throw new RolloutConfigurationError('Disable family billing automation during the rollout.');
  if (apply && (!args.includes('--backup-confirmed') || !args.includes('--writes-paused') || !args.includes(`--confirm-databases=${process.env.DB_NAME},${process.env.CLINICAL_DB_NAME}`))) throw new RolloutConfigurationError('Apply requires --backup-confirmed --writes-paused and --confirm-databases=MAIN_NAME,CLINICAL_NAME matching the environment.');
  // Disable module startup connectivity probes; explicit queries below handle errors safely.
  process.env.SKIP_DB_CONNECT = '1';
  main = (await import('../config/database.js')).default;
  clinical = (await import('../config/clinicalDatabase.js')).default;
  const [[mainName]] = await main.query('SELECT DATABASE() AS name');
  const [[clinicalName]] = await clinical.query('SELECT DATABASE() AS name');
  if (mainName.name !== process.env.DB_NAME || clinicalName.name !== process.env.CLINICAL_DB_NAME) throw new RolloutConfigurationError('Connected databases do not match explicit configuration.');
  console.log(`Main database: ${mainName.name}; clinical database: ${clinicalName.name}`);
  // Check the actual required migrations across both database planes.
  await main.query('SELECT processor_intent_id FROM practitioner_packet_checkout_attempts LIMIT 0');
  for (const table of ['client_billing_payers', 'family_receivables', 'guardian_clinical_grants']) await main.query(`SELECT 1 FROM ${table} LIMIT 0`);
  await verifyExistingCiphertext();
  let pending = await counts();
  console.log('Legacy rows awaiting encryption:', JSON.stringify(pending));
  if (!apply) console.log('READ-ONLY CHECK COMPLETE. No records changed. This does not certify KMS/IAM, backups, or HIPAA compliance.');
  else {
    run('backfillFamilyBillingEncryption.js', ['--apply']);
    run('backfillEncryptIntakeSubmissions.js');
    while (pending.intake_submission_clients > 0) {
      run('backfillEncryptIntakeSubmissionClients.js');
      const next = await counts();
      if (next.intake_submission_clients >= pending.intake_submission_clients) throw new RolloutConfigurationError('Intake client backfill made no progress; stop and review remaining rows.');
      pending = next;
    }
    await verifyExistingCiphertext();
    const after = await counts();
    console.log('Remaining legacy rows:', JSON.stringify(after));
    if (Object.values(after).some(n => n > 0)) throw new RolloutConfigurationError('Legacy rows remain. Keep the rollout paused and review.');
    console.log('Database backfills complete. No payer permissions granted, messages sent, or automatic payments enabled.');
  }
} catch (error) {
  // Driver errors can contain sensitive SQL parameters; never print them.
  console.error(error instanceof RolloutConfigurationError ? error.message : 'Rollout check failed. Verify database configuration, both migration sets, and existing encryption keys. Raw errors are suppressed to protect patient data.');
  process.exitCode = 1;
} finally { await Promise.allSettled([main?.end(), clinical?.end()]); }
