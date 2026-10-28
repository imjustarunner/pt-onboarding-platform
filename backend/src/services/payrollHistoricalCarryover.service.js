import {rateAtDate} from './payrollBilledPay.service.js';
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
const review=message=>{throw Object.assign(new Error(message),{code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED'});};

// Carryovers already have reviewed quantities and service dates in the raw audit.
// Preserve their explicitly saved legacy rates; never substitute the new matrix.
export function separateHistoricalCarryovers({breakdown,stagingRows,ratesByCode,rateCard=null,historicalSummaries=[],boundary}) {
  for(const [code,row] of Object.entries({...breakdown})) {
    if(!row || typeof row!=='object' || code.startsWith('__') || row.supervisionTrackingOnly)continue;
    if(['percent_billed','percent_collected'].includes(row.payMethod))continue;
    const carryUnits=Number(row.oldDoneNotesUnits||0);if(!(carryUnits>0))continue;
    const staged=stagingRows.find(r=>String(r.serviceCode).toUpperCase()===code.toUpperCase());
    const dates=[...new Set((staged?.carryoverMeta?.rawAuditRows||[]).map(r=>day(r.serviceDate)))];
    if(!dates.length || dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>=boundary))review(`Review dated carryover quantities for ${code} before applying the new schedule.`);
    const rates=dates.map(d=>{
      const summary=historicalSummaries.find(s=>day(s.period_start)<=d && day(s.period_end)>=d);
      const lines=typeof summary?.breakdown==='string'?JSON.parse(summary.breakdown):summary?.breakdown;
      const previous=Object.entries(lines||{}).find(([key,value])=>String(value?.displayServiceCode||key).toUpperCase()===code.toUpperCase())?.[1];
      if(previous?.rateAmount!=null && Number.isFinite(Number(previous.rateAmount)) && previous.rateSource!=='none') {
        return {rate_amount:Number(previous.rateAmount),source:'historical_payroll_snapshot',rateUnit:previous.rateUnit,payDivisor:previous.payDivisor};
      }
      const saved=rateAtDate(ratesByCode.get(code.toUpperCase())||[],d);
      if(saved)return saved;
      // A legacy hourly card is evidence only when it predates the actual work.
      if(row.rateSource==='rate_card' && rateCard?.updated_at && day(rateCard.updated_at)<=d) {
        return {rate_amount:row.rateAmount,source:'historical_rate_card'};
      }
      return null;
    });
    if(rates.some(r=>!r || r.rate_amount==null || !Number.isFinite(Number(r.rate_amount))))review(`A saved historical ${code} rate is required for carried-over work.`);
    if(rates.some(r=>Number(r.rate_amount)!==Number(rates[0].rate_amount)||(r.rateUnit||row.rateUnit)!==(rates[0].rateUnit||row.rateUnit)||(r.payDivisor||row.payDivisor)!==(rates[0].payDivisor||row.payDivisor)))review(`Split ${code} carryover quantities by their historical rate dates.`);
    const total=Number(row.finalizedUnits??row.units),current=total-carryUnits;
    if(current < -0.000001)review(`Carryover units exceed total units for ${code}.`);
    const prior={...row,units:carryUnits,finalizedUnits:carryUnits,noNoteUnits:0,draftUnits:0,
      displayServiceCode:code,payMethod:'historical_fixed',rateSource:rates[0].source||'historical_per_code_rate',
      rateUnit:rates[0].rateUnit||row.rateUnit,payDivisor:rates[0].payDivisor||row.payDivisor,
      rateAmount:Number(rates[0].rate_amount),serviceDates:dates,label:`${code} (prior services)`};
    for(const key of ['hours','creditsHours','payHours'])prior[key]=Number(row[key]||0)*carryUnits/total;
    prior.payHours=carryUnits/Number(prior.payDivisor||1);
    prior.amount=Math.round((prior.rateUnit==='per_hour'?prior.payHours:carryUnits)*prior.rateAmount*100)/100;
    breakdown[`${code}__historical`]=prior;
    row.units=current;row.finalizedUnits=current;row.oldDoneNotesUnits=0;row.oldDoneNotesNotes=0;
    for(const key of ['hours','creditsHours','payHours'])row[key]=Number(row[key]||0)*current/total;
    row.amount=0;
  }
}
