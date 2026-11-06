import fs from 'node:fs/promises';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(a=>{const [key,...value]=a.slice(2).split('=');return[key,value.length?value.join('='):true];}));
if(!args['audit-dir'])throw new Error('Use --audit-dir=/absolute/path to retain the before/after access audit.');
const output=path.resolve(String(args['audit-dir']));
process.env.SKIP_DB_CONNECT='1';
const { captureAgencyAccessState,activateAgencyAccessProfiles } = await import('../services/agencyAccessTransitionAudit.service.js');
const pool=(await import('../config/database.js')).default;
const db=await pool.getConnection();
try {
  await fs.mkdir(output,{recursive:true});
  const snapshot=await captureAgencyAccessState(db);
  await fs.writeFile(path.join(output,'cutover-before.json'),JSON.stringify(snapshot,null,2),{flag:'wx'});
  if(!args.apply){console.log(JSON.stringify({mode:'read_only',users:snapshot.users.length,memberships:snapshot.memberships.length,auditDirectory:output}));}
  else {
    const result=await activateAgencyAccessProfiles(db,{expectedDatabase:String(args['expected-database']||''),actorUserId:Number(args['actor-user-id']||0)});
    await fs.writeFile(path.join(output,'cutover-result.json'),JSON.stringify(result,null,2),{flag:'wx'});
    console.log(JSON.stringify(result.report||{alreadyActive:result.alreadyActive}));
  }
}finally{db.release();await pool.end();}
