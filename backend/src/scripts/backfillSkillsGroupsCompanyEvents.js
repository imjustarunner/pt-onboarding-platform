/**
 * CLI: create program-scoped company_events for school skills_groups missing integration.
 *
 * Usage (from repo root): node backend/src/scripts/backfillSkillsGroupsCompanyEvents.js
 * Or: cd backend && npm run backfill:skills-groups-company-events
 *
 * Optional env: BACKFILL_AGENCY_ID=123 to limit to one agency (otherwise all agencies).
 */
import pool from '../config/database.js';
import { backfillSkillsGroupCompanyEvents } from '../services/skillBuildersGroupEventBackfill.service.js';

async function main() {
  const conn = await pool.getConnection();
  try {
    const [uidRows] = await conn.execute(
      `SELECT id FROM users
       WHERE LOWER(role) IN ('super_admin','admin')
         AND (is_active IS NULL OR is_active = TRUE)
         AND (is_archived IS NULL OR is_archived = FALSE)
       ORDER BY id ASC LIMIT 1`
    );
    const actorUserId = uidRows?.[0]?.id ? Number(uidRows[0].id) : null;
    if (!actorUserId) {
      console.error('No admin user found; abort.');
      process.exit(1);
    }

    const envAgency = process.env.BACKFILL_AGENCY_ID
      ? Number.parseInt(String(process.env.BACKFILL_AGENCY_ID), 10)
      : null;
    const agencyId =
      Number.isFinite(envAgency) && envAgency > 0 ? envAgency : null;

    const { created, skipped, warnings } = await backfillSkillsGroupCompanyEvents(conn, {
      agencyId,
      actorUserId
    });
    for (const w of warnings || []) console.warn(w);
    console.log(`Done. Created ${created}, skipped ${skipped}.`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
