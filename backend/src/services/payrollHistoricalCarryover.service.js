import pool from '../config/database.js';
import {isProBonoServiceCode} from '../utils/clinicalFundingPolicy.js';
import {rateAtDate} from './payrollBilledPay.service.js';
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
const review=message=>{throw Object.assign(new Error(message),{code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED'});};
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const quantity=row=>row.unitCount ?? row.units;

/** Older carryover audits saved identity/date but omitted quantity. Recover the
 * exact saved import quantity, scoped to agency, employee, code and date. */
export async function hydrateCarryoverDates({stagingRows,agencyId},db=pool) {
  const keys=[...new Set(stagingRows.flatMap(r=>(r.carryoverMeta?.rawAuditRows || []).filter(a=>quantity(a)==null).map(a=>a.rowMatchKey)).filter(Boolean))];
  const byKey=new Map();
  for(let i=0;i<keys.length;i+=500){
    const chunk=keys.slice(i,i+500);
    const [rows]=await db.execute(`SELECT id,user_id,service_code,service_date,unit_count,row_fingerprint FROM payroll_import_rows WHERE agency_id=? AND row_fingerprint IN (${chunk.map(()=>'?').join(',')}) ORDER BY id DESC`,[agencyId,...chunk]);
    for(const r of rows){const key=JSON.stringify([Number(r.user_id),String(r.service_code).trim().toUpperCase(),day(r.service_date),r.row_fingerprint]);if(!byKey.has(key))byKey.set(key,Number(r.unit_count));}
  }
  for(const row of stagingRows){
    const raw=row.carryoverMeta?.rawAuditRows || [];
    if(!raw.length)continue;
    row.carryoverDatedUnits=raw.map(a=>({serviceDate:day(a.serviceDate),units:quantity(a) ?? byKey.get(JSON.stringify([Number(row.userId),String(row.serviceCode).trim().toUpperCase(),day(a.serviceDate),a.rowMatchKey])),rowMatchKey:a.rowMatchKey}));
  }
}

function savedHistoricalRate({code,date,row,ratesByCode,rateCard,historicalSummaries}) {
  const summary=historicalSummaries.find(s=>day(s.period_start)<=date && day(s.period_end)>=date);
  const lines=typeof summary?.breakdown==='string'?JSON.parse(summary.breakdown):summary?.breakdown;
  const candidates=Object.entries(lines || {}).filter(([key,value])=>String(value?.displayServiceCode || key).toUpperCase()===code.toUpperCase()).map(([,value])=>value);
  const dated=candidates.filter(value=>(value.serviceDates || []).map(day).includes(date));
  const choices=dated.length?dated:candidates;
  const terms=choices.filter(value=>value.rateAmount!=null && Number.isFinite(Number(value.rateAmount)) && value.rateSource!=='none');
  const unique=new Set(terms.map(value=>JSON.stringify([Number(value.rateAmount),value.rateUnit,value.payDivisor])));
  if(unique.size>1)review(`Review the saved historical ${code} rate for ${date}; multiple pay lines have different terms.`);
  if(terms.length)return {amount:Number(terms[0].rateAmount),source:'historical_payroll_snapshot',unit:terms[0].rateUnit || row.rateUnit,divisor:terms[0].payDivisor || row.payDivisor || 1};
  const saved=rateAtDate(ratesByCode.get(code.toUpperCase()) || [],date);
  if(saved && saved.rate_amount!=null && Number.isFinite(Number(saved.rate_amount)))return {amount:Number(saved.rate_amount),source:'historical_per_code_rate',unit:saved.rate_unit || row.rateUnit,divisor:saved.pay_divisor || row.payDivisor || 1};
  if(row.rateSource==='rate_card' && rateCard?.updated_at && day(rateCard.updated_at)<=date)return {amount:Number(row.rateAmount),source:'historical_rate_card',unit:row.rateUnit,divisor:row.payDivisor || 1};
  review(`A saved historical ${code} rate is required for carried-over work dated ${date}.`);
}

/** Late work follows its actual service date. Only pre-amendment quantities use
 * saved historical terms; newer carryovers join the ordinary dated calculation. */
export function separateHistoricalCarryovers({breakdown,stagingRows,ratesByCode,rateCard=null,historicalSummaries=[],boundary,datedUnitsByCode=new Map()}) {
  for(const [code,row] of Object.entries({...breakdown})) {
    if(!row || typeof row!=='object' || code.startsWith('__') || row.supervisionTrackingOnly || row.explicitUnpaid || isProBonoServiceCode(row.displayServiceCode || code))continue;
    if(['percent_billed','percent_collected'].includes(row.payMethod))continue;
    const carryUnits=Number(row.oldDoneNotesUnits || 0);if(!(carryUnits>0))continue;
    const staged=stagingRows.find(r=>String(r.serviceCode).toUpperCase()===code.toUpperCase());
    const entries=staged?.carryoverDatedUnits || (staged?.carryoverMeta?.rawAuditRows || []).map(a=>({serviceDate:day(a.serviceDate),units:quantity(a)}));
    if(!entries.length || entries.some(a=>!validDate(day(a.serviceDate))))review(`Review dated carryover quantities for ${code} before applying the new schedule.`);
    const dated=entries.map(a=>({...a,serviceDate:day(a.serviceDate)}));
    const exact=dated.every(a=>a.units!=null && Number.isFinite(Number(a.units)) && Number(a.units)>0);
    if(exact && Math.abs(dated.reduce((sum,a)=>sum+Number(a.units),0)-carryUnits)>0.005)review(`Saved dated carryover quantities for ${code} do not match its ${carryUnits} payable units.`);
    const historical=dated.filter(a=>a.serviceDate<boundary),modern=dated.filter(a=>a.serviceDate>=boundary);
    if(modern.length && !exact)review(`Recover the exact carried-over ${code} units by service date before applying the new schedule.`);
    if(modern.length)datedUnitsByCode.set(code.toUpperCase(),[...(datedUnitsByCode.get(code.toUpperCase()) || []),...modern.map(a=>({serviceDate:a.serviceDate,units:Number(a.units)}))]);
    if(!historical.length)continue;
    const quoted=historical.map(a=>({...a,rate:savedHistoricalRate({code,date:a.serviceDate,row,ratesByCode,rateCard,historicalSummaries})}));
    const terms=r=>JSON.stringify([r.amount,r.unit,r.divisor]);
    if(!exact && new Set(quoted.map(a=>terms(a.rate))).size>1)review(`Split ${code} carryover quantities by their historical rate dates.`);
    const groups=new Map();
    if(exact){for(const a of quoted){const key=terms(a.rate),g=groups.get(key) || {rate:a.rate,units:0,dates:[]};g.units+=Number(a.units);g.dates.push(a.serviceDate);groups.set(key,g);}}
    else groups.set('legacy',{rate:quoted[0].rate,units:carryUnits,dates:quoted.map(a=>a.serviceDate)});
    const priorUnits=exact?historical.reduce((sum,a)=>sum+Number(a.units),0):carryUnits;
    const total=Number(row.finalizedUnits ?? row.units),current=total-priorUnits;
    if(current < -0.000001)review(`Carryover units exceed total units for ${code}.`);
    let index=0;
    for(const group of groups.values()){
      const prior={...row,units:group.units,finalizedUnits:group.units,noNoteUnits:0,draftUnits:0,
        displayServiceCode:code,payMethod:'historical_fixed',rateSource:group.rate.source,rateUnit:group.rate.unit,payDivisor:group.rate.divisor,
        rateAmount:group.rate.amount,serviceDates:[...new Set(group.dates)],label:`${code} (prior services)`};
      for(const key of ['hours','creditsHours','payHours'])prior[key]=Number(row[key] || 0)*group.units/total;
      prior.payHours=group.units/Number(prior.payDivisor || 1);
      prior.amount=Math.round((prior.rateUnit==='per_hour'?prior.payHours:group.units)*prior.rateAmount*100)/100;
      breakdown[`${code}__historical${index++?'_'+index:''}`]=prior;
    }
    row.units=current;row.finalizedUnits=current;row.oldDoneNotesUnits=carryUnits-priorUnits;row.oldDoneNotesNotes=Math.max(0,Number(row.oldDoneNotesNotes || 0)-historical.length);
    for(const key of ['hours','creditsHours','payHours'])row[key]=Number(row[key] || 0)*current/total;
    row.amount=0;
  }
}
