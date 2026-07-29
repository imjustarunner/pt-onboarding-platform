/**
 * Smoke test for canonical billing report parser + fingerprint (no DB required).
 * Usage: node backend/src/scripts/smokeBillingReportIngest.js
 */
import {
  parseBillingReportFile,
  computeLineFingerprint,
  normalizeNameKey,
  computeFiscalYearStartAugYmd,
  formatYmd,
  parseServiceDate,
  safeMoney,
  deriveBillingOutstandingAmounts
} from '../services/billingReportIngest.service.js';

const csv = `Date,Patient,DOB,Patient Account Number or Member ID,Type of Charge or Payment,Place of Service Code,Clinician,Diagnosis,Primary Payer Name,Secondary Payer Name,Rate,Patient Amount,Patient Balance,Insurance Amount,Insurance Amount Paid,Insurance Status
08/15/2025,"Potter, Harry",07/31/2010,MEM-HP-001,Charge,03,"Granger, Hermione",F41.1,Medicaid,,150.00,0,25.00,150.00,100.00,Partial
09/01/2025,"Potter, Harry",07/31/2010,MEM-HP-001,Charge,11,"Granger, Hermione",F41.1,Medicaid,,150.00,25.00,0,150.00,150.00,Paid
01/10/2026,"Weasley, Ron",03/01/2011,MEM-RW-002,Charge,11,"Lovegood, Luna",F32.1,Commercial,,175.00,0,40.00,175.00,0,Pending
`;

function fingerprintFromNormalized(n, agencyId) {
  const patient = String(n.patient || '').trim();
  const serviceYmd = formatYmd(parseServiceDate(n.date));
  const dobYmd = formatYmd(parseServiceDate(n.dob));
  return computeLineFingerprint({
    agencyId,
    serviceDateYmd: serviceYmd,
    patientNameNorm: normalizeNameKey(patient),
    dobYmd,
    memberId: n['patient account number or member id'],
    clinicianNorm: normalizeNameKey(n.clinician),
    placeOfService: String(n['place of service code'] || '').padStart(2, '0').slice(-2),
    rowType: n['type of charge or payment'],
    diagnosis: n.diagnosis,
    chargeRate: safeMoney(n.rate)
  });
}

const buf = Buffer.from(csv, 'utf8');
const rows = parseBillingReportFile(buf, 'hogwarts-sample.csv');
console.log('parsed rows', rows.length);
if (rows.length !== 3) {
  console.error('FAIL: expected 3 rows');
  process.exit(1);
}

const agencyId = 1;
const fps = rows.map((n) => fingerprintFromNormalized(n, agencyId));
if (new Set(fps).size !== 3) {
  console.error('FAIL: expected 3 unique fingerprints', fps);
  process.exit(1);
}

const again = parseBillingReportFile(buf, 'hogwarts-sample.csv');
const fps2 = again.map((n) => fingerprintFromNormalized(n, agencyId));
for (let i = 0; i < fps.length; i += 1) {
  if (fps[i] !== fps2[i]) {
    console.error('FAIL: fingerprint not stable across re-parse');
    process.exit(1);
  }
}

if (computeFiscalYearStartAugYmd(new Date('2025-08-15T00:00:00Z')) !== '2025-08-01') {
  console.error('FAIL fy aug');
  process.exit(1);
}
if (computeFiscalYearStartAugYmd(new Date('2026-07-31T00:00:00Z')) !== '2025-08-01') {
  console.error('FAIL fy jul');
  process.exit(1);
}
if (computeFiscalYearStartAugYmd(new Date('2026-08-01T00:00:00Z')) !== '2026-08-01') {
  console.error('FAIL fy next');
  process.exit(1);
}

const tnLike = deriveBillingOutstandingAmounts({
  chargeRate: 140,
  patientAmount: 0,
  insuranceAmountPaid: 103.22
});
if (tnLike.insuranceOutstanding !== 36.78) {
  console.error('FAIL tn-like outstanding', tnLike);
  process.exit(1);
}

const hogwartsRow = deriveBillingOutstandingAmounts({
  chargeRate: 150,
  patientAmount: 0,
  patientBalance: 25,
  insuranceAmount: 150,
  insuranceAmountPaid: 100,
  primaryPayer: 'Medicaid'
});
if (hogwartsRow.patientBalance !== 25 || hogwartsRow.insuranceOutstanding !== 50) {
  console.error('FAIL hogwarts outstanding split', hogwartsRow);
  process.exit(1);
}

console.log('stable fingerprints', fps.map((f) => f.slice(0, 10)));
console.log('OK smokeBillingReportIngest');
process.exit(0);
