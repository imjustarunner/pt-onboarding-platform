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

// Match punctuation and emoji around an answer without guessing from a sentence.
const normalizeReply = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
function dateReply(value) {
  const normalized = normalizeReply(value).replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday) /, '');
  const match = normalized.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?) (\d{1,2})(?: \d{4})?$/);
  return match ? { month: match[1].slice(0,3), day: Number(match[2]) } : null;
}
export function matchStaffPollReply(value, options = []) {
  const raw = String(value || '').trim(), normalized = normalizeReply(raw);
  if (!normalized || reserved.has(raw.toUpperCase())) return null;
  const keys = options.filter(option => String(option.key).toUpperCase() === raw.toUpperCase());
  if (keys.length === 1) return { ...keys[0], raw };
  const exact = options.filter(option => normalizeReply(option.label) === normalized);
  if (exact.length === 1) return { ...exact[0], raw };
  const date = dateReply(raw);
  const dayOnly = /^\d{1,2}$/.test(normalized) ? Number(normalized) : null;
  const dates = options.filter(option => {
    const candidate = dateReply(option.label);
    return candidate && (date ? candidate.month === date.month && candidate.day === date.day : dayOnly && candidate.day === dayOnly);
  });
  return dates.length === 1 ? { ...dates[0], raw } : null;
}
