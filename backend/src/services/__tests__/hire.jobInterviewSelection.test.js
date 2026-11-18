import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {resolveInterviewQuestionSelection,questionFingerprint} from '../jobInterviewQuestions.service.js';
import {buildInterviewFlow} from '../interviewHub.service.js';
const job={id:4,agency_id:6,job_description_id:45,is_active:true,title:'Operations guide',questions_json:[{key:'q1',text:'Prioritize two urgent tasks.'},{key:'q2',text:'Explain a process improvement.'}]};
const shared={id:8,agency_id:6,job_description_id:null,is_active:true,title:'Teamwork',questions_json:[{key:'q1',text:'Describe a handoff.'}]};
const ref=(set,index=0)=>({setId:set.id,questionKey:set.questions_json[index].key,fingerprint:questionFingerprint(set.questions_json[index].text)});
const resolve=(selection,overrides={})=>resolveInterviewQuestionSelection({selection,agencyId:6,jobDescriptionId:45,template:null,findSet:async id=>id===4?job:shared,...overrides});
it('snapshots only the chosen questions, preserving mixed-set order and unambiguous identities',async()=>{
 const selected=await resolve([ref(shared),ref(job,1)]);
 expect(selected.map(q=>q.text)).toEqual(['Describe a handoff.','Explain a process improvement.']);
 expect(selected.map(q=>q.key)).toEqual(['8:q1','4:q2']);
 const flow=buildInterviewFlow({jobQuestionSet:job,selectedQuestions:selected});
 expect(flow.sections.flatMap(section=>section.questions || []).map(q=>q.text)).toEqual(selected.map(q=>q.text));
 expect(flow.sections.find(section=>section.key==='standard')).toBeUndefined();
 expect(flow.sections.find(section=>section.key==='job_specific').label).toBe('Interview questions');
 const snapshot=JSON.stringify(flow);shared.questions_json[0].text='Changed later';expect(JSON.stringify(flow)).toBe(snapshot);shared.questions_json[0].text='Describe a handoff.';
});
it('can select one starter question without adding the rest of the defaults',async()=>{
 const selection=[{setId:null,questionKey:'motivation',fingerprint:questionFingerprint('What drew you to this role and our organization?')}];
 const selected=await resolve(selection);expect(selected).toHaveLength(1);expect(selected[0].sourceTitle).toBe('Plotline starter questions');
 expect(buildInterviewFlow({template:{flow_sections_json:[{key:'candidate_questions'}]},selectedQuestions:selected}).sections[0].questions).toHaveLength(1);
});
it.each([{agency_id:99},{job_description_id:99},{is_active:false},null])('rejects a foreign, unrelated, inactive or missing set before using its content: %j',async patch=>{
 await expect(resolve([ref(job)],{findSet:async()=>patch?{...job,...patch}:null})).rejects.toMatchObject({status:400});
});
it('rejects a stale question even when its key still exists',async()=>{
 await expect(resolve([{...ref(job),fingerprint:questionFingerprint('Old text')}])).rejects.toMatchObject({status:409});
});
it('rejects duplicate, empty, missing, oversized and malformed selections',async()=>{
 for(const selected of [[],[ref(job),ref(job)],[{...ref(job),questionKey:'missing'}],Array(101).fill(ref(job)),[{setId:'4junk',questionKey:'q1'}]])await expect(resolve(selected)).rejects.toMatchObject({status:400});
});
it('retains existing caller behavior when a selection was not supplied',async()=>{expect(await resolve(null)).toBeNull();expect(buildInterviewFlow().sections.find(s=>s.key==='standard').questions).toHaveLength(5);});
