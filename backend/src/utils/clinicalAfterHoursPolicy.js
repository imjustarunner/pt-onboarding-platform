export const LEGACY_AFTER_HOURS_POLICY_VERSION='2026-11-06.start-1700';
export const AFTER_HOURS_POLICY_VERSION='2026-11-13.outside-0900-1700';

function utcInstant(value) {
  if(value instanceof Date)return Number.isFinite(+value)?value:null;
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text))return null;
  const date=new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)?text:text.replace(' ','T')+'Z');
  return Number.isFinite(+date)?date:null;
}
export const clinicalScheduleInstant=value=>utcInstant(value)?.toISOString()||null;

/** Database datetimes are UTC instants; only a saved source timezone determines
 * local hours. A browser timezone, date-only string or missing zone cannot qualify. */
export function evaluate99051Schedule({startAt,timeZone,policyVersion=AFTER_HOURS_POLICY_VERSION}={}) {
  const result={eligible:false,policyVersion,timeZone:timeZone||null,localDate:null,localStartTime:null,reason:'saved_schedule_unavailable'};
  const instant=utcInstant(startAt);
  if(!instant||!String(timeZone||'').trim())return result;
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const weekend=['Sat','Sun'].includes(values.weekday),evening=Number(values.hour)>=17,morning=Number(values.hour)<9&&policyVersion!==LEGACY_AFTER_HOURS_POLICY_VERSION;
    return {...result,eligible:weekend||morning||evening,localDate:`${values.year}-${values.month}-${values.day}`,localStartTime:`${values.hour}:${values.minute}`,reason:weekend?'weekend_start':morning?'weekday_morning_start':evening?'weekday_evening_start':'within_regular_hours'};
  }catch{return {...result,reason:'saved_timezone_invalid'};}
}

/** Rebuild only the automatic after-hours addition; preserve other authored add-ons. */
export function canonicalAfterHoursAddons(addons=[],allowed=false) {
  const result=[],seen=new Set();
  for(const item of Array.isArray(addons)?addons:[]){const value=String(typeof item==='object'?item?.code:item||'').trim().toUpperCase();if(!value||value==='99051'||seen.has(value))continue;seen.add(value);result.push(value);}
  if(allowed)result.push('99051');
  return result;
}
