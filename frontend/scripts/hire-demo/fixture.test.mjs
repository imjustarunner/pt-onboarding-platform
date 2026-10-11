import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,handleDemo,snapshot,requiredFor,definitionsFor,bookFor} from './fixture.mjs';
const call=(s,path,body={})=>handleDemo(s,'POST',path,body);
function completeCourse(s,key,purpose='onboarding') {
 const {id}=call(s,`/document-learning/courses/${key}/start`,{purpose,requestKey:`${key}-${purpose}`});
 const def=definitionsFor(s).find(d=>d.documentKey===key);
 for(const slug of def.requiredSections)call(s,`/document-learning/enrollments/${id}/reading`,{slug});
 call(s,`/document-learning/enrollments/${id}/quiz`,{answers:def.questions.map(q=>q.correctAnswer),requestKey:`quiz-${id}`});
 return id;
}
test('company and role requirements follow the production catalog',()=>{
 assert.ok(requiredFor(createDemo()).includes('school-practice-guide'));
 assert.ok(requiredFor(createDemo()).includes('facilitator-coding-protocol'));
 assert.ok(!requiredFor(createDemo({school:false})).includes('school-practice-guide'));
 assert.ok(!requiredFor(createDemo({role:'provider'})).includes('facilitator-coding-protocol'));
 for(const company of ['nlu','tisi'])assert.ok(!requiredFor(createDemo({company})).includes('school-practice-guide'));
 for(const role of ['staff','intern','provider','facilitator'])assert.ok(requiredFor(createDemo({role})).includes('mandated-reporting-sop'));
 for(const key of ['clinical-note-aid-guide','group-psychotherapy-sop','caseload-management-sop'])assert.ok(!requiredFor(createDemo()).includes(key));
 assert.throws(()=>bookFor(createDemo({company:'tisi'}).agency,'school-practice-guide'));
});
test('prehire, admin review, onboarding and employee transitions enforce required work',()=>{
 const s=createDemo(); assert.throws(()=>call(s,'/submit')); assert.throws(()=>call(s,'/advance'));
 for(const step of snapshot(s).workflow.steps.pre_hire.filter(x=>x.required))call(s,`/workflow/${step.key}`,step.key==='profile'?{values:s.profile,complete:true}:step.key==='work-email'?{email:'alex.demo@example.test'}:{acknowledged:true});
 call(s,'/submit');assert.equal(s.status,'PREHIRE_REVIEW');assert.throws(()=>call(s,'/workflow/background',{}));call(s,'/advance');assert.equal(s.status,'ONBOARDING');assert.throws(()=>call(s,'/submit'));
 for(const step of snapshot(s).workflow.steps.onboarding.filter(x=>x.required&&x.kind!=='guide-training'))call(s,`/workflow/${step.key}`,step.key==='handbook'?{acknowledged:true,signatureData:'demo',handbookVersionId:bookFor(s.agency,'workplace-handbook').version.id}:{acknowledged:true});
 assert.throws(()=>call(s,'/submit'));
 for(const key of requiredFor(s))completeCourse(s,key);
 call(s,'/submit');call(s,'/advance');assert.ok(s.activated);assert.throws(()=>call(s,'/workflow/account',{}));
});
test('optional retakes cannot complete onboarding or create paid time',()=>{
 const s=createDemo({phase:'onboarding'}), id=completeCourse(s,'provider-guide','practice');
 assert.equal(snapshot(s).workflow.steps.onboarding.find(x=>x.documentKey==='provider-guide').complete,false);
 const base={sessionId:'1234567890abcdef',sequence:1,active:true};handleDemo(s,'POST',`/document-learning/enrollments/${id}/heartbeat`,base,1000);handleDemo(s,'POST',`/document-learning/enrollments/${id}/heartbeat`,{...base,sequence:2},16000);assert.equal(s.seconds,0);
 call(s,'/assign',{key:'provider-guide'});assert.ok(s.records.some(r=>r.purpose==='assigned'));
});
test('real reading gates, failed quiz feedback and retries; timer rejects duplicate sequence',()=>{
 const s=createDemo({phase:'onboarding'}),d=definitionsFor(s)[0],{id}=call(s,`/document-learning/courses/${d.documentKey}/start`,{purpose:'onboarding'});
 assert.throws(()=>call(s,`/document-learning/enrollments/${id}/quiz`,{answers:d.questions.map(q=>q.correctAnswer)}));
 for(const slug of d.requiredSections)call(s,`/document-learning/enrollments/${id}/reading`,{slug});
 const failed=call(s,`/document-learning/enrollments/${id}/quiz`,{answers:d.questions.map(q=>(q.correctAnswer+1)%q.options.length),requestKey:'bad'});assert.equal(failed.passed,false);assert.equal(failed.feedback.length,d.questions.length);
 const heartbeat={sessionId:'1234567890abcdef',sequence:1,active:true};const url=`/document-learning/enrollments/${id}/heartbeat`;
 handleDemo(s,'POST',url,heartbeat,1000);handleDemo(s,'POST',url,{...heartbeat,sequence:2},16000);handleDemo(s,'POST',url,{...heartbeat,sequence:2},17000);assert.equal(s.seconds,15);
 const passed=call(s,`/document-learning/enrollments/${id}/quiz`,{answers:d.questions.map(q=>q.correctAnswer),requestKey:'good'});assert.ok(passed.passed);assert.equal(s.records[0].attempts.length,2);
});
