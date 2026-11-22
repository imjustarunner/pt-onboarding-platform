import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export async function waitForPairedRelease({candidate,read,timeoutMs=600000,pollMs=5000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}){
 if(!/^[a-f0-9]{40}$/i.test(candidate||''))throw Error('A paired release requires the source commit ID.');
 const deadline=now()+timeoutMs;let reason='The paired image is not staged yet.';
 do {
  try{const version=await read();if(version?.buildId===candidate&&version?.ready===true)return;reason='The paired release is not ready at this source commit.';}
  catch{reason='The paired release could not be verified.';}
  if(now()>=deadline)break;
  await sleep(pollMs);
 }while(now()<=deadline);
 throw Error(reason+' Production traffic was not promoted.');
}
async function readVersion(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error('Version unavailable');return r.json();}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,candidate]=process.argv.slice(2);
 try{
  let read;
  if(mode==='frontend-staged')read=async()=>{
   const service=JSON.parse(execFileSync('gcloud',['run','services','describe','onboarding-frontend','--region','us-west3','--format=json(status.traffic)'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
   const tag=`release-${candidate.slice(0,12)}`;const target=service.status?.traffic?.find(row=>row.tag===tag);
   if(!target?.url)return null;
   return {...await readVersion(`${target.url}/version.json`),ready:true};
  };
  else if(mode==='backend-live')read=()=>readVersion('https://app.itsco.health/api/app-version');
  else throw Error('Choose frontend-staged or backend-live.');
  console.log(`Waiting for ${mode} at ${candidate}.`);
  await waitForPairedRelease({candidate,read});console.log('Paired release source and readiness verified.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
