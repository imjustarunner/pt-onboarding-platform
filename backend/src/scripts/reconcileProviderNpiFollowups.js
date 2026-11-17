import fs from 'node:fs/promises';
import pool from '../config/database.js';
import { loadProviderNpiCandidates, reconcileProviderNpiFollowups } from '../services/providerNpiFollowup.service.js';

// Uses the configured operational database connection. Never accepts a human
// actor ID or creates application authentication credentials. Dry run by default.
const apply = process.argv.includes('--apply');
const sinceDate = process.argv.find(a=>a.startsWith('--since='))?.slice(8);
const agencyIds = process.argv.filter(a=>a.startsWith('--agency-id=')).map(a=>Number(a.slice(12)));
if (agencyIds.some(id=>!Number.isSafeInteger(id)||id<1)) throw new Error('Invalid agency ID.');
const report = process.argv.find(a=>a.startsWith('--report='))?.slice(9);
try {
  const options={sinceDate,...(agencyIds.length?{agencyIds}:{})};
  const providers=await loadProviderNpiCandidates(options,pool);
  const rows=providers.filter(p=>Number(p.in_cohort)).map(p=>({providerId:p.id,name:[p.first_name,p.last_name].join(' '),
    agencyId:p.agency_id,agency:p.agency_name,status:p.status,createdAt:p.created_at,hiredAt:p.hired_at,
    providerStartDate:p.provider_start_date,onboardingStartedAt:p.onboarding_started_at,...p.npi}));
  if(report)await fs.writeFile(report,JSON.stringify(rows,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({apply,providers:rows.length,states:rows.reduce((counts,p)=>({...counts,[p.state]:(counts[p.state]||0)+1}),{})}));
  if(apply) {
    const result=await reconcileProviderNpiFollowups(options);
    console.log(JSON.stringify({created:result.created,checked:result.checked,skipped:result.skipped||false}));
  }
} finally {await pool.end();}
