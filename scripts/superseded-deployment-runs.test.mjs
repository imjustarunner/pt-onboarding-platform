import {test} from 'node:test';import assert from 'node:assert/strict';
import {supersededDeploymentRuns as select} from './superseded-deployment-runs.mjs';
const head='a'.repeat(40),live='b'.repeat(40),old='c'.repeat(40),options={head,liveBuilds:[live,live]},run={id:1,path:'.github/workflows/deploy-backend.yml',head_branch:'main',event:'push',status:'in_progress',head_sha:old};
test('selects superseded deployment runs, including queued counterparts',()=>assert.deepEqual(select([run,{...run,id:2,path:'.github/workflows/deploy-frontend.yml',status:'pending'}],options).map(r=>r.id),[1,2]));
test('preserves the current candidate and both currently live builds',()=>assert.deepEqual(select([{...run,head_sha:head},{...run,head_sha:live},{...run,head_sha:'d'.repeat(40)}],{head,liveBuilds:[live,'d'.repeat(40)]}),[]));
test('preserves other branches, workflows, event types and completed results',()=>assert.deepEqual(select([{...run,head_branch:'other'},{...run,path:'.github/workflows/release-recovery-regressions.yml'},{...run,event:'pull_request'},{...run,status:'completed'}],options),[]));
test('fails closed without verified production sources',()=>{assert.throws(()=>select([run],{head,liveBuilds:[]}));assert.throws(()=>select([run],{head:'main',liveBuilds:[live,live]}));});
