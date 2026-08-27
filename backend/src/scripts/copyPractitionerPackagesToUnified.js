/**
 * One-time helper: copy active practitioner_session_packages into booking_packages
 * for a given agency (coaching tenant-wide catalog).
 *
 * Usage:
 *   node backend/src/scripts/copyPractitionerPackagesToUnified.js <agencyId>
 *
 * Safe to re-run: skips when a booking package with the same name + session_count exists.
 */
import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';

const agencyId = Number(process.argv[2] || 0);
if (!agencyId) {
  console.error('Usage: node copyPractitionerPackagesToUnified.js <agencyId>');
  process.exit(1);
}

const [rows] = await pool.execute(
  `SELECT * FROM practitioner_session_packages
   WHERE agency_id = ? AND is_active = 1
   ORDER BY id ASC`,
  [agencyId]
);

const existing = await BookingPackage.listForAgency(agencyId, {
  includeInactive: true,
  businessType: 'coaching',
  tenantWideOnly: true
});

let created = 0;
let skipped = 0;
for (const row of rows || []) {
  const name = String(row.name || '').trim();
  const sessionCount = Number(row.session_count || 0);
  const dup = existing.find(
    (p) => p.name === name && Number(p.sessionCount) === sessionCount
  );
  if (dup) {
    skipped += 1;
    continue;
  }
  await BookingPackage.create(
    agencyId,
    {
      businessType: 'coaching',
      name,
      description: row.description || null,
      packageType: 'prepaid_bundle',
      sessionCount: Math.max(1, sessionCount || 1),
      priceCents: Number(row.price_cents || 0),
      learningProgramClassId: null,
      isPublic: false,
      billingOptions: {
        modes: ['pay_in_full'],
        installments: null,
        subscriptionInterval: null
      },
      policies: BookingPackage.DEFAULT_POLICIES,
      domainConfig: { engagementType: 'coaching' },
      consumeOn: 'reserve'
    },
    null
  );
  created += 1;
}

console.log(`Agency ${agencyId}: created ${created}, skipped ${skipped}`);
process.exit(0);
