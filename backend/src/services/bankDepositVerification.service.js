import crypto from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { resolveClaimMdConnection, requireClaimMdTransmission } from './claimMdConnection.service.js';
import { fetchEraList, fetchEraData } from './claimMd.service.js';
import { assertExclusiveClaimMdTaxId, listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { billingError, auditBilling } from './familyBillingPolicy.service.js';

const context = (agencyId, eraKey) => `bank-era:${agencyId}:${eraKey}`;
export function eraDepositEvidence(era, taxId, npis) {
  const amount = String(era?.paid_amount || '');
  if (String(era?.prov_taxid || '').replace(/\D/g, '') !== taxId || !npis.includes(String(era.prov_npi))) throw billingError(409, 'ERA payee does not match this agency’s billing identity');
  if (String(era.check_type).toLowerCase() !== 'eft' || !/^\d{1,10}(\.\d{1,2})?$/.test(amount) || !/^[A-Za-z0-9-]{6,50}$/.test(String(era.check_number || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(era.paid_date || '')) || (!Number.isFinite(Date.parse(era.paid_date)) || new Date(era.paid_date).toISOString().slice(0,10) !== era.paid_date)) throw billingError(409, 'This ERA needs manual deposit verification: a complete EFT reference, amount and payment date are required');
  const [whole, fraction = ''] = amount.split('.'), amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amountCents <= 0) throw billingError(409, 'Zero or negative remittances require manual reconciliation');
  return { eraId: String(era.eraid), trace: String(era.check_number), amountCents, currency: 'usd', paidDate: era.paid_date, payerId: String(era.payerid || ''), payerName: String(era.payer_name || ''), providerNpi: String(era.prov_npi) };
}

// Only an explicit X12 reassociation TRN segment is accepted. A generic ACH
// trace, an amount/date similarity, or text containing a payer name is insufficient.
export function matchesEraDeposit(transaction, era) {
  if (transaction.status !== 'posted' || transaction.currency !== era.currency || transaction.amount !== era.amountCents || transaction.amount <= 0) return false;
  const date = transaction.status_transitions?.posted_at;
  if (!Number.isSafeInteger(date)) return false;
  const delta = date * 1000 - Date.parse(`${era.paidDate}T00:00:00Z`);
  if (delta < 0 || delta > 14 * 86400000) return false;
  const segments = [...String(transaction.description || '').matchAll(/(?:^|(?<=[\s~]))TRN\*1\*([A-Za-z0-9-]{6,50})\*([A-Za-z0-9-]+)(?:\*[^~\r\n]*)?~/g)];
  return segments.length === 1 && segments[0][1] === era.trace && segments[0][2] === era.originatorId && /^1[0-9]{9}$/.test(era.originatorId || '');
}

export async function requestEraDepositVerification({ agencyId, accountId, actorUserId, eraId, page = 1 }) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !/^[A-Za-z0-9_-]{1,128}$/.test(eraId)) throw billingError(400, 'Select an ERA from its directory page');
  const agency = await Agency.findById(agencyId), taxId = String(agency?.tax_id || '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(taxId)) throw billingError(409, 'Configure the agency tax ID first');
  await assertExclusiveClaimMdTaxId(agencyId, taxId);
  const connection = await resolveClaimMdConnection(agencyId);
  requireClaimMdTransmission(connection);
  const result = await fetchEraList({ accountKey: connection.accountKey, page, taxId });
  const rows = Array.isArray(result.era) ? result.era : result.era ? [result.era] : [];
  const selected = rows.filter(e => String(e.eraid) === eraId);
  if (selected.length !== 1) throw billingError(409, 'ERA not found uniquely on this directory page; refresh or use manual review');
  const profiles = await listClaimMdBillingProfiles(agencyId);
  const era = eraDepositEvidence(selected[0], taxId, profiles.map(p => String(p.practice_npi)));
  const details = await fetchEraData({ accountKey: connection.accountKey, eraId });
  const detailedEra = eraDepositEvidence({ ...details, check_type: 'eft' }, taxId, [era.providerNpi]);
  if (String(details.eraid) !== eraId || String(details.prov_taxid || '').replace(/\D/g, '') !== taxId || String(details.prov_npi) !== era.providerNpi || String(details.check_number) !== era.trace || String(details.payerid) !== era.payerId || detailedEra.amountCents !== era.amountCents || details.paid_date !== era.paidDate || details.payment_method !== 'ACH' || !/^1[0-9]{9}$/.test(String(details.payer_companyid || ''))) throw billingError(409, 'Complete ERA originator identity is unavailable or inconsistent; verify this deposit manually');
  era.originatorId = String(details.payer_companyid);
  const eraKey = crypto.createHash('sha256').update(`${connection.connectionId}:${eraId}`).digest('hex');
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,5) AS acquired', [`bank-feed:${accountId}`]);
    if (!lock.acquired) throw billingError(409, 'Bank verification is running; try again shortly');
    locked = true;
    await db.beginTransaction();
    const [[account]] = await db.execute('SELECT * FROM bank_feed_accounts WHERE id=? AND agency_id=? AND sync_enabled=1 FOR UPDATE', [accountId, agencyId]);
    if (!account || account.shared_account || !!account.livemode !== (connection.mode === 'live')) throw billingError(409, 'Choose this agency’s active bank account in the same mode as Claim.MD');
    const [[previous]] = await db.execute('SELECT id,account_id FROM bank_deposit_verifications WHERE agency_id=? AND era_key=? FOR UPDATE', [agencyId, eraKey]);
    if (previous && Number(previous.account_id) !== accountId) throw billingError(409, 'This ERA already has a verification request under another bank account');
    if (!previous) await db.execute('INSERT INTO bank_deposit_verifications (agency_id,account_id,era_key,era_encrypted,requested_by_user_id) VALUES (?,?,?,?,?)', [agencyId, accountId, eraKey, encryptFamilyBilling(era, context(agencyId, eraKey)), actorUserId]);
    // Re-scan vendor history for newly selected ERAs. Unrelated transactions are never retained.
    await db.execute('UPDATE bank_feed_accounts SET last_refresh=NULL,sync_target_refresh=NULL,page_cursor=NULL,next_sync_at=UTC_TIMESTAMP() WHERE id=?', [accountId]);
    await auditBilling({ agencyId, userId: actorUserId, action: 'era_deposit_verification_requested', objectId: accountId }, db);
    await db.commit();
    return { queued: true };
  } catch (error) { await db.rollback(); throw error; }
  finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`bank-feed:${accountId}`]); db.release(); }
}

export async function depositVerificationTargets(db, account) {
  const [rows] = await db.execute('SELECT * FROM bank_deposit_verifications WHERE agency_id=? AND account_id=?', [account.agency_id, account.id]);
  return rows.map(r => ({ ...r, era: decryptFamilyBilling(r.era_encrypted, context(r.agency_id, r.era_key)) }));
}
