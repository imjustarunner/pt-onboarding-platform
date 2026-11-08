import crypto from 'node:crypto';
import { narrivaError } from './narrivaAccess.service.js';

export const REPORT_DEFAULTS = Object.freeze({ enabled:false, cadence:'quarterly', intervalDays:90, sampleSize:10, notesPerClient:5, nextRunAt:null, revision:0 });
const DAY = 86400000;
export function reportDate(value) {
 const parsed=new Date(String(value)+'T00:00:00Z');
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value)throw narrivaError(400,'Choose a valid report date.');
 return value;
}
export function reportWindow(start,end,now=new Date()) {
 start=reportDate(start);end=reportDate(end);
 if(start>end || Date.parse(end)-Date.parse(start)>366*DAY || end>now.toISOString().slice(0,10))throw narrivaError(400,'Choose a past or current reporting period of no more than one year.');
 return {periodStart:start,periodEnd:end};
}
export function normalizeReportSettings(input,current=REPORT_DEFAULTS,now=new Date()) {
 const out={...current};
 for(const key of ['enabled','cadence','intervalDays','sampleSize','notesPerClient','nextRunAt'])if(Object.hasOwn(input,key))out[key]=input[key];
 if(typeof out.enabled!=='boolean' || !['manual','monthly','quarterly','annual','custom'].includes(out.cadence))throw narrivaError(400,'Choose a report frequency.');
 for(const [key,min,max] of [['intervalDays',1,366],['sampleSize',2,50],['notesPerClient',1,5]])if(!Number.isSafeInteger(out[key]) || out[key]<min || out[key]>max)throw narrivaError(400,`Invalid ${key}.`);
 if(out.enabled && out.cadence!=='manual' && out.nextRunAt!==null && (!Number.isFinite(Date.parse(out.nextRunAt)) || Date.parse(out.nextRunAt)<=now.getTime()))throw narrivaError(400,'The next report must be scheduled in the future.');
 if(out.cadence==='manual' || !out.enabled)out.nextRunAt=null;
 else if(!out.nextRunAt)out.nextRunAt=advanceReportDue(now,out).toISOString();
 return out;
}
export function advanceReportDue(value,settings,direction=1) {
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw narrivaError(400,'Invalid report schedule.');
 if(settings.cadence==='custom')return new Date(date.getTime()+direction*settings.intervalDays*DAY);
 const months={monthly:1,quarterly:3,annual:12}[settings.cadence] || 3;
 const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+direction*months);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date;
}
function rank(seed,namespace,id) {return crypto.createHmac('sha256',seed).update(`${namespace}:${id}`).digest('hex');}
export function selectReportClients(clientIds,sampleSize,seed) {
 const unique=[...new Set(clientIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0);
 const ids=unique.sort((a,b)=>rank(seed,'client',a).localeCompare(rank(seed,'client',b))).slice(0,sampleSize);
 const consecutiveCount=Math.floor(ids.length/2);
 return ids.map((clientId,i)=>({clientId,clientRef:`Client #${clientId}`,cohort:i<consecutiveCount?'consecutive':'random'}));
}
export function selectReportNotes(rows,cohort,limit,seed,clientId) {
 const unique=[...new Map(rows.map(row=>[Number(row.id),row])).values()].sort((a,b)=>(Date.parse(a.service_at)-Date.parse(b.service_at))||Number(a.id)-Number(b.id));
 if(cohort==='random')return unique.sort((a,b)=>rank(seed,`note:${clientId}`,a.id).localeCompare(rank(seed,`note:${clientId}`,b.id))).slice(0,limit).sort((a,b)=>(Date.parse(a.service_at)-Date.parse(b.service_at))||Number(a.id)-Number(b.id));
 const starts=Math.max(1,unique.length-limit+1),start=parseInt(rank(seed,'window',clientId).slice(0,8),16)%starts;
 return unique.slice(start,start+limit);
}
const normalize=text=>String(text||'').toLowerCase().replace(/\[redacted\]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export function evaluateNoteUniqueness(notes) {
 const pairs=[];
 for(let a=0;a<notes.length;a++)for(let b=a+1;b<notes.length;b++) {
  const first=normalize(notes[a].narrative),second=normalize(notes[b].narrative);
  if(!first || !second)continue;
  const shingles=value=>{const words=value.split(' ');return new Set(words.slice(0,-3).map((_,i)=>words.slice(i,i+4).join(' ')));};
  const aa=shingles(first),bb=shingles(second),union=new Set([...aa,...bb]).size;
  const similarity=union?[...aa].filter(token=>bb.has(token)).length/union:0;
  const exact=first===second;
  // Short generic sentences and boilerplate are not evidence of duplicated notes.
  if(exact || first.split(' ').length>=40 && second.split(' ').length>=40 && similarity>=0.8)pairs.push({first:notes[a].noteRef,second:notes[b].noteRef,kind:exact?'exact_match':'substantial_similarity',similarity:Math.round((exact?1:similarity)*100)});
 }
 return {status:notes.length<2?'insufficient':pairs.length?'review_recommended':'no_match_detected',pairs,detail:'Text similarity prompts review; it does not establish misconduct or clinical appropriateness.'};
}
export function exactNarrivaApproval(review,source) {
 return !!(review && review.sourceHash===source.sourceHash && review.status==='passed' && review.scoring?.passed===true && review.checks?.length===5 && review.checks.every(check=>check.status==='passed'&&!check.findings?.length) && !review.qualityBypass);
}
