// Frontend-only build context. Parity with backend pure policy is verified
// by noteAidBillingAddons.test.js; keep this module dependency-free.
export const AFTER_HOURS_POLICY_VERSION='2026-11-06.start-1700';

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
export function evaluate99051Schedule({startAt,timeZone}={}) {
  const result={eligible:false,policyVersion:AFTER_HOURS_POLICY_VERSION,timeZone:timeZone||null,localDate:null,localStartTime:null,reason:'saved_schedule_unavailable'};
  const instant=utcInstant(startAt);
  if(!instant||!String(timeZone||'').trim())return result;
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const weekend=['Sat','Sun'].includes(values.weekday),evening=Number(values.hour)>=17;
    return {...result,eligible:weekend||evening,localDate:`${values.year}-${values.month}-${values.day}`,localStartTime:`${values.hour}:${values.minute}`,reason:weekend?'weekend_start':evening?'weekday_evening_start':'outside_authorized_hours'};
  }catch{return {...result,reason:'saved_timezone_invalid'};}
}

/** Rebuild only the automatic after-hours addition; preserve other authored add-ons. */
export function canonicalAfterHoursAddons(addons=[],allowed=false) {
  const result=[],seen=new Set();
  for(const item of Array.isArray(addons)?addons:[]){const value=String(typeof item==='object'?item?.code:item||'').trim().toUpperCase();if(!value||value==='99051'||seen.has(value))continue;seen.add(value);result.push(value);}
  if(allowed)result.push('99051');
  return result;
}

const normalized=value=>String(value||'').trim().toUpperCase();
const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}')||{};}catch{return {};}};

export function isProBonoServiceCode(value) {
  return /^PRO[\s_-]*BONO(?:[\s_-]*SERVICE)?$/.test(normalized(value));
}

/** Funding is independent of delivery method and the underlying clinical code. */
export function isProBonoFunding({serviceCode,metadata,billing}={}) {
  const meta=parse(metadata),contact=parse(meta.contactMeta);
  return isProBonoServiceCode(serviceCode)
    || [meta.fundingDisposition,meta.billingDisposition,meta.billing_disposition,meta.contactBillingDisposition,contact.billing_disposition,billing?.settlementMode,billing?.settlement_mode].some(value=>String(value||'').toLowerCase()==='pro_bono');
}
