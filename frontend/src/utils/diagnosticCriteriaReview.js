// Count only explicitly present findings. Missing frequency/duration and unknown
// thresholds remain unconfirmed even when a symptom count reaches its minimum.
export function diagnosticCriteriaStatus(criteria=[]) {
 if(!criteria.length)return {status:'unconfirmed',message:'Criteria support unconfirmed'};
 const groups=new Map();
 for(const item of criteria){const key=item.group || item.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 let present=0,required=0,unconfirmed=false;
 for(const items of groups.values()){
  const threshold=items.find(item=>item.thresholdSourceValid && Number.isInteger(item.minimum) && item.minimum>0)?.minimum;
  if(!threshold){unconfirmed=true;continue;}
  const met=items.filter(item=>item.status==='present' && (item.kind!=='frequency' || item.frequency?.trim()) && (item.kind!=='duration' || item.duration?.trim())).length;
  present+=Math.min(met,threshold);required+=threshold;
 }
 const supported=!unconfirmed && required>0 && present>=required;
 return {status:supported?'supported':'incomplete',present,required,message:supported?'Documented criteria support reviewed':`Criteria support incomplete · ${present}/${required || '?'} required findings confirmed`};
}
