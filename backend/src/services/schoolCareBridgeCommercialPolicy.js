import { createHash } from 'node:crypto';
export const commercialDefaults = Object.freeze({rolloutDate:'2027-03-31',developmentEndDate:'2028-03-30',developmentBps:5000,ongoingBps:2500,schoolMonthlyCents:2500,providerMonthlyCents:1000,adminMonthlyCents:500,bookingPlatformBps:1000,bookingOperatorBps:2000,paymentDueDays:30,operatorLegalName:'MH4Kidz',platformLegalName:'Plot Twist Co',operatorAddress:'',platformAddress:'',operatorNoticeEmail:'',platformNoticeEmail:'',governingState:'',operatorHipaaRole:'business_associate',upstreamCoveredEntities:'',effectiveDate:''});
export function fail(status,message){return Object.assign(new Error(message),{status,statusCode:status});}
export function object(v){if(typeof v==='string'){try{return JSON.parse(v);}catch{return {};}}return v||{};}
export function integer(v,min=0,max=100000000){if(v===null||v===''||typeof v==='boolean'||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw fail(400,'Enter a valid whole-number amount.');return Number(v);}
export function calendarDate(v){const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw fail(400,'Enter a valid calendar date.');return s;}
export function normalizeCommercialTerms(input){
 const t={...commercialDefaults};
 for(const k of Object.keys(t))if(input[k]!==undefined)t[k]=input[k];
 for(const k of ['developmentBps','ongoingBps','bookingPlatformBps','bookingOperatorBps'])t[k]=t[k]==null||t[k]===''?null:integer(t[k],0,10000);
 for(const k of ['schoolMonthlyCents','providerMonthlyCents','adminMonthlyCents'])t[k]=t[k]==null||t[k]===''?null:integer(t[k]);
 t.paymentDueDays=integer(t.paymentDueDays,1,90);t.rolloutDate=calendarDate(t.rolloutDate);
 const end=new Date(t.rolloutDate+'T00:00:00Z');end.setUTCFullYear(end.getUTCFullYear()+1);end.setUTCDate(end.getUTCDate()-1);t.developmentEndDate=end.toISOString().slice(0,10);
 if(t.developmentBps!=null&&t.ongoingBps!=null&&t.developmentBps<t.ongoingBps)throw fail(400,'The development percentage must be at least the ongoing percentage.');
 if((t.bookingPlatformBps||0)+(t.bookingOperatorBps||0)>10000)throw fail(400,'Booking shares cannot exceed 100%.');
 for(const k of ['operatorLegalName','platformLegalName','operatorAddress','platformAddress','operatorNoticeEmail','platformNoticeEmail','governingState','upstreamCoveredEntities']){t[k]=String(t[k]||'').trim();if(t[k].length>2000)throw fail(400,'Agreement text is too long.');}
 for(const k of ['operatorNoticeEmail','platformNoticeEmail'])if(t[k]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t[k]))throw fail(400,'Enter a valid notice email.');
 if(!['covered_entity','business_associate'].includes(t.operatorHipaaRole))throw fail(400,'Choose the operator’s HIPAA role.');
 t.effectiveDate=t.effectiveDate?calendarDate(t.effectiveDate):'';return t;
}
export function requireCompleteTerms(t){
 for(const k of ['developmentBps','ongoingBps','schoolMonthlyCents','providerMonthlyCents','adminMonthlyCents','bookingPlatformBps','bookingOperatorBps'])if(t[k]==null)throw fail(409,'Complete and sign the commercial rates before activation.');
 for(const k of ['operatorLegalName','platformLegalName','operatorAddress','platformAddress','operatorNoticeEmail','platformNoticeEmail','governingState','effectiveDate','upstreamCoveredEntities'])if(!t[k])throw fail(409,'Complete the parties, notice contacts, effective date, jurisdiction and HIPAA scope before activation.');
 return t;
}
export function bookingAmounts({serviceCents,travelCents=0,schoolCents,platformBps,operatorBps}){
 const service=integer(serviceCents),travel=integer(travelCents),school=integer(schoolCents),p=integer(platformBps,0,10000),m=integer(operatorBps,0,10000);
 if(p+m>10000||school>service+travel)throw fail(400,'Booking shares or school contribution are invalid.');
 const platform=Math.round(service*p/10000),operator=Math.round(service*m/10000);
 return {serviceCents:service,travelCents:travel,totalCents:service+travel,schoolCents:school,fundingCents:service+travel-school,platformCents:platform,operatorCents:operator,presenterCents:service-platform-operator+travel};
}
export function usageLines(snapshots,terms,month){
 if(!/^\d{4}-\d{2}$/.test(month))throw fail(400,'Use a YYYY-MM billing month.');
 const start=calendarDate(month+'-01'),days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
 const lines=[];
 for(const row of snapshots){
  const date=String(row.usage_date instanceof Date?row.usage_date.toISOString():row.usage_date).slice(0,10);
  if(date<terms.rolloutDate||date<start||!date.startsWith(month))continue;
  const bps=date<=terms.developmentEndDate?terms.developmentBps:terms.ongoingBps;
  if(bps==null)throw fail(409,'The applicable percentage is not configured.');
  for(const [kind,field,rate] of [['School portals','school_count','schoolMonthlyCents'],['Provider slots','provider_count','providerMonthlyCents'],['Admin slots','admin_count','adminMonthlyCents']]){
   if(terms[rate]==null)throw fail(409,'Standard usage rates are not configured.');
   const count=integer(row[field]);if(!count)continue;
   // Store the unrounded numerator; round only each partner/unit/rate monthly total.
   const key=`${row.partner_agency_id}:${kind}:${bps}`;
   let line=lines.find(l=>l.key===key);if(!line){line={key,partnerAgencyId:Number(row.partner_agency_id),description:kind,unitDays:0,daysInMonth:days,monthlyUnitCents:terms[rate],percentageBps:bps,amountCents:0};lines.push(line);}
   line.unitDays+=count;line.amountCents=Math.round(line.unitDays*line.monthlyUnitCents*bps/(days*10000));
  }
 }
 return lines;
}
export const hash = value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const escapeHtml = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
