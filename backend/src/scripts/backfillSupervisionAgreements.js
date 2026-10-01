/** Create current mental-health supervision agreements without signing or sending them.
 * NODE_ENV=production node src/scripts/backfillSupervisionAgreements.js --apply
 * Without --apply, lists only the number of assignments to evaluate.
 */
import pool from '../config/database.js';
import {ensureSupervisionAgreement} from '../services/supervisionAgreement.service.js';
try {
  const [assignments]=await pool.execute("SELECT id FROM supervisor_assignments WHERE supervisor_type IN ('clinical','billing')");
  if(!process.argv.includes('--apply'))console.log(JSON.stringify({dryRun:true,assignmentsToEvaluate:assignments.length}));
  else {
    let available=0,skipped=0;
    for(const a of assignments){if(await ensureSupervisionAgreement(a.id))available++;else skipped++;}
    console.log(JSON.stringify({available,skipped,signaturesCreated:0}));
  }
}catch(error){console.error('Agreement backfill failed:',error.code||error.message);process.exitCode=1;}
finally{await pool.end();}
