/**
 * Backfill: encrypt every legacy intake_submissions row.
 *
 * After migration 725_intake_submissions_payload_encryption.sql runs, existing
 * rows still hold their PHI in the plaintext columns (intake_data,
 * signer_name, signer_initials, signer_email, signer_phone). This script
 * encrypts each of those rows into payload_encrypted/IV/tag/keyId and then
 * NULLs out the plaintext columns, leaving only the ciphertext at rest.
 *
 * Idempotent: rows that already have payload_encrypted are skipped. Rows with
 * no sensitive data (status='started' shells, etc.) are skipped.
 *
 * Usage:
 *   node backend/src/scripts/backfillEncryptIntakeSubmissions.js          # apply
 *   node backend/src/scripts/backfillEncryptIntakeSubmissions.js --dry-run
 *   node backend/src/scripts/backfillEncryptIntakeSubmissions.js --batch=200
 *
 * Requires INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 (or
 * GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64) to be set.
 */
import pool from '../config/database.js';
import {
  buildIntakePayloadEnvelope,
  encryptIntakePayload,
  isIntakeResponsesEncryptionConfigured
} from '../services/intakeResponsesEncryption.service.js';

function parseArgs(argv) {
  const out = { dryRun: false, batch: 200, limit: null };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    else if (a.startsWith('--batch=')) out.batch = Math.max(1, Number(a.split('=')[1]) || 200);
    else if (a.startsWith('--limit=')) out.limit = Math.max(1, Number(a.split('=')[1]) || 0);
  }
  return out;
}

async function main() {
  const { dryRun, batch, limit } = parseArgs(process.argv.slice(2));

  if (!isIntakeResponsesEncryptionConfigured()) {
    console.error(
      '\n[backfill] No encryption key configured. Set INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64'
      + ' (or GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64) and re-run.\n'
    );
    process.exit(2);
  }

  const [[stats]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN payload_encrypted IS NOT NULL THEN 1 ELSE 0 END) AS already_encrypted,
       SUM(CASE WHEN payload_encrypted IS NULL AND (
         intake_data IS NOT NULL
         OR signer_name IS NOT NULL
         OR signer_initials IS NOT NULL
         OR signer_email IS NOT NULL
         OR signer_phone IS NOT NULL
       ) THEN 1 ELSE 0 END) AS pending
     FROM intake_submissions`
  );
  console.log(`[backfill] intake_submissions — total=${stats.total} encrypted=${stats.already_encrypted} pending=${stats.pending}`);
  if (!Number(stats.pending || 0)) {
    console.log('[backfill] Nothing to do.');
    process.exit(0);
  }
  if (dryRun) console.log('[backfill] DRY RUN — no rows will be modified.\n');

  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  let failed = 0;
  let lastId = 0;

  for (;;) {
    if (limit && processed >= limit) break;
    const fetchSize = Math.min(batch, limit ? Math.max(1, limit - processed) : batch);
    const [rows] = await pool.query(
      `SELECT id, intake_data, signer_name, signer_initials, signer_email, signer_phone
         FROM intake_submissions
        WHERE id > ?
          AND payload_encrypted IS NULL
          AND (
            intake_data IS NOT NULL
            OR signer_name IS NOT NULL
            OR signer_initials IS NOT NULL
            OR signer_email IS NOT NULL
            OR signer_phone IS NOT NULL
          )
        ORDER BY id ASC
        LIMIT ${fetchSize}`,
      [lastId]
    );
    if (!rows.length) break;

    for (const row of rows) {
      processed += 1;
      lastId = row.id;
      try {
        const envelope = buildIntakePayloadEnvelope(row);
        const enc = encryptIntakePayload(envelope);
        if (!dryRun) {
          await pool.execute(
            `UPDATE intake_submissions
                SET payload_encrypted = ?,
                    payload_iv_b64 = ?,
                    payload_auth_tag_b64 = ?,
                    payload_key_id = ?,
                    intake_data = NULL,
                    signer_name = NULL,
                    signer_initials = NULL,
                    signer_email = NULL,
                    signer_phone = NULL
              WHERE id = ?
                AND payload_encrypted IS NULL`,
            [enc.ciphertext, enc.ivB64, enc.authTagB64, enc.keyId, row.id]
          );
        }
        encrypted += 1;
        if (encrypted % 50 === 0) {
          console.log(`[backfill] ...${encrypted} encrypted (last id=${row.id})`);
        }
      } catch (e) {
        failed += 1;
        console.error(`[backfill] FAILED id=${row.id}:`, e?.message || e);
      }
    }

    if (rows.length < fetchSize) break;
  }

  skipped = processed - encrypted - failed;
  console.log(
    `\n[backfill] done — processed=${processed} encrypted=${encrypted} failed=${failed} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
