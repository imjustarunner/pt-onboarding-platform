const invalid=message=>Object.assign(new Error(message),{status:400});
export function jobInterviewSettings(input) {
  if(!Array.isArray(input.questions) || input.questions.length>100)throw invalid('Enter up to 100 job questions.');
  const questions=input.questions.map((q,index)=>{
    const text=String(typeof q==='string'?q:q?.text || '').trim();
    if(!text || text.length>4000)throw invalid('Each question needs text of up to 4,000 characters.');
    return {key:String(q?.key || `job_q_${index+1}`),text};
  });
  let criteria=null;
  if(input.criteria!==null && input.criteria!==undefined) {
    if(!Array.isArray(input.criteria) || !input.criteria.length || input.criteria.length>30)throw invalid('Enter between 1 and 30 rating criteria, or use defaults.');
    criteria=input.criteria.map((c,index)=>{
      const label=String(c?.label || '').trim(),key=String(c?.key || `job_rating_${index+1}`),weight=Number(c?.weight??1);
      if(!label || label.length>200 || !/^[a-zA-Z0-9_]{1,80}$/.test(key) || !Number.isFinite(weight) || weight<=0 || weight>100)throw invalid('Each rating needs a label, unique key, and positive weight.');
      return {key,label,weight};
    });
    if(new Set(criteria.map(c=>c.key)).size!==criteria.length)throw invalid('Rating criteria must have unique keys.');
  }
  return {questions,criteria};
}
