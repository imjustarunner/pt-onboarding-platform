import { NARRIVA_CHECKS } from '../../config/narrivaBrand.js';

// Public presentation data only. No production identifiers, model calls, clinical
// transport or signing tokens belong in this module. Every result is illustrative.
export const NARRIVA_DEMO_AGENCY = 990101;
export const NARRIVA_DEMO_NOTICE = 'Illustrative results only. No AI check runs, no clinical record is accessed, and no actual signature is created.';
export const narrivaExamples = [
  { id: 995001, name: 'Emerson Cole', focus: 'Coping with stressful transitions', date: 'Nov 6, 2026', source: 'The client used grounding on three days this week and identified early signs of stress. We practiced paced breathing and cognitive reframing. The client rehearsed the skill with less prompting. Continue weekly individual therapy and practice on three days before the next visit.' },
  { id: 995002, name: 'Jamie Stone', focus: 'Building a consistent evening routine', date: 'Nov 5, 2026', source: 'The client described a more consistent evening routine and difficulty when plans change. We used collaborative problem solving and rehearsed a flexible alternative. The client selected one change to try this week. Continue weekly therapy and review the routine at the next visit.' },
  { id: 995003, name: 'Morgan Rivera', focus: 'Confidence in difficult conversations', date: 'Nov 4, 2026', source: 'The client completed a planned social activity and practiced breathing before a difficult conversation. We used role play and cognitive reframing. The client identified a helpful response and practiced it in session. Continue weekly care and review one example next visit.' }
];
export function exampleSections(example = narrivaExamples[0], corrected = true) {
 return [
  { key:'subjective',label:'Subjective',text:example.source.split(' We ')[0] },
  { key:'interventions',label:'Interventions',text:example.id === 995002 ? 'Collaborative problem solving and rehearsal of a flexible alternative for changes in routine.' : example.id === 995003 ? 'Cognitive reframing and role play connected to the client’s goal of communicating with confidence.' : 'Cognitive reframing, paced breathing and guided grounding practice linked to the client’s treatment objective.' },
  { key:'response',label:'Response & progress',text:example.id === 995002 ? 'The client identified one achievable change and rehearsed the alternative routine.' : example.id === 995003 ? 'The client practiced the selected response in a role play and identified when to use it.' : 'The client identified early signs of stress and practiced the grounding skill with less prompting. Clinician objective rating: 6/10; previous rating: 5/10; target: 8/10.' },
  { key:'plan',label:'Plan',text:corrected ? (example.id === 995002 ? 'Continue weekly individual therapy. Try the selected routine change and review its usefulness at the next visit.' : example.id === 995003 ? 'Continue weekly individual therapy. Practice the selected response and bring one example to the next visit.' : 'Continue weekly individual therapy. Practice grounding on three days before the next visit and review what helped. Continue working toward independent use of the coping skill.') : 'Continue therapy.' }
 ];
}
export function exampleTreatmentHistory({trend='progressing',example=narrivaExamples[0]} = {}) {
 const dates=['2026-10-09','2026-10-16','2026-10-23','2026-10-30','2026-11-06'];
 const values=trend==='stagnation'?[4,4,4,4,4]:trend==='regression'?[6,5,4,4,3]:[3,4,4,5,6];
 return {
  status:'available',sessions:dates.map((date,i)=>({id:995100+i,date})),
  objectives:[{id:'fictional-grounding:clinician',goal:example.focus,objective:example.id===995002?'Use the planned evening routine independently.':example.id===995003?'Use a practiced communication response independently.':'Use a grounding skill independently when stress increases.',respondentLabel:'Clinician rating · independence with skill use · 0–10',direction:'higher',target:8,scaleMin:0,scaleMax:10,trend,
   points:dates.map((date,i)=>({sessionId:995100+i,date,score:values[i],target:8,scaleMin:0,scaleMax:10}))}],
  changes:[{id:'example-plan-update',date:'2026-10-23',label:'Practice plan updated',text:`Added a brief ${example.id===995002?'routine':example.id===995003?'communication':'grounding'} reminder to support practice between visits. The objective and rating scale stayed the same.`}],
  checkins:dates.map((date,i)=>({id:`checkin-${i}`,date,respondentType:'client',connection:[7,8,8,8,9][i],progress:[4,4,5,5,6][i]})),
  advisories:trend==='progressing'?[]:[{id:'example-review-prompt',message:'Review the recent objective ratings and barriers with the client. Consider whether the current approach or plan needs adjustment; no change is made automatically.'}]
 };
}
export function exampleNarrivaReview({passed=true,stale=false} = {}) {
 const checks=NARRIVA_CHECKS.map(check=>({...check,status:!passed && check.id==='participation_plan'?'action_required':'passed',findings:!passed && check.id==='participation_plan'?[{id:'demo-follow-up',message:'The plan says “Continue therapy” but does not document the specific between-session action or next review. Review the sample session source before updating the plan.',action:'edit_note',canBypass:false}]:[]}));
 return {
  id:'fictional-review',exampleOnly:true,status:stale?'stale':passed?'passed':'action_required',quickSignEligible:passed&&!stale,checks,
  scoring:{score:passed?92:66,threshold:70,passed:passed&&!stale,qualityPassed:passed,mandatoryPassed:passed,
   explanation:passed?'Sample note connects the documented intervention, client response, treatment objective and next steps.':'The sample needs a specific follow-up plan. A score alone cannot override a required check.',
   disclaimer:'Illustrative internal documentation score, not payer approval, a clinical outcome or a guarantee of compliance or payment.',
   criteria:[{id:'interventions',label:'Specific interventions and response',earned:5,possible:5,status:'met',evidence:['Cognitive reframing, paced breathing and guided grounding practice.']},{id:'plan',label:'Specific follow-up plan',earned:passed?5:0,possible:5,status:passed?'met':'missing',message:passed?'The next action and review are documented.':'Document the next action using the session source.'}]},
  longitudinal:{status:'available',advisories:[]}
 };
}
export function exampleReviewInsights(noteId=995001,agencyId=NARRIVA_DEMO_AGENCY,sections=exampleSections(),history=exampleTreatmentHistory()) {
 const example=narrivaExamples.find(item=>item.id===Number(noteId));
 const title=example?.id===995002?'Routine planner · fictional example':example?.id===995003?'Communication rehearsal worksheet · fictional example':'CBT grounding worksheet · fictional example';
 // Retained workspace notes have no attachment fixtures. Only the explicitly
 // authored walkthrough cases include the sample worksheet reference.
 const artifacts=example?[{id:'fictional-worksheet',title,type:'Session worksheet',summary:'Completed together in person; retained as supporting session material.'}]:[];
 return {noteId,agencyId,sourceRevision:{id:'fictional-1'},quickLook:{sections,artifacts},treatmentHistory:history};
}
