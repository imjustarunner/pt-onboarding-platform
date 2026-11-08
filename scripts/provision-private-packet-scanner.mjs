// Review by default. --apply builds and enables the private, on-demand worker.
// Secrets stay in memory or a mode-0600 file that is removed before exit.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const project=process.env.GCP_PROJECT_ID||'ptonboard-dev',region=process.env.GCP_REGION||'us-west3',name='private-paper-packet-scan';
const run=(args,format='json')=>{
 const result=spawnSync('gcloud',[...args,`--project=${project}`,'--quiet',`--format=${format}`],{encoding:'utf8',maxBuffer:15*1024*1024});
 if(result.status!==0)throw Error(`Cloud operation failed: ${args.slice(0,3).join(' ')}. No credential values were printed.`);
 return format.startsWith('json')?JSON.parse(result.stdout||'{}'):result.stdout.trim();
};
let dir;
try {
 const service=run(['run','services','describe','onboarding-backend',`--region=${region}`],'json(status.traffic)');
 const serving=service.status.traffic.find(row=>row.percent===100)?.revisionName;
 if(!serving)throw Error('One serving backend revision is required.');
 const revision=run(['run','revisions','describe',serving,`--region=${region}`],
  'json(spec.serviceAccountName,spec.containers[0].image,spec.containers[0].env,metadata.annotations,status.imageDigest)');
 const spec=revision.spec,container=spec.containers[0],sa=spec.serviceAccountName;
 const selected=(container.env||[]).filter(e=>/^(DB_|CLINICAL_DB_|GCS_PROJECT_ID$|PTONBOARDFILES$|REFERRAL_KMS_KEY$|DOCUMENTS_KMS_KEY$|GOOGLE_CLOUD_PROJECT$|CLIENT_CHAT_ENCRYPTION_)/.test(e.name));
 for (let i=selected.length-1;i>=0;i--) if(['DB_CONNECTION_LIMIT','CLINICAL_DB_CONNECTION_LIMIT'].includes(selected[i].name))selected.splice(i,1);
 selected.push({name:'NODE_ENV',value:'production'},{name:'DB_CONNECTION_LIMIT',value:'2'},{name:'CLINICAL_DB_CONNECTION_LIMIT',value:'2'});
 if(!sa||!selected.some(e=>e.name==='DB_PASSWORD')||!selected.some(e=>e.name==='PTONBOARDFILES'))throw Error('Worker storage/database configuration is incomplete.');
 const annotations=Object.fromEntries(Object.entries(revision.metadata.annotations||{}).filter(([k])=>['run.googleapis.com/cloudsql-instances','run.googleapis.com/vpc-access-connector','run.googleapis.com/vpc-access-egress','run.googleapis.com/network-interfaces'].includes(k)));
 const image=`${region}-docker.pkg.dev/${project}/private-packet-scanner/worker:${serving}`;
 const resource=`projects/${project}/locations/${region}/jobs/${name}`;
 if(!process.argv.includes('--apply')){
  console.log(JSON.stringify({job:name,sourceRevision:serving,cpu:1,memory:'4Gi',timeoutSeconds:300,retries:0,schedule:null,publicEndpoint:false,mainBackendChanged:false,estimatedComputePerMinuteUSD:0.001872,apply:false}));
 } else {
  dir=mkdtempSync(join(tmpdir(),'private-packet-scanner-'));mkdirSync(join(dir,'backend'));
  copyFileSync(resolve('backend/Dockerfile.packet-scanner'),join(dir,'Dockerfile'));
  copyFileSync(resolve('backend/clamd.conf'),join(dir,'backend/clamd.conf'));
  const build={serviceAccount:`projects/${project}/serviceAccounts/packet-scanner-builder@${project}.iam.gserviceaccount.com`,options:{logging:'CLOUD_LOGGING_ONLY'},steps:[{name:'gcr.io/cloud-builders/docker',args:['build','--build-arg',`APP_IMAGE=${revision.status.imageDigest||container.image}`,'-t',image,'.']}],images:[image],timeout:'1200s'};
  writeFileSync(join(dir,'build.json'),JSON.stringify(build),{mode:0o600});
  run(['builds','submit',dir,`--config=${join(dir,'build.json')}`]);
  const job={apiVersion:'run.googleapis.com/v1',kind:'Job',metadata:{name},spec:{template:{metadata:{annotations},spec:{taskCount:1,parallelism:1,template:{spec:{serviceAccountName:sa,maxRetries:0,timeoutSeconds:'300',containers:[{name:'scanner',image,env:selected,resources:{limits:{cpu:'1',memory:'4Gi'}}}]}}}}}};
  writeFileSync(join(dir,'job.json'),JSON.stringify(job),{mode:0o600});
  run(['run','jobs','replace',join(dir,'job.json'),`--region=${region}`]);
  run(['run','jobs','add-iam-policy-binding',name,`--region=${region}`,`--member=serviceAccount:${sa}`,'--role=roles/run.jobsExecutorWithOverrides']);
  run(['run','services','update','onboarding-backend',`--region=${region}`,`--update-env-vars=PRIVATE_PACKET_SCAN_JOB=${resource}`]);
  console.log(JSON.stringify({job:name,enabled:true,cpu:1,memory:'4Gi',mainBackendResourcesChanged:false,realPatientFilesRead:false}));
 }
} catch(e){console.error(e.message);process.exitCode=1;}finally{if(dir)rmSync(dir,{recursive:true,force:true});}
