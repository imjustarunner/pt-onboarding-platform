import pool from '../config/database.js';
import { narrivaError } from './narrivaAccess.service.js';

export function groupComplianceReportCharges(rows) {
 const groups=new Map();
 for(const row of rows) {
  const price=Number(row.unit_cents);if(!Number.isSafeInteger(price)||price<=0)continue;
  const key=`narriva_report_${price}`,line=groups.get(key)||{key,label:'Narriva Compliance reports',quantity:0,unitCostCents:price,amountCents:0,reportIds:[]};
  line.quantity++;line.amountCents+=price;line.reportIds.push(row.id);groups.set(key,line);
 }
 return [...groups.values()].map(line=>({...line,label:`Narriva Compliance reports: ${line.quantity} × $${(line.unitCostCents/100).toFixed(2)}`}));
}
export async function complianceReportInvoiceLines(agencyId,periodEnd,{db=pool,lock=false}={}) {
 const end=new Date(periodEnd);if(!Number.isFinite(end.getTime()))throw narrivaError(400,'Invalid billing period.');
 end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()+1);
 try {
  const [rows]=await db.execute(`SELECT id,unit_cents FROM narriva_report_runs WHERE agency_id=? AND status='completed' AND billable_at IS NOT NULL AND billable_at<? AND invoice_id IS NULL AND unit_cents>0 ORDER BY billable_at,id${lock?' FOR UPDATE':''}`,[agencyId,end]);
  return groupComplianceReportCharges(rows);
 }catch(error){if(error.code==='ER_NO_SUCH_TABLE')return [];throw error;}
}
export function appendComplianceReportLines(estimate,lines) {
 if(!lines.length||estimate.businessAgreement?.ended)return estimate;
 const amount=lines.reduce((sum,line)=>sum+line.amountCents,0);
 return {...estimate,narrivaReportLines:lines,
  ...(estimate.chargeLines?{chargeLines:[...estimate.chargeLines,...lines]}:{lineItems:[...(estimate.lineItems||[]),...lines.map(line=>({...line,used:line.quantity,extraCents:line.amountCents}))]}),
  totals:{...estimate.totals,narrivaReportsCents:amount,totalCents:estimate.totals.totalCents+amount}};
}
export async function attachComplianceReportInvoice(agencyId,invoiceId,lines,db) {
 for(const line of lines)for(const id of line.reportIds){
  const [result]=await db.execute("UPDATE narriva_report_runs SET invoice_id=? WHERE id=? AND agency_id=? AND invoice_id IS NULL AND status='completed' AND billable_at IS NOT NULL",[invoiceId,id,agencyId]);
  if(result.affectedRows!==1)throw narrivaError(409,'This report charge was already invoiced. Refresh the invoice.');
 }
}
