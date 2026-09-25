// Suitable for a scheduled Cloud Run Job. Uses the same opt-in gates as the app.
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {runEligibilityAutomation} from '../services/eligibilityAutomation.service.js';
try {
  const results=await runEligibilityAutomation();
  console.log(JSON.stringify({agencies:results.length,returned:results.reduce((n,r)=>n+r.returned,0),needsReview:results.reduce((n,r)=>n+r.needsReview,0)}));
}catch {console.error('Eligibility worker could not complete; check configuration and migrations.');process.exitCode=1;}
finally {await pool.end();await clinicalPool.end();}
