import pool from '../config/database.js';
import {retireLegacyPrograms} from '../services/programRetirement.service.js';

const args = process.argv.slice(2);
if (!/^\d+$/.test(args[0] || '') || args.length>2 || (args[1] && args[1]!=='--apply')) {
  throw new Error('Usage: node src/scripts/retireLegacyPrograms.js AGENCY_ID [--apply]');
}
const db = await pool.getConnection();
try {
  await db.query("SET time_zone='+00:00'");
  const report = await retireLegacyPrograms(db, Number(args[0]), {apply:args[1]==='--apply'});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
} finally { db.release(); await pool.end(); }
