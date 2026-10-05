// Manual send uses the same claims, branded sender and calendar checks as the worker.
// Default is read-only; --send requires explicit booking IDs and a live-link check.
import pool from '../config/database.js';
import { runSchoolVisitReminders } from '../services/schoolVisitReminder.service.js';
import { createSchoolVisitChangeToken } from '../utils/schoolVisitChangeToken.js';
const sending=process.argv.includes('--send');
const idsArg=process.argv.find(arg=>arg.startsWith('--booking-ids='));
const bookingIds=idsArg?idsArg.split('=')[1].split(',').map(Number):null;
try {
  if(bookingIds?.some(id=>!Number.isInteger(id)||id<=0))throw new Error('Invalid booking IDs');
  if(sending && !bookingIds?.length)throw new Error('--send requires --booking-ids=1,2,...');
  const audit=await runSchoolVisitReminders({dryRun:true,sendUpcoming:true,bookingIds});
  if(sending) {
    for(const id of bookingIds) {
      if(!audit.some(row=>Number(row.bookingId)===id&&row.status==='due'))throw new Error(`Booking ${id} is not verified for sending`);
      const token=createSchoolVisitChangeToken(id);
      const response=await fetch(`https://app.itsco.health/api/public/school-visits/${token}`,{signal:AbortSignal.timeout(20000)});
      const body=await response.json().catch(()=>null);
      if(!response.ok||Number(body?.visit?.id)!==id)throw new Error(`Live change-request link is not ready for booking ${id}; no emails sent`);
    }
    console.log(JSON.stringify(await runSchoolVisitReminders({sendUpcoming:true,bookingIds}),null,2));
  } else console.log(JSON.stringify(audit,null,2));
} finally { await pool.end(); }
