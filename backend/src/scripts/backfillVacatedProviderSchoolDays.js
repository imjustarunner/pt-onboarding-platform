/**
 * Backfill: providers who already left a school weekday (slots → 0 / inactive PSA)
 * before vacate-day logic existed still have clients on that day in CPA or soft schedule.
 *
 * Example: Halle Brimm — Twain Thursday approved to 0 slots; clients remained on Thursday soft schedule.
 *
 * Usage (dry run):
 *   node backend/src/scripts/backfillVacatedProviderSchoolDays.js
 * Apply:
 *   CONFIRM=1 node backend/src/scripts/backfillVacatedProviderSchoolDays.js
 * Optional:
 *   BACKFILL_PROVIDER_USER_ID=567
 */
import pool from '../config/database.js';
import {
  demoteUnassignedClientsAfterDayMove,
  vacateProviderSchoolDay
} from '../services/providerSchoolDayMove.service.js';

async function findVacatedDayTargets(providerUserId = null) {
  const providerFilter = providerUserId ? 'AND t.provider_user_id = ?' : '';
  const params = providerUserId ? [providerUserId] : [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT t.provider_user_id, t.school_organization_id, t.weekday
     FROM (
       SELECT cpa.provider_user_id, cpa.organization_id AS school_organization_id, cpa.service_day AS weekday
       FROM client_provider_assignments cpa
       INNER JOIN provider_school_assignments psa
         ON psa.provider_user_id = cpa.provider_user_id
        AND psa.school_organization_id = cpa.organization_id
        AND psa.day_of_week = cpa.service_day COLLATE utf8mb4_unicode_ci
       WHERE cpa.is_active = TRUE
         AND cpa.service_day IS NOT NULL
         AND (psa.is_active = FALSE OR psa.slots_total <= 0)

       UNION

       SELECT s.provider_user_id, s.school_organization_id, s.weekday
       FROM soft_schedule_slots s
       INNER JOIN provider_school_assignments psa
         ON psa.provider_user_id = s.provider_user_id
        AND psa.school_organization_id = s.school_organization_id
        AND psa.day_of_week = s.weekday COLLATE utf8mb4_unicode_ci
       WHERE s.client_id IS NOT NULL
         AND (psa.is_active = FALSE OR psa.slots_total <= 0)
     ) t
     WHERE 1=1 ${providerFilter}
     ORDER BY t.provider_user_id, t.school_organization_id, FIELD(t.weekday,'Monday','Tuesday','Wednesday','Thursday','Friday')`,
    params
  );
  return rows || [];
}

async function main() {
  const confirm = String(process.env.CONFIRM || '').trim() === '1';
  const providerUserId = process.env.BACKFILL_PROVIDER_USER_ID
    ? Number.parseInt(String(process.env.BACKFILL_PROVIDER_USER_ID), 10)
    : null;
  const actorUserId = process.env.BACKFILL_ACTOR_USER_ID
    ? Number.parseInt(String(process.env.BACKFILL_ACTOR_USER_ID), 10)
    : 501;

  const targets = await findVacatedDayTargets(
    Number.isFinite(providerUserId) && providerUserId > 0 ? providerUserId : null
  );

  console.log(`Found ${targets.length} vacated provider/school/day row(s) needing cleanup.`);

  for (const t of targets) {
    const [u] = await pool.execute(
      `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
      [t.provider_user_id]
    );
    const [s] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [t.school_organization_id]);
    const name = [u?.[0]?.first_name, u?.[0]?.last_name].filter(Boolean).join(' ') || `User ${t.provider_user_id}`;
    console.log(
      `  ${name} — ${s?.[0]?.name || t.school_organization_id} — ${t.weekday}`
    );
  }

  if (!confirm) {
    console.log('Dry run only — re-run with CONFIRM=1 to apply.');
    return;
  }

  let vacated = 0;
  let clientsUnassigned = 0;
  const allClientIds = [];

  for (const t of targets) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await vacateProviderSchoolDay(conn, {
        schoolId: Number(t.school_organization_id),
        providerUserId: Number(t.provider_user_id),
        weekday: String(t.weekday),
        actorUserId: Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : 501
      });
      if (!result.ok) {
        await conn.rollback();
        console.warn('Skipped:', t, result.message);
        continue;
      }
      await conn.commit();
      vacated++;
      const ids = result.unassignedClientIds || [];
      clientsUnassigned += ids.length;
      allClientIds.push(...ids);
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
      console.error('Failed:', t, e?.message || e);
    } finally {
      conn.release();
    }
  }

  if (allClientIds.length) {
    await demoteUnassignedClientsAfterDayMove({
      clientIds: allClientIds,
      actorUserId: Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null
    });
  }

  console.log(`Done. Vacated ${vacated} day(s), touched ${clientsUnassigned} client assignment(s).`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end().catch(() => {});
    process.exit(1);
  });
