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
export function exampleTreatmentHistory({trend='progressing',example=narrivaExamples[0]} = {}) {
 const dates=['2026-10-09','2026-10-16','2026-10-23','2026-10-30','2026-11-06'];
 const series=objective=>{const b=objective.scale_start,sign=objective.direction==='lower'?-1:1;return (trend==='stagnation'?[b,b,b,b,b]:trend==='regression'?[b,b,b-sign,b-sign,b-2*sign]:[b,b,b+sign,b+sign,b+2*sign]).map(value=>Math.max(1,Math.min(10,value)));};
 return {
  status:'available',sessions:dates.map((date,i)=>({id:995500+i,date})),
  objectives:example.plan.goals.flatMap(goal=>goal.objectives.map(objective=>({id:`${objective.id}:clinician`,goal:goal.goal_text,objective:objective.objective_text,respondentLabel:'Illustrative clinician ratings · 1–10 · not measured clinical outcomes',direction:objective.direction,target:objective.scale_target,scaleMin:1,scaleMax:10,trend,
   points:dates.map((date,i)=>({sessionId:995500+i,date,score:series(objective)[i],target:objective.scale_target,scaleMin:1,scaleMax:10}))}))),
  changes:[{id:'example-plan-review',date:'2026-10-30',label:'Illustrative plan review',text:'The supplied goals, starting scores, targets and timeframes remain visible. This rating series is fictional; it does not establish improvement in the supplied session narrative.'}],
  checkins:dates.map((date,i)=>({id:`checkin-${i}`,date,respondentType:'client',connection:[7,8,8,8,9][i],progress:[4,4,5,5,6][i]})),
  advisories:trend==='progressing'?[]:[{id:'example-review-prompt',message:'Review comparable recorded scores and clinical context before changing a plan. No change is made automatically.'}]
 };
}
export function exampleNarrivaReview({passed=true,stale=false} = {}) {
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
