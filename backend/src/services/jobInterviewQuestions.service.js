import pool from '../config/database.js';
import {createHash} from 'node:crypto';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import InterviewHubJobQuestionSet from '../models/InterviewHubJobQuestionSet.model.js';
import {DEFAULT_STANDARD_QUESTIONS,normalizeQuestionList} from './interviewHub.service.js';

export function starterInterviewQuestions(template) {
  const used=new Set();
  return normalizeQuestionList(Array.isArray(template?.standard_questions_json) ? template.standard_questions_json : DEFAULT_STANDARD_QUESTIONS).map((q,index)=>{
    let key=/^[a-zA-Z0-9_-]{1,80}$/.test(q.key) && !used.has(q.key)?q.key:`starter_${index+1}`;
    while(used.has(key))key+='x';used.add(key);return {...q,key};
  });
}
export const questionFingerprint=text=>createHash('sha256').update(text).digest('hex');
export const questionsWithFingerprints=questions=>normalizeQuestionList(questions).map(q=>({...q,fingerprint:questionFingerprint(q.text)}));
export const questionSetWithFingerprints=set=>({...set,questions_json:questionsWithFingerprints(set.questions_json)});

/** The job and its own starter set commit together under the normal creator. */
export async function createJobWithInterviewQuestions(input,{db=pool}={}) {
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    const job=await HiringJobDescription.create({...input,executor:conn});
    const [[template]]=await conn.execute('SELECT standard_questions_json FROM interview_hub_templates WHERE agency_id=? AND is_default=1 ORDER BY id ASC LIMIT 1',[input.agencyId]);
    let questions=template?.standard_questions_json;
    if(typeof questions==='string')questions=JSON.parse(questions);
    await InterviewHubJobQuestionSet.saveDefaultForJob({agencyId:input.agencyId,jobDescriptionId:job.id,title:`${job.title} interview guide`,
      questionsJson:starterInterviewQuestions(template?{standard_questions_json:questions}:null),createdByUserId:input.createdByUserId,onlyIfMissing:true,executor:conn});
    await conn.commit();
    return job;
  }catch(error){await conn.rollback();throw error;}
  finally{conn.release();}
}

/** Only scoped references are accepted. Client-supplied question bodies cannot
 * substitute another job/company's content. The resolved copy is snapshotted. */
export async function resolveInterviewQuestionSelection({selection,agencyId,jobDescriptionId,template,findSet=id=>InterviewHubJobQuestionSet.findById(id)}) {
  if(selection===undefined || selection===null)return null; // Legacy callers.
  const invalid=message=>Object.assign(new Error(message),{status:400});
  if(!Array.isArray(selection)||selection.length<1||selection.length>100)throw invalid('Select between 1 and 100 interview questions.');
  const sets=new Map(),seen=new Set(),fingerprints=new Set(),questions=[];
  for(const ref of selection) {
    if(!ref || typeof ref!=='object' || typeof ref.questionKey!=='string' || ref.questionKey.length>120)throw invalid('Choose a valid interview question.');
    const setId=ref.setId==null?null:Number(ref.setId);
    if(setId!==null && (!Number.isSafeInteger(setId)||setId<1))throw invalid('Choose a valid question set.');
    let set=null;
    if(setId!==null) {
      if(!sets.has(setId))sets.set(setId,await findSet(setId));
      set=sets.get(setId);
      if(!set || Number(set.agency_id)!==Number(agencyId) || !set.is_active ||
        (set.job_description_id!=null && Number(set.job_description_id)!==Number(jobDescriptionId)))throw invalid('Choose active questions for this job or a shared set from this company.');
    }
    const list=set?normalizeQuestionList(set.questions_json):starterInterviewQuestions(template);
    const matches=list.filter(q=>q.key===ref.questionKey),identity=`${setId??'starter'}:${ref.questionKey}`;
    if(matches.length!==1 || seen.has(identity))throw invalid('A selected question changed or was selected twice. Reload the questions and review your selection.');
    if(ref.fingerprint!==questionFingerprint(matches[0].text))throw Object.assign(new Error('A selected question changed. Reload questions and review your selection before scheduling.'),{status:409});
    if(fingerprints.has(ref.fingerprint))throw invalid('The same question is selected from more than one set. Keep one copy of each question.');
    fingerprints.add(ref.fingerprint);
    seen.add(identity);
    questions.push({...matches[0],key:identity,sourceSetId:setId,sourceQuestionKey:ref.questionKey,sourceTitle:set?.title || (Array.isArray(template?.standard_questions_json)?'Company starter questions':'Plotline starter questions')});
  }
  return questions;
}
