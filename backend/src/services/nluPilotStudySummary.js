import { getNluLearningMeasure } from '../data/nluLearningMeasures.js';
import { scoreOutcomeMeasure } from './outcomeMeasureScoring.js';
const mean = xs => xs.reduce((a,b) => a+b,0) / xs.length;
const variance = xs => xs.length < 2 ? null : xs.reduce((n,x) => n+(x-mean(xs))**2,0)/(xs.length-1);
// Exploratory internal consistency, not a validity decision. Call only on a
// reviewed, pseudonymized study export; this module has no DB or network access.
export function cronbachAlpha(matrix) {
  if (matrix.length < 2 || !matrix[0]?.length || matrix[0].length < 2) return null;
  const k=matrix[0].length;
  if (matrix.some(row=>row.length!==k || row.some(x=>!Number.isFinite(x)))) throw new Error('Complete numeric item rows required.');
  const totalVariance=variance(matrix.map(row=>row.reduce((a,b)=>a+b,0)));
  if (!totalVariance) return null;
  const itemVariance=Array.from({length:k},(_,i)=>variance(matrix.map(row=>row[i]))).reduce((a,b)=>a+b,0);
  return k/(k-1)*(1-itemVariance/totalVariance);
}
export function summarizeNluPilotStudy(input) {
  if (!Array.isArray(input) || input.length > 100000) throw new Error('Provide a reviewed study export of at most 100,000 records.');
  const groups=new Map();
  for (const record of input) {
    const m=getNluLearningMeasure(record.measureId);
    if (!m?.domains || record.version!==m.version) throw new Error('Study summaries require an exact current student or caregiver pilot version; analyze older versions separately.');
    if (!/^P-[A-Za-z0-9_-]{1,64}$/.test(record.participantCode || '')) throw new Error('Use pseudonymous participant codes such as P-001; do not include names.');
    if (!['self','clinician_assisted','caregiver','caregiver_assisted'].includes(record.administration) || (m.respondent==='student' ? !['self','clinician_assisted'].includes(record.administration) : !['caregiver','caregiver_assisted'].includes(record.administration))) throw new Error('Invalid administration method.');
    if (!Number.isInteger(record.age) || record.age<8 || record.age>17) throw new Error('Pilot age must be 8–17.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.observedOn || '') || !Number.isFinite(+new Date(record.observedOn)) || new Date(record.observedOn).toISOString().slice(0,10)!==record.observedOn) throw new Error('Invalid observation date.');
    const result=scoreOutcomeMeasure(m,record.answers);
    const key=[m.id,m.version,record.administration].join(':');
    if(!groups.has(key))groups.set(key,{measure:m,administration:record.administration,records:[]});
    groups.get(key).records.push({...record,answers:result.answers});
  }
  return { purpose:'Exploratory measurement study summary; not validation, diagnosis or program-effectiveness evidence', validated:false,
    method:'One earliest administration per child, per form/version/administration group. Repeated reports do not increase the independent sample. Student and caregiver groups remain separate. Same-day duplicate baselines are rejected for adjudication.',
    limitations:['Domain structure has not been established. Alpha alone does not demonstrate validity or unidimensionality.','The 30-participant calculation floor is an implementation guard, not a sufficient sample-size justification.','No confidence intervals, factor analysis, test–retest estimates, measurement invariance, responsiveness or causal effects are computed here.','Caregiver identity and context must be reviewed in the study export; groups are not independent of one another when the same children appear in both.'],
    groups:[...groups.values()].map(({measure,administration,records})=>{
      const ordered=[...records].sort((a,b)=>a.observedOn.localeCompare(b.observedOn));
      const first=new Map();
      for(const record of ordered){const prior=first.get(record.participantCode);if(!prior)first.set(record.participantCode,record);else if(prior.observedOn===record.observedOn)throw new Error('Duplicate same-day baseline for a participant; adjudicate before analysis.');}
      const baseline=[...first.values()];
      return {measureId:measure.id,version:measure.version,administration,administrations:records.length,participants:baseline.length,
        ageCounts:Object.fromEntries(Array.from({length:10},(_,i)=>[String(i+8),baseline.filter(r=>r.age===i+8).length])),
        items:measure.items.map(item=>{const observed=baseline.map(r=>r.answers[item.key]).filter(v=>/^[0-4]$/.test(v??''));return {key:item.key,observed:observed.length,missing:baseline.filter(r=>r.answers[item.key]==null).length,notObserved:baseline.filter(r=>r.answers[item.key]==='not_observed').length,frequencies:Object.fromEntries([0,1,2,3,4].map(n=>[String(n),observed.filter(v=>v===String(n)).length]))};}),
        domains:measure.domains.map(domain=>{
          const complete=baseline.filter(r=>domain.items.every(key=>/^[0-4]$/.test(r.answers[key]??'')));
          const matrix=complete.map(r=>domain.items.map(key=>Number(r.answers[key]))),values=matrix.map(mean);
          return {domain:domain.label,completeParticipants:complete.length,mean:values.length?mean(values):null,sd:values.length>1?Math.sqrt(variance(values)):null,alphaExploratory:matrix.length>=30?cronbachAlpha(matrix):null,alphaStatus:matrix.length<30?'Not estimated: fewer than 30 complete independent baselines':'Exploratory only; undefined when total variance is zero'};
        })};
    })};
}
