import crypto from 'node:crypto';
import pool from '../config/database.js';
import { enrichExistingClientsFromBillingRows } from './billingClientProfileEnrichment.service.js';
import { resolveSchoolClientRowEvidence } from './schoolClientLeaveBasis.service.js';
import { getBillingImportMetadata } from '../utils/payrollBillingImportMetadata.js';

function sourceFingerprint(row, source) {
  const key = Buffer.from(process.env.BILLING_ENCRYPTION_KEY_BASE64 || process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 || '', 'base64');
  if (key.length !== 32) throw Object.assign(new Error('Billing source encryption is unavailable.'), { code: 'BILLING_SOURCE_KEY_UNAVAILABLE' });
  return crypto.createHmac('sha256', key).update(JSON.stringify({ fingerprint: row.rowFingerprint, sourceRowNumber: source.sourceRowNumber, providerUserId: row.userId ?? source.providerUserId ?? null, providerName: row.providerName ?? source.providerName ?? null, serviceDate: row.serviceDate ?? source.serviceDate ?? null, placeOfService: source.placeOfService, location: row.location ?? source.location ?? null, profile: source.profileFields })).digest('hex');
}

/** Profile updates and school classification share one transaction. No services are imported. */
export async function enrichPayrollBillingImport({ agencyId, payrollImportId, rows, actorId }) {
  const sources = rows.map(row => ({ row, source: getBillingImportMetadata(row) })).filter(item => item.source);
  if (!sources.length) return { status: 'source_identity_unavailable', processedRows: 0 };
  const inputs = sources.map(({ row, source }) => ({
    sourceRowNumber: source.sourceRowNumber,
    rowFingerprint: sourceFingerprint(row, source),
    serviceDate: row.serviceDate,
    providerUserId: row.userId,
    profileFields: source.profileFields,
    placeOfService: source.placeOfService,
    location: row.location
  }));
  const providerIds = new Map(rows.filter(row => row.userId && row.providerName).map(row => [String(row.providerName).trim().toLowerCase(), row.userId]));
  const byOrdinal = new Map(inputs.map(row => [Number(row.sourceRowNumber), row]));
  // Billing facts on payment/missed-appointment records can enrich a known
  // profile, but they never become payroll service rows or school hours.
  for (const batch of new Set(sources.map(({ source }) => source.additionalProfileRows).filter(Array.isArray))) {
    for (const extra of batch) {
      if (byOrdinal.has(Number(extra.sourceRowNumber))) continue;
      const row = { rowFingerprint: null };
      byOrdinal.set(Number(extra.sourceRowNumber), { ...extra, providerUserId: providerIds.get(String(extra.providerName || '').trim().toLowerCase()) || null, rowFingerprint: sourceFingerprint(row, extra) });
    }
  }
  inputs.splice(0, inputs.length, ...byOrdinal.values());
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const profiles = await enrichExistingClientsFromBillingRows({ agencyId, payrollImportId, rows: inputs, actorId, dryRun: false, db });
    const matches = profiles.rows.map(row => ({ ...row, matchStatus: row.matchStatus === 'already_processed' && row.clientId ? 'matched' : row.matchStatus }));
    const schools = await resolveSchoolClientRowEvidence({ agencyId, payrollImportId, rows: inputs, matches, actorId, db });
    const summary = { status: 'completed', ...profiles.counts, schoolRows: schools.verifiedSchoolRows, excludedRows: schools.excludedRows, schoolReviewRows: schools.reviewRows, importedAt: new Date().toISOString() };
    await db.execute('UPDATE payroll_imports SET client_profile_summary_json=? WHERE id=? AND agency_id=?', [JSON.stringify(summary), payrollImportId, agencyId]);
    await db.commit();
    return summary;
  } catch (error) {
    await db.rollback();
    // Keep raw payroll usable; incomplete identity evidence blocks the school
    // accrual calculation and remains visible for review on the import record.
    const summary = { status: 'review_required', errorCode: 'client_profile_enrichment_failed', processedRows: 0, importedAt: new Date().toISOString() };
    await pool.execute('UPDATE payroll_imports SET client_profile_summary_json=? WHERE id=? AND agency_id=?', [JSON.stringify(summary), payrollImportId, agencyId]);
    console.warn('Billing client profile import needs review', { agencyId, payrollImportId, errorCode: error.code || 'PROFILE_IMPORT_FAILED' });
    return summary;
  } finally {
    db.release();
  }
}
