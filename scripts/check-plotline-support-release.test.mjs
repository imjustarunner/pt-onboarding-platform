import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPlotlineSupportCandidate} from './check-plotline-support-release.mjs';
const candidate='a'.repeat(40),baseUrl='https://candidate.example.test';
const ready={ready:true,productName:'Plotline',operatorName:'PlotTwistCo'};
test('checks the exact staged candidate and support prerequisites without creating tickets',async()=>{
 const urls=[];
 const result=await checkPlotlineSupportCandidate({baseUrl,candidate,read:async url=>{urls.push(String(url));return urls.length===1?{buildId:candidate,ready:true}:ready;}});
 assert.deepEqual(result,{candidate,ready:true});
 assert.deepEqual(urls,[baseUrl+'/api/app-version',baseUrl+'/api/public/agency-support/plotline/platform/readiness']);
});
test('rejects the old live source even if its health check passes',async()=>{
 await assert.rejects(checkPlotlineSupportCandidate({baseUrl,candidate,read:async()=>({buildId:'b'.repeat(40),ready:true})}),/source or backend readiness/);
});
test('blocks promotion when support prerequisites or the operator are incorrect',async()=>{
 for(const state of [{...ready,ready:false},{...ready,operatorName:'Employer People Operations'}]){
  await assert.rejects(checkPlotlineSupportCandidate({baseUrl,candidate,read:async url=>url.pathname.endsWith('app-version')?{buildId:candidate,ready:true}:state}),/prerequisites/);
 }
});
test('propagates inaccessible configuration rather than treating a staged request as success',async()=>{
 await assert.rejects(checkPlotlineSupportCandidate({baseUrl,candidate,read:async url=>{if(url.pathname.endsWith('app-version'))return {buildId:candidate,ready:true};throw Error('Configuration unavailable');}}),/Configuration unavailable/);
});
