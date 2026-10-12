// Writes SQL to stdout only. Review and commit the migration; there is no recurring job.
import { readFileSync, existsSync } from 'node:fs';
import { buildHandbookHolidayToasts, handbookHolidayDates } from '../utils/handbookHolidayToasts.js';

const snapshot = JSON.parse(readFileSync(new URL('../content/handbook-office-holidays.json', import.meta.url), 'utf8'));
const normalize = (value) => value.replace(/[’']/g, "'").trim();
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const rows = buildHandbookHolidayToasts({ observeWeekends: process.argv.includes('--observe-weekends') });
console.log('-- One-time handbook office-closure toasts: remaining 2026 and calendar 2027.');
console.log('-- Source: ITSCO, NLU, ISI holiday-scheduling-policy. Administrative offices only.');
console.log('-- America/Denver; prior business-day reminders; no annual regeneration.');
console.log(`-- Weekend holidays: ${process.argv.includes('--observe-weekends') ? 'Saturday observed Friday; Sunday observed Monday' : 'listed calendar dates (handbooks do not specify substitute weekdays)'}.`);
for (const { tenant, slugs, holidays } of snapshot.sources) {
  // Full handbook files are deployment inputs and are not stored in Git.
  // When available locally, verify the snapshot against their actual holiday section.
  const source = new URL(`../content/handbooks/${tenant}.json`, import.meta.url);
  let listed = new Set(holidays.map(normalize));
  if (existsSync(source)) {
    const handbook = JSON.parse(readFileSync(source, 'utf8'));
    const section = handbook.sections.find((s) => s.slug === 'holiday-scheduling-policy');
    const holidayHtml = section?.bodyHtml.split('<h4>Recognized Holidays</h4>')[1] || '';
    listed = new Set([...holidayHtml.matchAll(/<li>(.*?)<\/li>/g)].map((m) => normalize(m[1])));
  }
  const expected = new Set(handbookHolidayDates(2027).map(([, name]) => normalize(name)));
  if (listed.size !== expected.size || [...expected].some((name) => !listed.has(name))) {
    throw new Error(`${tenant}: holiday policy changed; review the calendar rules before seeding.`);
  }
  for (const row of rows) {
    const starts = row.starts_at.replace('T', ' ').slice(0, 19);
    const ends = row.ends_at.replace('T', ' ').slice(0, 19);
    console.log(`
INSERT INTO agency_scheduled_announcements
  (agency_id, title, message, display_type, audience, recipient_user_ids, starts_at, ends_at, publish_status, seed_key)
SELECT a.id, ${quote(row.title)}, ${quote(row.message)}, 'toast', 'everyone', JSON_ARRAY(), ${quote(starts)}, ${quote(ends)}, 'published', ${quote(row.seed_key)}
FROM agencies a WHERE LOWER(a.slug) IN (${slugs.map(quote).join(', ')})
ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key);`);
  }
}
