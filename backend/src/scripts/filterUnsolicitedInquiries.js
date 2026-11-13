// Dry-run default. Example: node src/scripts/filterUnsolicitedInquiries.js --agency-id 2 --ticket-id 646
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pool from '../config/database.js';
import {cleanUpWebsiteSolicitations} from '../services/unsolicitedOutreachCleanup.service.js';

export async function main(args=process.argv.slice(2)) {
  const allowed=new Set(['--agency-id','--ticket-id','--limit','--apply','--dry-run']);
  const values={};
  for (let i=0;i<args.length;i++) {
    const flag=args[i];
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (flag==='--apply'||flag==='--dry-run') {values[flag]=true;continue;}
    if (!args[i+1]||args[i+1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values[flag]=args[++i];
  }
  if (values['--apply']&&values['--dry-run']) throw new Error('Choose --apply or --dry-run');
  return cleanUpWebsiteSolicitations({agencyId:values['--agency-id'],ticketId:values['--ticket-id'],limit:values['--limit'],apply:!!values['--apply']});
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error('[outreach cleanup]',error.code||error.message);process.exitCode=1;})
    .finally(()=>pool.end());
}
