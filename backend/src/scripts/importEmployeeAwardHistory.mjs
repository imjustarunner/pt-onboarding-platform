import fs from 'node:fs/promises';
import pool from '../config/database.js';
import { AWARD_YEARS, anniversary, serviceDates, agencyToday } from '../utils/employeeAwards.js';

// Input contains verified agency/user IDs and names, not fuzzy name matching.
// Preview is the default. Employment dates are never copied from the source sheet.
const inputFile = process.argv.find(arg => arg.startsWith('--file='))?.slice(7);
const apply = process.argv.includes('--apply');
if (!inputFile) throw new Error('Usage: --file=/path/history.json [--apply]');
const input = JSON.parse(await fs.readFile(inputFile, 'utf8'));
const db = await pool.getConnection();
try {
  await db.beginTransaction();
  let awards = 0, completed = 0;
  for (const item of input) {
    if (!Number.isSafeInteger(item.agencyId) || !Number.isSafeInteger(item.userId) || !Array.isArray(item.completedYears) || item.completedYears.some(y=>!AWARD_YEARS.includes(y)) || !item.source) throw new Error('Invalid import record.');
    const [[user]] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.provider_start_date,a.timezone
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? JOIN agencies a ON a.id=ua.agency_id
      WHERE u.id=?`, [item.agencyId,item.userId]);
    if (!user || `${user.first_name} ${user.last_name}` !== item.expectedName) throw new Error(`Identity mismatch for ${item.userId}; nothing imported.`);
    const [dates] = await db.execute(`SELECT f.field_key,v.value FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id
      WHERE v.user_id=? AND f.field_key IN ('start_date','first_client_date') ORDER BY (f.agency_id IS NULL),v.updated_at`, [user.id]);
    for (const date of dates) user[date.field_key === 'start_date' ? 'lifecycle_start_date' : date.field_key] = date.value;
    const start = serviceDates(user).award_start_date;
    for (const year of [1,2,3,4]) {
      const checked = item.completedYears.includes(year);
      const eligible = start ? anniversary(start,year) : null;
      const status = checked ? 'gift_sent' : eligible && eligible <= agencyToday(user.timezone) ? 'owed' : 'upcoming';
      const note = `${item.source}. Year ${year}: ${checked ? 'checked (gift/dinner recorded)' : 'unchecked (completion not recorded)'}. Sheet start: ${item.sourceDate || 'blank'}; app dates retained.${item.note ? ` Source note: ${item.note}.` : ''}`;
      if (apply) {
        await db.execute(`INSERT INTO employee_service_milestones (agency_id,user_id,milestone_years,milestone_date,status)
          VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE status=IF(status IN ('gift_sent','acknowledged'),status,VALUES(status))`, [item.agencyId,user.id,year,eligible,status]);
        const [[row]] = await db.execute('SELECT id FROM employee_service_milestones WHERE agency_id=? AND user_id=? AND milestone_years=? FOR UPDATE', [item.agencyId,user.id,year]);
        const [[existing]] = await db.execute('SELECT COUNT(*) n FROM employee_award_notes WHERE milestone_id=? AND note=?', [row.id,note]);
        if (!existing.n) await db.execute('INSERT INTO employee_award_notes (milestone_id,note) VALUES (?,?)', [row.id,note]);
      }
      awards++; if (checked) completed++;
    }
  }
  if (apply) await db.commit(); else await db.rollback();
  console.log(JSON.stringify({ apply, people: input.length, awards, recordedCompletions: completed, employmentDatesChanged: 0 }));
} catch (error) { await db.rollback(); throw error; }
finally { db.release(); await pool.end(); }
