// Usage: node src/scripts/backfillDepartmentalEmailTickets.js --agency=2 [--limit=50] [--after=0] [--apply]
import pool from '../config/database.js';
import { backfillDepartmentalEmailTickets } from '../services/departmentalEmailBackfill.service.js';
const value = name => process.argv.find(arg=>arg.startsWith(`${name}=`))?.slice(name.length+1);
try {
  const report = await backfillDepartmentalEmailTickets({agencyId:Number(value('--agency')),
    apply:process.argv.includes('--apply'),limit:Number(value('--limit')) || 50,afterId:Number(value('--after')) || 0});
  console.log(JSON.stringify(report,null,2));
  if (report.results.some(result=>result.status==='failed' || result.status==='needs_review')) process.exitCode=1;
} catch (error) { console.error(error.code || error.message); process.exitCode=1; }
finally { await pool.end(); }
