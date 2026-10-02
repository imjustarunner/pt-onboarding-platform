// Apply migration 1521 and deploy encrypted readers/writers first. No content is logged.
import pool from '../config/database.js';
import {backfillMeetingEncryption} from '../services/meetingEncryptionBackfill.service.js';
try {
  const apply=process.argv.includes('--apply');
  await backfillMeetingEncryption(pool,{apply,onProgress:({table,rows})=>console.log(`${apply?'Encrypted':'Would encrypt'} ${table}: ${rows} rows`)});
} catch(error) {
  console.error('Meeting encryption backfill stopped. No row contents were logged.',error?.code || 'ENCRYPTION_BACKFILL_FAILED');
  process.exitCode=1;
} finally {await pool.end();}
