const roundMoney=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
/** Read-only calculation from an immutable saved payroll breakdown. Overlap must
 * be established by records or the payroll owner, never inferred from all
 * indirect hours (which also contain supervision, events and other duties).
 */
export function reconcileDirectCareIndirect({breakdown,overlapMinutes=0,overlapAmount=0}) {
 const b=typeof breakdown==='string'?JSON.parse(breakdown):breakdown;
 if(b?.__adjustments?.basePayIsSalaryOverride&&!b.__adjustments.salaryIncludeServicePay)return {salaryOnly:true,additionalMinutes:0,additionalAmount:0};
 const lines=(b?.__paySystem?.lines||[]).filter(l=>l.payType==='hcode');
 if(!lines.length)return {salaryOnly:false,additionalMinutes:0,additionalAmount:0,lines:[]};
 let allowanceMinutes=0,allowanceAmount=0,automaticMinutesPaid=0,automaticAmountPaid=0;
 for(const line of lines){
  const hours=Number(line.hourEquivalent),rate=Number(line.autoIndirectRate);
  if(!Number.isFinite(hours)||hours<0||!Number.isFinite(rate)||rate<=0)throw Error('Confirm the saved service hours and historical indirect rate.');
  allowanceMinutes+=hours*10;allowanceAmount+=hours/6*rate;
  automaticMinutesPaid+=Number(line.autoIndirectHours||0)*60;automaticAmountPaid+=Number(line.autoIndirectAmount||0);
 }
 if(!Number.isFinite(overlapMinutes)||overlapMinutes<0||!Number.isFinite(overlapAmount)||overlapAmount<0)throw Error('Confirm documented overlap.');
 return {salaryOnly:false,allowanceMinutes,allowanceAmount:roundMoney(allowanceAmount),automaticMinutesPaid,automaticAmountPaid:roundMoney(automaticAmountPaid),overlapMinutes,overlapAmount,
  additionalMinutes:Math.max(0,allowanceMinutes-automaticMinutesPaid-overlapMinutes),
  additionalAmount:Math.max(0,roundMoney(allowanceAmount-automaticAmountPaid-overlapAmount)),
  lines:lines.map(l=>({code:l.serviceCode,quantity:l.units,hours:l.hourEquivalent,indirectRate:l.autoIndirectRate}))};
}
