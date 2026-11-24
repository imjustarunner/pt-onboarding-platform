// Operator provisioning through the established gcloud login, with its actual
// IAM attribution. Credential values are handled only in memory and uploaded
// over stdin to Secret Manager; never put in files, CLI arguments or logs.
import {spawnSync} from 'node:child_process';
const project='ptonboard-dev',region='us-west3',account=`auricwell-transition-sequence@${project}.iam.gserviceaccount.com`,secret='auricwell-transition-sequence-runtime',job='auricwell-transition-sequence';
function cloud(args,input){const r=spawnSync('gcloud',[...args,`--project=${project}`,'--quiet'],{input,encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error(`Cloud operation ${args[0]} ${args[1]} failed (exit ${r.status}).`);return r.stdout.trim();}
const dry=process.argv.includes('--dry-run');
try{
 const service=JSON.parse(cloud(['run','services','describe','onboarding-backend',`--region=${region}`,'--format=json']));
 const container=service.spec.template.spec.containers[0],env=new Map(container.env.map(e=>[e.name,e]));
 const names=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','CLIENT_CHAT_ENCRYPTION_KEY_BASE64','CLIENT_CHAT_ENCRYPTION_KEY_ID','GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64','WORKSPACE_EMAIL_RELAY_URL'];
 const config={};
 for(const name of names){const entry=env.get(name);if(!entry)continue;
  config[name]=entry.value!==undefined?entry.value:cloud(['secrets','versions','access',entry.valueFrom.secretKeyRef.key,`--secret=${entry.valueFrom.secretKeyRef.name}`]);
 }
 for(const required of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD','CLIENT_CHAT_ENCRYPTION_KEY_BASE64','GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64'])if(!config[required])throw Error(`Missing required configuration: ${required}`);
 if(!config.DB_HOST.startsWith('/cloudsql/'))throw Error('Expected the approved Cloud SQL socket.');
 const connection=config.DB_HOST.slice('/cloudsql/'.length),instance=connection.split(':').at(-1);
 if(dry){console.log(JSON.stringify({dryRun:true,job,serviceAccount:account,image:container.image,configurationNames:Object.keys(config),credentialValuesPrinted:false}));process.exit(0);}
 const exists=spawnSync('gcloud',['secrets','describe',secret,`--project=${project}`,'--format=value(name)'],{encoding:'utf8'}).status===0;
 if(!exists)cloud(['secrets','create',secret,'--replication-policy=automatic']);
 const version=cloud(['secrets','versions','add',secret,'--data-file=-','--format=value(name)'],JSON.stringify(config)).split('/').at(-1);
 cloud(['secrets','add-iam-policy-binding',secret,`--member=serviceAccount:${account}`,'--role=roles/secretmanager.secretAccessor','--format=value(version)']);
 cloud(['projects','add-iam-policy-binding',project,`--member=serviceAccount:${account}`,'--role=roles/cloudsql.client',`--condition=expression=resource.name == 'projects/${project}/instances/${instance}' && resource.service == 'sqladmin.googleapis.com',title=transition-single-instance`,'--format=value(version)']);
 cloud(['run','services','add-iam-policy-binding','workspace-mail-relay',`--region=${region}`,`--member=serviceAccount:${account}`,'--role=roles/run.invoker','--format=value(version)']);
 cloud(['run','jobs','deploy',job,`--region=${region}`,`--image=${container.image}`,`--service-account=${account}`,`--set-cloudsql-instances=${connection}`,'--command=node','--args=src/scripts/runTransitionMeetingSequence.mjs,status',`--set-secrets=TRANSITION_RUNTIME_CONFIG=${secret}:${version}`,'--set-env-vars=NODE_ENV=production,SKIP_DB_CONNECT=1','--tasks=1','--parallelism=1','--max-retries=0','--task-timeout=300s','--memory=512Mi','--cpu=1','--format=value(metadata.name)']);
 console.log(JSON.stringify({provisioned:true,job,serviceAccount:account,secretReference:`${secret}:${version}`,mode:'status',credentialValuesPrinted:false}));
}catch(error){console.error(JSON.stringify({error:String(error.message).slice(0,200)}));process.exitCode=1;}
