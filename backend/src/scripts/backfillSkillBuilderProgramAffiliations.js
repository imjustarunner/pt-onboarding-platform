/**
 * Ensure user_agencies links exist for Skill-Builder-eligible users → Skill Builders program org per tenant.
 *
 * Usage (from repo root): node backend/src/scripts/backfillSkillBuilderProgramAffiliations.js
 * Or: cd backend && npm run backfill:skill-builder-program-affiliations
 *
 * Optional env: BACKFILL_AGENCY_ID=123 to limit to one parent agency.
 */
import pool from '../config/database.js';
import { backfillSkillBuilderEligibleProgramAffiliations } from '../services/skillBuildersProgramAffiliation.service.js';

async function main() {
  const envAgency = process.env.BACKFILL_AGENCY_ID
    ? Number.parseInt(String(process.env.BACKFILL_AGENCY_ID), 10)
    : null;
  const agencyId =
    Number.isFinite(envAgency) && envAgency > 0 ? envAgency : null;

  const conn = await pool.getConnection();
  try {
    const { totalUserProgramLinks, agenciesProcessed, detail } =
      await backfillSkillBuilderEligibleProgramAffiliations(conn, { agencyId });
    console.log(
      JSON.stringify(
        { totalUserProgramLinks, agenciesProcessed, detail },
        null,
        2
      )
    );
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
