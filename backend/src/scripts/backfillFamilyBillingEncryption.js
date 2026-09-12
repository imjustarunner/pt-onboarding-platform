/** Additive migrations 1413 and clinical 014 must precede this script.
 * Dry run: node src/scripts/backfillFamilyBillingEncryption.js
 * Apply:   node src/scripts/backfillFamilyBillingEncryption.js --apply
 * Does not grant payer access or enable automatic payments. No PHI is logged.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
// Standalone scripts own their connection lifecycle; do not start server retries.
process.env.SKIP_DB_CONNECT = '1';
let pool, clinicalPool, PRIVATE_INSURANCE_COLUMNS, insurancePayload, PRIVATE_CARD_COLUMNS;
let phase = 'configuration';
import { assertFamilyBillingEncryption, encryptFamilyBilling } from '../services/familyBillingEncryption.service.js';

const apply = process.argv.includes('--apply');
const batchSize = 100;
async function batches(db, sql, handle) {
  let lastId=0, count=0;
  while(true){const [rows]=await db.execute(`${sql} AND id > ? ORDER BY id LIMIT ${batchSize}`,[lastId]);if(!rows.length)break;for(const row of rows){await handle(row);lastId=row.id;count++;}}
  return count;
}
async function run() {
  if (apply) {
    phase = 'encryption key';
    assertFamilyBillingEncryption();
  }
  phase = 'database connection/schema';
  pool = (await import('../config/database.js')).default;
  clinicalPool = (await import('../config/clinicalDatabase.js')).default;
  ({ PRIVATE_INSURANCE_COLUMNS, insurancePayload } = await import('../models/GuardianInsuranceProfile.model.js'));
  ({ PRIVATE_CARD_COLUMNS } = await import('../models/GuardianPaymentCard.model.js'));

  const specifications=[['guardian_insurance_profiles','private_payload'],['guardian_payment_cards','private_payload'],['clients','billing_insurance_payload']];
  if(!apply){for(const [table,column] of specifications){const [rows]=await pool.execute(`SELECT COUNT(*) AS pending FROM ${table} WHERE ${column} IS NULL${table === 'clients' ? ' AND (insurance_member_id IS NOT NULL OR insurance_group_number IS NOT NULL OR insurance_subscriber_name IS NOT NULL)' : ''}`);console.log(`${table}: ${rows[0].pending} rows without encrypted payload`);}const [rows]=await clinicalPool.execute('SELECT COUNT(*) AS pending FROM clinical_claims WHERE member_id IS NOT NULL AND insurance_payload IS NULL');console.log(`clinical_claims: ${rows[0].pending} legacy identifiers`);console.log('Dry run only. No records changed.');return;}
  assertFamilyBillingEncryption();
  let count=await batches(pool,'SELECT * FROM guardian_insurance_profiles WHERE private_payload IS NULL',async row=>{
    const policy = prefix=>({insurerName:row[`${prefix}_insurer_name`],memberId:row[`${prefix}_member_id`],groupNumber:row[`${prefix}_group_number`],subscriberName:row[`${prefix}_subscriber_name`],isMedicaid:!!row[`${prefix}_is_medicaid`]});
    const payload={...insurancePayload({primary:policy('primary'),secondary:row.secondary_insurer_name?policy('secondary'):null}),...Object.fromEntries(PRIVATE_INSURANCE_COLUMNS.map(key=>[key,row[key]])),coverageScope:'client',legacyRequiresReview:true};
    await pool.execute(`UPDATE guardian_insurance_profiles SET private_payload = ?, ${PRIVATE_INSURANCE_COLUMNS.map(c=>`${c} = ${c.endsWith('_is_medicaid')?'0':'NULL'}`).join(', ')} WHERE id = ? AND private_payload IS NULL`,[encryptFamilyBilling(payload,`insurance:${row.agency_id}:${row.guardian_user_id}`),row.id]);
  });console.log(`Insurance profiles encrypted: ${count}`);
  count=await batches(pool,'SELECT * FROM guardian_payment_cards WHERE private_payload IS NULL',async row=>{
    const [merchants]=await pool.execute('SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id = ?',[row.agency_id]);
    const payload={...Object.fromEntries(PRIVATE_CARD_COLUMNS.map(key=>[key,row[key]])),connected_account_id:merchants[0]?.stripe_connect_account_id || null,legacyRequiresReview:true};
    await pool.execute(`UPDATE guardian_payment_cards SET private_payload = ?, auto_charge = 0, ${PRIVATE_CARD_COLUMNS.map(c=>`${c} = NULL`).join(', ')} WHERE id = ? AND private_payload IS NULL`,[encryptFamilyBilling(payload,`card:${row.agency_id}:${row.guardian_user_id}`),row.id]);
  });console.log(`Payment references encrypted; legacy auto-charge disabled: ${count}`);
  count=await batches(pool,"SELECT * FROM clients WHERE billing_insurance_payload IS NULL AND (insurance_member_id IS NOT NULL OR insurance_subscriber_name IS NOT NULL OR insurance_group_number IS NOT NULL)",async row=>{
    const payload={primary:{insurerName:row.primary_insurer_name,memberId:row.insurance_member_id,groupNumber:row.insurance_group_number,subscriberName:row.insurance_subscriber_name},secondary:null,patient:{},verifiedForClaims:false,legacyRequiresReview:true};
    await pool.execute('UPDATE clients SET billing_insurance_payload = ?, insurance_member_id = NULL, insurance_group_number = NULL, insurance_subscriber_name = NULL WHERE id = ? AND billing_insurance_payload IS NULL',[encryptFamilyBilling(payload,`client-insurance:${row.agency_id}:${row.id}`),row.id]);
  });console.log(`Client insurance identifiers encrypted: ${count}`);
  count=await batches(clinicalPool,'SELECT id, agency_id, member_id, payer_name FROM clinical_claims WHERE insurance_payload IS NULL AND member_id IS NOT NULL',async row=>{
    await clinicalPool.execute('UPDATE clinical_claims SET insurance_payload = ?, member_id = NULL WHERE id = ? AND insurance_payload IS NULL',[encryptFamilyBilling({primary:{memberId:row.member_id,insurerName:row.payer_name},legacyRequiresReview:true},`claim-insurance:${row.agency_id}:${row.id}`),row.id]);
  });console.log(`Claim insurance identifiers encrypted: ${count}`);
}
try { await run(); }
catch (e) {
  if (phase === 'encryption key') console.error('Family billing key is missing or invalid in this process. Set FAMILY_BILLING_ENCRYPTION_KEY_BASE64 to the same 32-byte base64 key used in GitHub/Cloud Run, and FAMILY_BILLING_ENCRYPTION_KEY_ID=v1. GitHub secrets do not populate your local terminal. Never print or paste the key into chat.');
  else console.error('Family billing backfill stopped during database/schema access or encryption. Check the proxy connection and both migration sets with npm run billing:check. Raw errors are suppressed to protect patient data. Completed batches may have been saved; use the same keys when resuming.');
  process.exitCode = 1;
} finally { await Promise.allSettled([pool?.end(), clinicalPool?.end()]); }
