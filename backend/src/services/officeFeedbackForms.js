// Original feedback questions, not validated clinical instruments. Snapshots
// preserve service, respondent, item wording, and scoring for every visit.
export function officeFeedbackForms(respondentType, serviceType='counseling') {
 const proxy=respondentType==='caregiver',tutor=serviceType==='tutoring',person=tutor?'tutor':'therapist';
 const options=(low,high)=>[...Array.from({length:11},(_,i)=>({value:String(i),label:`${i}${i===0?` · ${low}`:i===10?` · ${high}`:''}`,score:i})),{value:'not_sure',label:'Not sure / first visit / not applicable',score:null}];
 const field=(id,label,low,high,reverse=false)=>({id,label,type:'select',required:false,options:options(low,high),scoreDirection:reverse?'reverse':'forward'});
 const perspective=proxy?`Answer from your own perspective about your dependent’s ${tutor?'learning':'care'}, based on what you can observe.`:`Think about your ${tutor?'tutoring':'care'} so far and how you are doing today, before this appointment.`;
 const common={respondentType,serviceType,description:perspective,kind:'service_feedback',scoring:'office_feedback_v1',version:1,validated:false};
 return [
  {...common,id:`office-feedback:${serviceType}:connection:v1`,category:'connection',title:`Connection with your ${person}`,fields:[
   field('heard',proxy?`How well does the ${person} listen to your concerns about your dependent?`:`How well does your ${person} listen to and understand you?`,'Not at all','Completely'),
   field('goals',proxy?`How well do you and the ${person} agree on what to work on with your dependent?`:`How well do you and your ${person} agree on what to work on?`,'Not at all','Completely'),
   field('comfortable',proxy?`How comfortable are you sharing concerns with your dependent’s ${person}?`:`How comfortable are you telling your ${person} when something is difficult or not working?`,'Not comfortable','Completely comfortable')
  ]},
  {...common,id:`office-feedback:${serviceType}:progress:v1`,category:'progress',title:tutor?'Learning and confidence today':'Challenges and wellbeing today',fields:[
   field('manageable',proxy?`How manageable do your dependent’s ${tutor?'learning challenges':'main concerns'} seem today?`:`How manageable are the ${tutor?'learning challenges':'concerns'} that brought you here today?`,'Not manageable','Completely manageable'),
   field('distress',proxy?`How ${tutor?'frustrated or stressed about learning':'distressed'} has your dependent seemed today?`:`How ${tutor?'frustrated or stressed about learning':'distressed by these concerns'} do you feel today?`,'Not at all',tutor?'Extremely stressed':'Extremely distressed',true),
   field('benefit',proxy?`How much is ${tutor?'tutoring building your dependent’s learning confidence':'care helping your dependent make progress with these concerns'}?`:`How much is ${tutor?'tutoring building your learning confidence':'care helping you make progress with these concerns'}?`,'Not yet','A great deal')
  ]}
 ];
}
export function scoreOfficeFeedback(forms,answers={},skipped=[]) {
 const categories={};let all=[],answered=0,expected=0;
 for(const form of forms.filter(f=>f.scoring==='office_feedback_v1')){
  const scores=[];expected+=form.fields.length;
  for(const field of form.fields){if(skipped.includes(form.id))continue;const value=answers?.[form.id]?.[field.id];const option=field.options.find(o=>o.value===value);if(option?.score==null)continue;const score=Number(option.score);if(!Number.isFinite(score)||score<0||score>10)continue;scores.push(field.scoreDirection==='reverse'?10-score:score);}
  answered+=scores.length;all.push(...scores);categories[form.category]=scores.length===form.fields.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null;
 }
 return {method:'office_feedback_v1',validated:false,total:expected&&answered===expected?Math.round(all.reduce((a,b)=>a+b,0)/expected*10)/10:null,connection:categories.connection??null,progress:categories.progress??null,answered,expected};
}
