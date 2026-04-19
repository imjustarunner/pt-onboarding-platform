#!/usr/bin/env node
/**
 * Backfill: encrypt existing plaintext PII on intake_submission_clients
 * (full_name, contact_phone) into the new pii_encrypted column added by
 * migration 726. Idempotent — only touches rows where pii_encrypted IS NULL
 * AND there's plaintext to encrypt.
 *
 * Usage:
 *   node src/scripts/backfillEncryptIntakeSubmissionClients.js [--dry-run] [--limit=500]
 */
import pool from '../config/database.js';
import {
  encryptIntakePayload,
  isIntakeResponsesEncryptionConfigured
} from '../services/intakeResponsesEncryption.service.js';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = (() => {
  const arg = argv.find((a) => a.startsWith('--limit='));
  if (!arg) return 1000;
  const n = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
})();

async function main() {
  if (!isIntakeResponsesEncryptionConfigured()) {
    console.error('ERROR: INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 (or fallback) is not configured. Aborting.');
    process.exit(1);
  }

  const [rows] = await pool.query(
    `SELECT id, full_name, contact_phone
     FROM intake_submission_clients
     WHERE pii_encrypted IS NULL
       AND (full_name IS NOT NULL OR contact_phone IS NOT NULL)
     ORDER BY id ASC
     LIMIT ${Number(LIMIT)}`
  );

  console.log(`Found ${rows.length} intake_submission_clients rows with plaintext PII (limit=${LIMIT}, dryRun=${DRY_RUN})`);

  let encrypted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.full_name && !row.contact_phone) { skipped += 1; continue; }
    const enc = encryptIntakePayload({
      fullName: row.full_name ?? null,
      contactPhone: row.contact_phone ?? null
    });
    if (DRY_RUN) {
      encrypted += 1;
      continue;
    }
    await pool.execute(
      `UPDATE intake_submission_clients
          SET pii_encrypted = ?,
              pii_iv_b64 = ?,
              pii_auth_tag_b64 = ?,
              pii_key_id = ?,
              full_name = NULL,
              contact_phone = NULL
        WHERE id = ? AND pii_encrypted IS NULL`,
      [enc.ciphertext, enc.ivB64, enc.authTagB64, enc.keyId, row.id]
    );
    encrypted += 1;
  }

  console.log(`Done. encrypted=${encrypted} skipped=${skipped} dryRun=${DRY_RUN}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
