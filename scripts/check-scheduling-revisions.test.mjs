import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulingRevisionProblems} from './check-scheduling-revisions.mjs';
const service=()=>({spec:{template:{metadata:{annotations:{'autoscaling.knative.dev/minScale':'0'}}}},status:{traffic:[{revisionName:'new',percent:100}]}});
const revision=(name,active,minimum)=>({metadata:{name,annotations:{'autoscaling.knative.dev/minScale':String(minimum)}},status:{conditions:[{type:'Active',status:active?'True':'False'}]}});
test('permits drained history and ordinary transient old instances with no pinned capacity',()=>{
 assert.deepEqual(schedulingRevisionProblems(service(),[revision('new',true,0),revision('ancient',false,2),revision('draining',true,0)]),[]);
});
test('rejects the old production incident even if new requests are all on the corrected build',()=>{
 assert.match(schedulingRevisionProblems(service(),[revision('new',true,0),revision('caseload-old',true,2)]).join(' '),/caseload-old/);
});
test('rejects preview tags, split production, and a revision minimum that could pin the next release',()=>{
 const s=service();s.status.traffic.push({revisionName:'preview',tag:'candidate'});
 assert.match(schedulingRevisionProblems(s,[]).join(' '),/callable tag/);
 s.status.traffic=[{revisionName:'new',percent:50},{revisionName:'old',percent:50}];
 assert.match(schedulingRevisionProblems(s,[]).join(' '),/one production revision/);
 s.spec.template.metadata.annotations['autoscaling.knative.dev/minScale']='2';
 assert.match(schedulingRevisionProblems(s,[]).join(' '),/minimum instances/);
});
