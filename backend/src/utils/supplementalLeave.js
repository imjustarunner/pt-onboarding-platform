import {computeServiceCreditLeave,paidTimeBasisFromSummaryRow} from './payrollPtoAccrual.util.js';
export const LEAVE_BALANCE_COLUMNS={sick:'sick_balance_hours',training:'training_balance_hours',school_support:'school_support_balance_hours'};
export const leaveLabel=type=>({sick:'Sick Leave',training:'Training PTO',school_support:'School Support Hours'}[type]||'Leave');
export function sharedLeaveBasis({summaryRow,policy,employmentType}) {
 const modern=computeServiceCreditLeave({summaryRow,policy,employmentType,trainingPtoEligible:false});
 if(!modern)return paidTimeBasisFromSummaryRow(summaryRow);
 const program=modern.directBasisHours+modern.indirectBasisHours+modern.supportBasisHours+modern.legacyBasisHours;
 // Include actual compensable hours when they exceed the credited equivalents.
 let breakdown=summaryRow.breakdown;if(typeof breakdown==='string'){try{breakdown=JSON.parse(breakdown)}catch{breakdown={}}}
 return Math.max(program,Number(summaryRow.actual_worked_hours??breakdown?.actualWorkedHours??0)||0);
}
export function supplementalEarn({basisHours,bucket,balance=0,trainingCap=20}) {
 const basis=Number(basisHours);if(!Number.isFinite(basis)||basis<0)throw Error('Invalid leave accrual basis');
 if(bucket==='school_support')return Math.round(Math.min(basis*2/25,Math.max(0,20-Number(balance)))*1000000)/1000000;
 if(bucket!=='training')throw Error('Invalid leave bucket');
 return Math.round(Math.min(basis*.25/30,Math.max(0,Number(trainingCap)-Number(balance)))*1000000)/1000000;
}
export function validateLeaveItems(items){
 if(!Array.isArray(items)||!items.length)throw Error('At least one use date and hours entry is required');
 return items.map(i=>{const raw=i.request_date??i.requestDate??i.date??'',date=raw instanceof Date?raw.toISOString().slice(0,10):String(raw).slice(0,10),hours=Number(i.hours);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!Number.isFinite(hours)||hours<=0||hours>24)throw Error('Enter a valid use date and between 0 and 24 hours');return {date,hours};});
}

/** Allocate a partial approval to the earliest use dates, retaining every hour. */
export function splitLeaveItems(items, approvalHours) {
 const total = Math.round(items.reduce((sum,item)=>sum+item.hours,0)*100);
 const value = approvalHours == null ? total/100 : Number(approvalHours);
 const selected = Math.round(value*100);
 if(!Number.isFinite(value) || selected<=0 || selected>total || Math.abs(value*100-selected)>1e-7) {
  throw Object.assign(new Error('Enter approval hours greater than zero and no more than the requested hours, using at most two decimal places.'),{status:400});
 }
 let left=selected;
 const approved=[],remaining=[];
 for(const item of items) {
  const hours=Math.round(item.hours*100),take=Math.min(left,hours);
  if(take)approved.push({...item,hours:take/100});
  if(hours>take)remaining.push({...item,hours:(hours-take)/100});
  left-=take;
 }
 return {approved,remaining,approvedHours:selected/100,remainingHours:(total-selected)/100,totalHours:total/100};
}
