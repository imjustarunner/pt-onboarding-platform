/**
 * One-off: refresh ITSCO joinLanding.counseling fullTitle/fullCta if still on old copy.
 * Uses backend/.env via the shared database pool.
 *
 * Usage: node backend/src/scripts/patchItscoJoinLandingEnrollmentCopy.js
 */
import pool from '../config/database.js';

const OLD_TITLE = 'In-Depth Intake Packet';
const NEW_TITLE = 'Client Enrollment Packet';
const OLD_CTA = 'Start Full Intake →';
const OLD_CTA_ALT = 'Start Full Intake ->';
const NEW_CTA = 'Start Full Enrollment Packet →';

function patchCounseling(joinLanding) {
  if (!joinLanding || typeof joinLanding !== 'object') return { joinLanding, changed: false };
  const next = { ...joinLanding };
  const counseling = next.counseling && typeof next.counseling === 'object'
    ? { ...next.counseling }
    : null;
  if (!counseling) return { joinLanding: next, changed: false };

  let changed = false;
  if (String(counseling.fullTitle || '').trim() === OLD_TITLE) {
    counseling.fullTitle = NEW_TITLE;
    changed = true;
  }
  const cta = String(counseling.fullCta || '').trim();
  if (cta === OLD_CTA || cta === OLD_CTA_ALT) {
    counseling.fullCta = NEW_CTA;
    changed = true;
  }
  if (changed) next.counseling = counseling;
  return { joinLanding: next, changed };
}

async function main() {
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, theme_settings
     FROM agencies
     WHERE LOWER(COALESCE(slug, '')) = 'itsco'
        OR LOWER(COALESCE(portal_url, '')) = 'itsco'
        OR LOWER(COALESCE(name, '')) LIKE '%itsco%'
     LIMIT 5`
  );

  if (!rows.length) {
    console.log('No ITSCO agency row found — nothing to patch.');
    return;
  }

  for (const row of rows) {
    let theme = {};
    try {
      theme = typeof row.theme_settings === 'string'
        ? JSON.parse(row.theme_settings || '{}')
        : (row.theme_settings || {});
    } catch {
      theme = {};
    }
    if (!theme || typeof theme !== 'object') theme = {};

    const existing = theme.joinLanding && typeof theme.joinLanding === 'object'
      ? theme.joinLanding
      : {};
    const { joinLanding, changed } = patchCounseling(existing);

    if (!changed) {
      console.log(
        `Agency ${row.id} (${row.name}): joinLanding.counseling already up to date`
        + ` (fullTitle=${JSON.stringify(existing?.counseling?.fullTitle)},`
        + ` fullCta=${JSON.stringify(existing?.counseling?.fullCta)})`
      );
      continue;
    }

    const nextTheme = { ...theme, joinLanding };
    await pool.execute(
      'UPDATE agencies SET theme_settings = ? WHERE id = ?',
      [JSON.stringify(nextTheme), row.id]
    );
    console.log(
      `Agency ${row.id} (${row.name}): patched joinLanding.counseling`
      + ` fullTitle → ${NEW_TITLE}, fullCta → ${NEW_CTA}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch { /* best-effort */ }
  });
