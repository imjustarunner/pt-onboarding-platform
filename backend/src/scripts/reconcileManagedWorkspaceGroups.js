import { readFile, writeFile } from 'node:fs/promises';
import pool from '../config/database.js';
import { reconcileManagedWorkspaceGroups } from '../services/managedWorkspaceGroups.service.js';
import { withMessagingJobLock } from '../services/messagingJobLock.service.js';
const value = name => process.argv.find(s=>s.startsWith(`${name}=`))?.slice(name.length+1);
try {
  const prior=value('--resume-created')?JSON.parse(await readFile(value('--resume-created'),'utf8')):[];
  const createdGroupEmails=prior.flatMap(r=>(r.groups||[]).filter(g=>g.created).map(g=>g.email));
  const work = () => reconcileManagedWorkspaceGroups({ apply:process.argv.includes('--apply'), createdGroupEmails, createMissingOnly:process.argv.includes('--create-missing-only'), agencyIds:value('--agency')?.split(',').map(Number) || null });
  let report;
  for(let attempt=0;attempt<10;attempt++) {
    report = process.argv.includes('--apply') ? await withMessagingJobLock(process.argv.includes('--create-missing-only') ? 'workspace-new-groups' : 'staff-membership',work,{timeoutSeconds:30}) : await work();
    if(report?.skipped!=='already_running')break;
    console.log('Waiting for the existing membership job to finish.');
  }
  if(value('--report'))await writeFile(value('--report'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(Array.isArray(report)?report.map(r=>({agencyId:r.agencyId,domain:r.domain,error:r.error,missingMailbox:r.missingMailbox,unclassified:r.unclassified,
    groups:r.groups.map(g=>({email:g.email,created:g.created,aiRole:g.aiRole,add:g.added.length,remove:g.removed.length,preserved:g.preserved,error:g.error}))})):report,null,2));
  if(Array.isArray(report)&&report.some(r=>r.error||r.groups.some(g=>g.error)))process.exitCode=1;
} catch(e) {console.error(e.message);process.exitCode=1;}
finally {await pool.end();}
