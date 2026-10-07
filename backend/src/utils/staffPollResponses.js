export const UNCLASSIFIED='__UNCLASSIFIED__';
const reserved=new Set(['STOP','END','QUIT','CANCEL','UNSUBSCRIBE','REVOKE','OPT OUT','HELP','START','SUPPORT',UNCLASSIFIED]);
export function validatePollOptions(options){
 const seen=new Set();
 if(!Array.isArray(options)||options.length<2||options.length>12)throw Object.assign(new Error('Use 2–12 poll choices.'),{status:400});
 for(const option of options){
  const key=String(option.key||'').trim().toUpperCase(),label=String(option.label||'').trim();
  if(!/^[A-Z0-9_-]{1,8}$/.test(key)||reserved.has(key)||!label||label.length>160)throw Object.assign(new Error('Each choice needs a unique short reply code (for example 1 or MON) and a label. HELP, STOP and other messaging commands cannot be choices.'),{status:400});
  for(const v of new Set([key,label.toUpperCase()])){if(seen.has(v))throw Object.assign(new Error('Poll reply codes and labels must be unambiguous.'),{status:400});seen.add(v);}
 }
}
export function unmatchedPollReply(value,allow){const raw=String(value||'').trim();if(!allow||!raw||raw.length>2000||reserved.has(raw.toUpperCase()))return null;return {key:UNCLASSIFIED,label:'Needs review',raw};}
export function summarizePollResponses(responses,options){
 const summary=options.map(o=>({key:o.key,label:o.label,total:0}));const byKey=new Map(summary.map(x=>[x.key,x]));
 for(const r of responses){if(r.excluded)continue;const bucket=byKey.get(r.bucketKey||r.response_key);if(bucket)bucket.total++;}
 return summary;
}
