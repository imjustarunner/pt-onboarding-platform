import {pathToFileURL} from 'node:url';

export async function checkPlotlineSupportCandidate({baseUrl,candidate,read=async url=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw Error(`Plotline support prerequisite check failed (${response.status}); production traffic must remain unchanged.`);
  return response.json();
}}){
  if(!/^[a-f0-9]{40}$/i.test(candidate||''))throw Error('A retained source commit is required.');
  const base=new URL(baseUrl);
  if(base.protocol!=='https:')throw Error('Candidate verification requires HTTPS.');
  const version=await read(new URL('/api/app-version',base));
  if(version.buildId!==candidate||version.ready!==true)throw Error('The candidate source or backend readiness does not match this release.');
  const readiness=await read(new URL('/api/public/agency-support/plotline/platform/readiness',base));
  if(readiness.ready!==true||readiness.productName!=='Plotline'||readiness.operatorName!=='PlotTwistCo')throw Error('Plotline platform support prerequisites are not verified.');
  return {candidate,ready:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await checkPlotlineSupportCandidate({baseUrl:process.argv[2],candidate:process.argv[3]});console.log('Plotline candidate source, migration, operator, owner, shared sender and human-verification configuration passed.');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
