/**
 * One-time / re-runnable backfill for Federal Background/Fingerprint Check
 * lifecycle completion dates from the HR roster list.
 *
 * Usage (from backend/):
 *   node scripts/backfillFederalBackgroundCheckDates.js
 *   node scripts/backfillFederalBackgroundCheckDates.js --dry-run
 */
import 'dotenv/config';
import pool from '../src/config/database.js';
import {
  FEDERAL_BG_ITEM_KEY,
  computeExpiresAt,
  getExpirationYearsForUser,
  mirrorBackgroundCheckInfoFields,
} from '../src/services/federalBackgroundCheck.service.js';

const DRY_RUN = process.argv.includes('--dry-run');

/** Prefer later date when two were provided. Skip uncertain summer dates. */
const ROSTER = [
  ['Elizabeth', 'Rosas', '2020-12-02'],
  ['Brittany', 'Suvari', '2022-11-04'], // 3/16/2022 and 11/4/2022 → later
  ['Michael', 'Mendez', '2021-12-01'],
  ['Chelsea', 'Wages', '2022-10-25'],
  ['Rachel', 'Finch', '2019-02-06'],
  ['Kimberly', 'Woods', '2023-01-25'],
  ['Erica', 'Hiebert', '2023-02-06'], // roster spelling: Heibert
  ['Hannah', 'Plush', '2023-02-02'],
  ['Dayana', 'Fyulep', '2023-03-22'],
  ['Yulissa', 'Colunga', '2023-05-17'],
  ['Cary', 'Reed', '2023-05-23'],
  ['Melanie', 'McElravy', '2023-05-09'], // roster: 5/92023
  ['Ayanna', 'Cole', '2023-06-24'],
  ['Joy', 'Thellman', '2023-06-28'],
  ['Adam', 'Morris', '2023-07-19'],
  ['Evan', 'Hudson', '2023-07-18'],
  ['Cristina', 'Campos-Krumholz', '2023-08-02'],
  ['Gini', 'Williamson', '2023-09-07'],
  ['Taylor', 'Arnett', '2023-11-30'],
  ['Aunya', 'Albinana', '2023-12-21'],
  ['Kimberly', 'Tovar', '2023-12-20'],
  ['Emma', 'Boese', '2024-01-10'],
  ['Mary', 'Bell', '2023-01-10'],
  ['Aneta', 'Czepiel', '2024-05-08'],
  ['Destiny', 'Roberts', '2024-05-07'],
  ['Samantha', 'Crandall', '2024-07-16'],
  ['Blanca', 'Diaz', '2024-07-08'],
  ['Abigail', 'Swiger-Burghardt', '2024-07-17'],
  ['Mariela', 'Duran', '2024-08-13'],
  ['Kylie', 'Sams', '2024-08-13'],
  ['Sherri', 'Olonergan', '2024-08-14'],
  ['Angelina', 'Hoss', '2024-08-21'],
  ['Miranda', 'Irvin', '2024-08-21'],
  ['Jasmine', 'Christie', '2024-08-27'],
  ['Michelle', 'Bennett', '2024-09-03'],
  ['Shelby', 'Scoble', '2024-09-04'],
  ['Jade', 'Littrell', '2024-09-24'],
  ['Trevor', 'Reynolds', '2024-10-02'],
  ['Caitlyn', 'Sears', '2024-10-08'],
  ['Shaelyn', 'Schmidt', '2024-10-09'],
  ['Rashawnda', 'Walker', '2024-10-23'],
  ['Tracy', 'Reyes', '2024-11-05'],
  ['Emmi', 'Regenbogen', '2024-11-06'],
  ['Rachel', 'Schroeder', '2025-01-08'],
  ['Meghan', 'Cassidy', '2025-01-15'],
  ['Chase', 'Blackwood', '2025-01-11'],
  ['Nicole', 'Porter', '2025-01-21'],
  ['LeEtta', 'Klink', '2025-01-18'],
  ['Caleb', 'Discua', '2025-02-25'],
  ['Megan', 'Geil-Crader', '2025-03-24'],
  ['Alana', 'Diggs', '2025-04-02'],
  ['Rhyann', 'Chapin', '2025-05-14'],
  // Lindsey Byers — "Summer of 2021?" skipped (uncertain)
  ['Ashlyn', 'Hayden', '2023-06-01'],
  ['Trenyce', 'Paguio', '2025-07-10'], // roster: Trenyce Nissi Paguio
  ['Robert', 'Klaer', '2025-09-29'], // roster: Bobby Klaer
  ['Jeannie', 'Frisbie', '2025-10-01'], // roster: Jeanie Frisbie
  ['Abrianna', 'Watts', '2025-10-04'],
  ['Rebecca', 'Longnecker', '2025-11-05'],
  ['Grace', 'Terrones', '2025-12-05'],
  ['Oneisha', 'Peres', '2025-12-09'],
  ['Ashiley', 'Hall', '2025-11-18'],
  ["Aedon", "O'dea", '2025-01-14'],
  ['Danica', 'Alter', '2026-06-22'],
];

