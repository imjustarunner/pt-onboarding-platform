import clientData from './narriva-clients.json';
import { NARRIVA_CHECKS } from '../../config/narrivaBrand.js';

// Public presentation data only. No production identifiers, model calls, clinical
// transport or signing tokens belong in this module. Every result is illustrative.
export const NARRIVA_DEMO_AGENCY = 990101;
export const NARRIVA_DEMO_NOTICE = 'Illustrative results only. No AI check runs, no clinical record is accessed, and no actual signature is created.';
export const narrivaExamples = clientData.clients;
export const NARRIVA_DEMO_INPUT_NOTICE = 'Demonstration only. No actual data can be entered or used in this demo.';
export const NARRIVA_DEMO_SOURCE_DISCLOSURE = clientData.disclosure;
export function exampleSections(example = narrivaExamples[0], corrected = true) {
 return example.sections.map(section=>({...section,text:section.key==='plan'&&!corrected?'Continue therapy.':section.text}));
}
export function examplePreviousRatings(example=narrivaExamples[0]) {
 return example.plan.goals.flatMap(goal=>goal.objectives.flatMap(objective=>['clinician','client'].map(kind=>({objective_id:objective.id,rater_kind:kind,rater_label:kind==='clinician'?'clinical observation':'client',scale_value:objective.scale_start,date_of_service:'2026-10-30',disposition:'rated',exampleOnly:true}))));
}
// JSON snapshots intentionally strip nested Vue proxies before the real preview
// component receives data. structuredClone cannot copy reactive note sections.
export const demoSnapshot=value=>JSON.parse(JSON.stringify(value));
export const NARRIVA_DEMO_CHECK_MS=1200;
export const NARRIVA_DEMO_APPROVAL_MS=1600;
export function exampleNoteContext(example=narrivaExamples[0],ratings=[]) {
 return {client:example.name,practice:'Meadowbrook Therapy',date:example.date,encounter:{...example.encounter},provider:{...example.provider},
  scores:example.plan.goals.flatMap(goal=>goal.objectives.flatMap(objective=>{
   const entries=ratings.filter(row=>Number(row.objectiveId??row.objective_id)===objective.id);
   return (entries.length?entries:[null]).map(row=>({goal:`G${goal.goal_index}`,goalText:goal.goal_text,objective:`O${objective.objective_index}`,objectiveText:objective.objective_text,timeframe:goal.timeframe,start:objective.scale_start,previous:row?.previousScaleValue??objective.scale_start,current:row?.scaleValue??row?.scale_value??null,target:objective.scale_target,direction:objective.direction,rater:row?.raterKind==='client'?'Client':row?.raterKind==='other'?(row.raterLabel||'Other'):'Clinician',disposition:row?.disposition||'not_recorded'}));
  }))};
}
export function exampleContextSections(context) {
 const e=context.encounter;
 return [{key:'encounter',label:'Encounter',text:`${context.client} · ${context.date} · ${e.time} · ${e.timezone}. ${context.provider.name}, ${context.provider.credential} · ${context.practice}. ${e.serviceLabel} (${e.serviceCode}), ${e.durationMinutes} minutes. ${e.locationDetail}. Participants: ${e.participants}.`},
 {key:'treatment_scores',label:'Treatment plan scores',text:context.scores.map(row=>`${row.goal} ${row.objective} · ${row.rater}: start ${row.start}, previous ${row.previous}, this session ${row.current??'not recorded'}, goal ${row.target} (1–10). ${row.goalText}`).join('\n')},
 {key:'risk_safety',label:'Risk & safety',text:e.riskSummary},{key:'consent',label:'Encounter consent',text:e.consentSummary}];
}
export function exampleTreatmentHistory({trend='progressing',example=narrivaExamples[0],ratings=[],lastDate='2026-11-06'} = {}) {
 const anchor=new Date(`${lastDate}T12:00:00Z`);
 const dates=Array.from({length:5},(_,index)=>new Date(anchor.getTime()-(4-index)*7*86400000).toISOString().slice(0,10));
 const clamp=value=>Math.max(1,Math.min(10,value));
 const objectives=example.plan.goals.flatMap(goal=>goal.objectives.flatMap(objective=>{
  const selected=ratings.filter(row=>Number(row.objectiveId??row.objective_id)===objective.id);
  const direction=objective.direction||(objective.scale_target<objective.scale_start?'lower':'higher');
  const groups=['clinician',...new Set(selected.map(row=>row.raterKind??row.rater_kind).filter(kind=>kind&&kind!=='clinician'))];
  return groups.map(kind=>{
   const row=selected.find(r=>(r.raterKind??r.rater_kind??'clinician')===kind),b=objective.scale_start,sign=direction==='lower'?-1:1;
   const values=(trend==='stagnation'?[b,b,b,b,b]:trend==='regression'?[b,b,b,b,b-2*sign]:[b,b+sign,b,b,b+2*sign]).map(clamp);
   let status=trend;
   const selectedValue=row?.scaleValue??row?.scale_value;
   if(selectedValue!=null&&Number.isFinite(Number(selectedValue))){
    values[3]=Number(row.previousScaleValue??b);values[4]=Number(selectedValue);
    const target=objective.scale_target,change=Math.abs(values[3]-target)-Math.abs(values[4]-target);
    status=(direction==='lower'?values[4]<=target:values[4]>=target)?'achieved':change>0?'progressing':change<0?'regression':'stagnation';
   }
   return {id:`${objective.id}:${kind}`,goal:goal.goal_text,objective:objective.objective_text,respondentLabel:`Illustrative ${kind} ratings · 1–10 · not measured clinical outcomes`,direction,target:objective.scale_target,scaleMin:1,scaleMax:10,trend:status,
    points:dates.map((date,i)=>({sessionId:995500+i,date,score:values[i],target:objective.scale_target,scaleMin:1,scaleMax:10,exampleOnly:true}))};
  });
 }));
 return {status:'available',sessions:dates.map((date,i)=>({id:995500+i,date})),objectives,
  changes:[{id:'example-plan-review',date:dates[3],label:'Illustrative plan review',text:'The supplied goals, starting scores, targets and timeframes remain visible. This history is fictional; the final point uses the selected demo rating where one was recorded. It does not establish measured improvement in the session narrative.'}],
  checkins:dates.map((date,i)=>({id:`checkin-${i}`,date,respondentType:'client',connection:[7,8,8,8,9][i],progress:[4,4,5,5,6][i]})),
  advisories:objectives.some(row=>row.trend==='regression'||row.trend==='stagnation')?[{id:'example-review-prompt',message:'Review comparable recorded scores and clinical context before changing a plan. No change is made automatically.'}]:[]};
}
export function exampleNarrivaReview({passed=true,stale=false} = {}) {
 if(stale)return {id:'fictional-edited',exampleOnly:true,status:'stale',quickSignEligible:false,checks:NARRIVA_CHECKS.map(check=>({...check,status:'pending',findings:[]})),scoring:null};
 const checks=NARRIVA_CHECKS.map(check=>({...check,status:!passed && check.id==='participation_plan'?'action_required':'passed',findings:!passed && check.id==='participation_plan'?[{id:'demo-follow-up',message:'The plan says “Continue therapy” but does not document the specific between-session action or next review. Review the sample session source before updating the plan.',action:'edit_note',canBypass:false}]:[]}));
 return {
  id:'fictional-review',exampleOnly:true,status:stale?'stale':passed?'passed':'action_required',quickSignEligible:passed&&!stale,checks,
  scoring:{score:passed?92:66,threshold:70,passed:passed&&!stale,qualityPassed:passed,mandatoryPassed:passed,
   explanation:passed?'Sample note connects the documented intervention, client response, treatment objective and next steps.':'The sample needs a specific follow-up plan. A score alone cannot override a required check.',
   disclaimer:'Illustrative internal documentation score, not payer approval, a clinical outcome or a guarantee of compliance or payment.',
   criteria:[{id:'interventions',label:'Specific interventions and response',earned:5,possible:5,status:'met',evidence:[narrivaExamples[0].sections.find(section=>section.key==='interventions').text]},{id:'plan',label:'Specific follow-up plan',earned:passed?5:0,possible:5,status:passed?'met':'missing',message:passed?'The next action and review are documented.':'Document the next action using the session source.'}]},
  longitudinal:{status:'available',advisories:[]}
 };
}
export function exampleReviewInsights(noteId=995001,agencyId=NARRIVA_DEMO_AGENCY,sections=exampleSections(),history=exampleTreatmentHistory()) {
 // Neither the supplied client cases nor retained notes claim an attachment.
 return {noteId,agencyId,sourceRevision:{id:'fictional-1'},quickLook:{sections,artifacts:[]},treatmentHistory:history};
}
