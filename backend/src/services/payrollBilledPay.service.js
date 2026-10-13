import pool from '../config/database.js';

const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
// Read total charges only. A unit rate, an outstanding balance, and patient payments
// are different amounts and must never be substituted for the billed charge.
export function billedAmountFromReport(row) {
  const values = new Map(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase().replace(/[_\s]+/g, ' ').trim(), value]));
  for (const key of ['amount billed', 'billed amount', 'total billed', 'total charge', 'total charges', 'charge amount', 'amount charged', 'patient amount billed', 'billed', 'charge', 'charges']) {
    const raw = values.get(key);
    if (raw == null || String(raw).trim() === '') continue;
    const text = String(raw).trim().replace(/[$,]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    return Number(text);
  }
  return null;
}
export function rateAtDate(rates, date) {
  const asOf = day(date);
  return [...rates].filter(r => (!r.effective_start || day(r.effective_start) <= asOf) && (!r.effective_end || day(r.effective_end) >= asOf))
    .sort((a,b) => day(b.effective_start).localeCompare(day(a.effective_start)) || Number(b.id || 0)-Number(a.id || 0))[0] || null;
}
export function calculateBilledPay({ entries, finalizedUnits, rates, serviceCode }) {
  if (!(finalizedUnits > 0)) return { amount: 0, billedAmount: 0, presentAmount: 0, carryoverAmount: 0 };
  const units = entries.reduce((sum, r) => sum + Number(r.unit_count || 0), 0);
  if (Math.abs(units - finalizedUnits) > 0.005) fail(`Review ${serviceCode}: billed-charge records do not match the payable units. Upload the complete billing report before calculating percentage pay.`);
  let cents = 0, billedAmount = 0, presentCents = 0, carryCents = 0;
  for (const row of entries) {
    const billed = row.billed_amount;
    if (billed == null || billed === '' || !Number.isFinite(Number(billed)) || Number(billed) < 0) fail(`Billed amount missing for ${serviceCode}. Re-upload a report with an Amount Billed or Total Charge column; client payments cannot substitute for billed charges.`);
    const rate = rateAtDate(rates, row.service_date);
    if (rate?.pay_method !== 'percent_billed' || rate.pay_percent == null) fail(`Review the dated ${serviceCode} percentage agreement for ${day(row.service_date)} before calculating payroll.`);
    const percent = Number(rate.pay_percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) fail(`Invalid ${serviceCode} percentage.`);
    const billedCents = Math.round(Number(billed) * 100);
    const percentHundredths = Math.round(percent * 100);
    const lineCents = Math.round(billedCents * percentHundredths / 10000);
    billedAmount += Number(billed); cents += lineCents;
    if (row.isCarryover) carryCents += lineCents; else presentCents += lineCents;
  }
  return { amount: cents / 100, billedAmount: Math.round(billedAmount * 100) / 100, presentAmount: presentCents / 100, carryoverAmount: carryCents / 100 };
}
export async function billedPayForStagingRow({ row, payrollPeriodId, agencyId, rates }, db = pool) {
  const code = String(row.serviceCode).trim().toUpperCase();
  const [current] = await db.execute(`SELECT id, service_date, billed_amount, unit_count, row_fingerprint, note_status, draft_payable
    FROM payroll_import_rows WHERE agency_id=? AND payroll_period_id=? AND user_id=? AND UPPER(TRIM(service_code))=?
    AND payroll_import_id=(SELECT id FROM payroll_imports WHERE payroll_period_id=? ORDER BY created_at DESC,id DESC LIMIT 1)`,
    [agencyId, payrollPeriodId, row.userId, code, payrollPeriodId]);
  const carryKeys = new Set((row.carryoverMeta?.rawAuditRows || []).map(r => r.rowMatchKey).filter(Boolean));
  const entries = current.filter(r => r.note_status === 'FINALIZED' || (r.note_status === 'DRAFT' && Number(r.draft_payable)) || carryKeys.has(r.row_fingerprint))
    .map(r => ({ ...r, isCarryover: carryKeys.has(r.row_fingerprint) }));
  const presentKeys = new Set(entries.map(r => r.row_fingerprint));
  const missing = [...carryKeys].filter(k => !presentKeys.has(k));
  if (missing.length) {
    const [previous] = await db.execute(`SELECT id,service_date,billed_amount,unit_count,row_fingerprint FROM payroll_import_rows
      WHERE agency_id=? AND user_id=? AND UPPER(TRIM(service_code))=? AND row_fingerprint IN (${missing.map(() => '?').join(',')}) ORDER BY id DESC`,
      [agencyId, row.userId, code, ...missing]);
    for (const r of previous) if (!presentKeys.has(r.row_fingerprint)) { entries.push({ ...r, isCarryover: true }); presentKeys.add(r.row_fingerprint); }
  }
  return calculateBilledPay({ entries, finalizedUnits: Number(row.finalizedUnits || 0), rates, serviceCode: code });
}
