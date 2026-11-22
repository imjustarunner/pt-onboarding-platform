import crypto from 'node:crypto';
const fail=message=>Object.assign(new Error(message),{status:400});
const text=(value,max)=>String(value||'').trim().slice(0,max);
export const RUBRIC=['emerging','developing','nearly_secure','secure','not_observed'];
export function worksheetDefinition(input={}) {
 if(!Array.isArray(input.questions)||input.questions.length>40)throw fail('Use up to 40 worksheet questions.');
 const ids=new Set();
 const questions=input.questions.map(q=>{
  const id=text(q.id||crypto.randomUUID(),64);
  if(ids.has(id)||!/^[a-zA-Z0-9_-]+$/.test(id))throw fail('Every question needs a unique identifier.');ids.add(id);
  if(!['text','numeric','choice','ink','example'].includes(q.type))throw fail('Choose a supported response type.');
  const page=Number(q.page),x=Number(q.x),y=Number(q.y),width=Number(q.width),height=Number(q.height);
  if(!Number.isInteger(page)||page<1||page>100||![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<5||height<3||x+width>100.1||y+height>100.1)throw fail('Place each answer area inside its document page.');
  const prompt=text(q.prompt,1200);if(!prompt)throw fail('Give every question a prompt.');
  const options=q.type==='choice'?(Array.isArray(q.options)?q.options.map(v=>text(v,300)):[]):[];
  if(q.type==='choice'&&(options.length<2||options.length>6||new Set(options).size!==options.length||options.some(v=>!v)))throw fail('Use 2–6 distinct choices.');
  const answerKey=text(q.answerKey,1000);
  if(q.type==='choice'&&answerKey&&!options.includes(answerKey))throw fail('The answer key must match a choice.');
  return {id,page,x,y,width,height,prompt,type:q.type,options,answerKey,skill:text(q.skill,100),grade:text(q.grade,30),goalId:Number.isSafeInteger(Number(q.goalId))&&Number(q.goalId)>0?Number(q.goalId):null};
 });
 return {instructions:text(input.instructions,3000),questions};
}
export const learnerDefinition=definition=>({...definition,questions:definition.questions.map(({answerKey,...q})=>q)});
export function worksheetAnswers(definition,input={}) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Enter worksheet answers.');
 const result={};
 for(const q of definition.questions) {
  if(input[q.id]===undefined)continue;
  const value=input[q.id];
  if(q.type==='ink'){
   if(!Array.isArray(value)||value.length>200||value.some(stroke=>!Array.isArray(stroke)||stroke.length>1500||stroke.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1000))))throw fail('Handwriting is too large or invalid. Save fewer strokes.');
   result[q.id]=value;
  } else {
   if(typeof value!=='string'||value.length>4000)throw fail('Keep each answer within 4,000 characters.');
   if(q.type==='choice'&&value&&!q.options.includes(value))throw fail('Choose an answer from this question.');
   result[q.id]=value;
  }
 }
 return result;
}
export function numericAnswer(value){
 const raw=String(value??'').trim();
 if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)){const n=Number(raw);return Number.isFinite(n)?n:null;}
 const fraction=raw.match(/^([+-]?\d+)\/(\d+)$/);
 if(fraction&&Number(fraction[2])!==0){const n=Number(fraction[1])/Number(fraction[2]);return Number.isFinite(n)?n:null;}
 const mixed=raw.match(/^([+-]?\d+)\s+(\d+)\/(\d+)$/);
 if(mixed&&Number(mixed[3])!==0){const n=(raw.startsWith('-')?-1:1)*(Math.abs(Number(mixed[1]))+Number(mixed[2])/Number(mixed[3]));return Number.isFinite(n)?n:null;}
 return null;
}
export function objectiveResults(definition,answers) {
 return definition.questions.filter(q=>['choice','numeric'].includes(q.type)&&q.answerKey).map(q=>{
  const answer=numericAnswer(answers[q.id]),key=numericAnswer(q.answerKey);
  return {questionId:q.id,answered:!!String(answers[q.id]||'').trim(),correct:q.type==='numeric'?answer!==null&&key!==null&&Math.abs(answer-key)<=1e-9:answers[q.id]===q.answerKey};
 });
}

export function worksheetReview(input,definition){
 const result={};
 for(const q of definition.questions){
  const r=input?.[q.id];if(!r||!RUBRIC.includes(r.rating))throw fail('Review every worksheet question, or choose Not observed.');
  result[q.id]={rating:r.rating,independent:r.independent===true,notes:text(r.notes,2000)};
 }
 return result;
}