const ALIASES = [
  { first: 'Erica', last: 'Heibert', mapsTo: ['Erica', 'Hiebert'] },
  { first: 'Bobby', last: 'Klaer', mapsTo: ['Robert', 'Klaer'] },
  { first: 'Jeanie', last: 'Frisbie', mapsTo: ['Jeannie', 'Frisbie'] },
  { first: 'Trenyce', last: 'Nissi Paguio', mapsTo: ['Trenyce', 'Paguio'] },
];

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

async function findUser(first, last) {
  const nf = norm(first);
  const nl = norm(last);

  const [all] = await pool.execute(
    `SELECT id, first_name, last_name, status, is_active FROM users`
  );

  const exact = all.filter((u) => norm(u.first_name) === nf && norm(u.last_name) === nl);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const active = exact.find((u) => u.status === 'ACTIVE_EMPLOYEE' && Number(u.is_active) === 1);
    return active || exact[0];
  }

  for (const a of ALIASES) {
    if (norm(a.first) === nf && norm(a.last) === nl) {
      return findUser(a.mapsTo[0], a.mapsTo[1]);
    }
  }

  if (nl) {
    const fuzzy = all.filter(
      (u) =>
        norm(u.first_name) === nf &&
        (norm(u.last_name).includes(nl) || nl.includes(norm(u.last_name)))
    );
    if (fuzzy.length === 1) return fuzzy[0];
  }

  return null;
}

async function upsertLifecycleDate(userId, completedAtYmd, years) {
  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  if (!definitionId) throw new Error('background_check_complete definition missing — run migration 1089');

  const expiresAt = computeExpiresAt(completedAtYmd, years);
  const completedAt = `${completedAtYmd} 12:00:00`;

  if (DRY_RUN) {
    return { definitionId, expiresAt, dryRun: true };
  }

  await pool.execute(
    `INSERT INTO user_lifecycle_checklist_items
       (user_id, definition_id, is_completed, completed_at, completion_method, manually_overridden, expires_at)
     VALUES (?, ?, 1, ?, 'imported', 1, ?)
     ON DUPLICATE KEY UPDATE
       is_completed = 1,
       completed_at = VALUES(completed_at),
       completion_method = 'imported',
       manually_overridden = 1,
       expires_at = VALUES(expires_at),
       is_not_applicable = 0,
       not_applicable_at = NULL,
       not_applicable_by_user_id = NULL`,
    [userId, definitionId, completedAt, expiresAt]
  );

  await mirrorBackgroundCheckInfoFields(userId, { completed: true, completedAt: completedAtYmd });
  return { definitionId, expiresAt };
}

async function main() {
  const updated = [];
  const missing = [];
  const errors = [];

  for (const [first, last, date] of ROSTER) {
    try {
      const user = await findUser(first, last);
      if (!user) {
        missing.push(`${first} ${last} (${date})`);
        continue;
      }
      const years = await getExpirationYearsForUser(user.id);
      const result = await upsertLifecycleDate(user.id, date, years);
      updated.push({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        status: user.status,
        date,
        expiresAt: result.expiresAt,
        years,
      });
    } catch (e) {
      errors.push(`${first} ${last}: ${e.message}`);
    }
  }

  console.log(DRY_RUN ? '\n=== DRY RUN ===' : '\n=== APPLIED ===');
  console.log(`Updated: ${updated.length}`);
  for (const u of updated) {
    console.log(`  #${u.id} ${u.name} [${u.status}] complete=${u.date} expires=${u.expiresAt} (+${u.years}y)`);
  }
  console.log(`\nMissing in DB: ${missing.length}`);
  for (const m of missing) console.log(`  - ${m}`);
  if (errors.length) {
    console.log(`\nErrors: ${errors.length}`);
    for (const e of errors) console.log(`  ! ${e}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
