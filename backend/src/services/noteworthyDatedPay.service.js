import { rateAtDate } from './payrollBilledPay.service.js';
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value || '').slice(0,10);
const review=message=>{throw Object.assign(new Error(message),{status:409,code:'NOTEWORTHY_DATED_PAY_REVIEW_REQUIRED'});};

// Standalone practices agree rates by effective date. Their legacy aggregate
// staging lines must therefore be valued at each underlying service date.
export function noteworthyDatedFixedPay({row,currentEntries=[],rates,divisor=1,rulePayUnit=null}) {
  const units=Number(row.finalizedUnits || 0),carryUnits=Number(row.oldDoneNotesUnits || 0);
  if(!(units>0))return {amount:0,lines:[],rateAmount:null};
  const carryEntries=row.carryoverDatedUnits || (row.carryoverMeta?.rawAuditRows || []).map(r=>({serviceDate:r.serviceDate,units:r.unitCount ?? r.units}));
  const present=currentEntries.filter(r=>Number(r.units)>0),carry=carryEntries.filter(r=>Number(r.units)>0);
  const presentTotal=present.reduce((sum,r)=>sum+Number(r.units),0),carryTotal=carry.reduce((sum,r)=>sum+Number(r.units),0);
  if(Math.abs(presentTotal-(units-carryUnits))>0.005 || Math.abs(carryTotal-carryUnits)>0.005)review(`Review the dated payable quantities for ${row.serviceCode}; they do not match the staged service and late-note totals.`);
  const lines=[];
  for(const entry of [...present,...carry]) {
    const date=day(entry.serviceDate);
    if(!/^\d{4}-\d\d-\d\d$/.test(date))review(`Review the missing service date for ${row.serviceCode}.`);
    const rate=rateAtDate(rates,date);
    if(!rate || !Number.isFinite(Number(rate.rate_amount)) || Number(rate.rate_amount)<0 || (rate.pay_method && rate.pay_method!=='fixed_rate'))review(`Configure the dated ${row.serviceCode} fixed rate for ${date}.`);
    const unit=rulePayUnit || rate.rate_unit || 'per_unit';
    const amount=Number(entry.units)*Number(rate.rate_amount)/(unit==='per_hour'?Number(divisor || 1):1);
    lines.push({serviceDate:date,units:Number(entry.units),rateAmount:Number(rate.rate_amount),rateUnit:unit,amount:Math.round(amount*100)/100});
  }
  const uniqueRates=new Set(lines.map(r=>`${r.rateAmount}:${r.rateUnit}`));
  return {amount:Math.round(lines.reduce((sum,r)=>sum+r.amount,0)*100)/100,lines,rateAmount:uniqueRates.size===1?lines[0].rateAmount:null};
}
