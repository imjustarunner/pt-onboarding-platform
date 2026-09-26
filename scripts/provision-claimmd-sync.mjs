// Provision a read-only Claim.MD response/ERA polling job from the serving backend.
// Environment values remain in memory/private temporary files and are never logged.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const project=process.env.GCP_PROJECT_ID||'ptonboard-dev',region=process.env.GCP_REGION||'us-west3';
const name='claimmd-tisi-sync',runtimeService='onboarding-backend';
const call=(args,format='json')=>{
 const result=spawnSync('gcloud',[...args,`--project=${project}`,'--quiet',`--format=${format}`],{encoding:'utf8',maxBuffer:10*1024*1024});
 if(result.status!==0)throw Error(`Cloud operation failed: ${args.slice(0,3).join(' ')}. Inspect IAM and service configuration.`);
 return format==='json'?JSON.parse(result.stdout||'{}'):result.stdout.trim();
};
let dir;
try{
 const service=call(['run','services','describe',runtimeService,`--region=${region}`]);
 const serving=service.status.traffic.find(t=>t.percent===100)?.revisionName;
 if(!serving)throw Error('A single serving backend revision is required');
 const revision=call(['run','revisions','describe',serving,`--region=${region}`]);
 const spec=revision.spec,container=spec.containers[0],sa=spec.serviceAccountName;
 if(!sa)throw Error('Runtime service account is missing');
 const selected=(container.env||[]).filter(e=>/^(DB_|CLINICAL_DB_|FAMILY_BILLING_ENCRYPTION_|FAMILY_BILLING_PREVIOUS_KEYS_JSON$|CLIENT_CHAT_ENCRYPTION_|CLAIM_MD_ACCOUNT_)/.test(e.name));
 selected.push({name:'CLAIM_MD_AGENCY_IDS',value:'377'},{name:'CLAIM_MD_MODE',value:'disabled'},{name:'NODE_ENV',value:'production'});
 const required=['CLAIM_MD_ACCOUNT_KEY','CLAIM_MD_ACCOUNT_ID','FAMILY_BILLING_ENCRYPTION_KEY_BASE64'];
 if(required.some(name=>!selected.some(e=>e.name===name)))throw Error('Backend billing credentials are incomplete');
 const annotations=Object.fromEntries(Object.entries(revision.metadata.annotations||{}).filter(([key])=>['run.googleapis.com/cloudsql-instances','run.googleapis.com/vpc-access-connector','run.googleapis.com/vpc-access-egress','run.googleapis.com/network-interfaces'].includes(key)));
 const job={apiVersion:'run.googleapis.com/v1',kind:'Job',metadata:{name},spec:{template:{metadata:{annotations},spec:{taskCount:1,parallelism:1,template:{spec:{serviceAccountName:sa,maxRetries:0,timeoutSeconds:'900',containers:[{image:revision.status.imageDigest||container.image,command:['node'],args:['src/scripts/syncClaimMdResponses.js'],env:selected,resources:{limits:{cpu:'1',memory:'512Mi'}}}]}}}}}};
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({job:name,agencyIds:[377],sourceRevision:serving,schedule:'Every 15 minutes',submitsClaims:false,apply:false}));process.exit(0);}
 dir=mkdtempSync(join(tmpdir(),'claimmd-job-'));const file=join(dir,'job.json');writeFileSync(file,JSON.stringify(job),{mode:0o600});
 call(['services','enable','cloudscheduler.googleapis.com']);
 call(['run','jobs','replace',file,`--region=${region}`]);
 call(['run','jobs','add-iam-policy-binding',name,`--region=${region}`,`--member=serviceAccount:${sa}`,'--role=roles/run.invoker']);
 const jobs=call(['scheduler','jobs','list',`--location=${region}`]);
 const exists=jobs.some(j=>j.name?.endsWith('/'+name));
 call(['scheduler','jobs',exists?'update':'create','http',name,`--location=${region}`,'--schedule=*/15 * * * *','--time-zone=America/Denver',`--uri=https://${region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${project}/jobs/${name}:run`,'--http-method=POST',`--oauth-service-account-email=${sa}`,'--message-body={}','--attempt-deadline=60s']);
 console.log(JSON.stringify({job:name,agencyIds:[377],sourceRevision:serving,schedule:'Every 15 minutes',submitsClaims:false,applied:true}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(dir)rmSync(dir,{recursive:true,force:true});}
