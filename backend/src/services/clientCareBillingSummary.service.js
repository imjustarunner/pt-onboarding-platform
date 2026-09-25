import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { assertCollectible } from './familyLedger/policy.js';

export function summarizeCareBalances(rows, now=new Date()) {
 let review=false,oldest=0,due=false;
 for(const r of rows){
  if(r.pending||!r.collectible){review=true;continue;}
  if(Number(r.amount_cents)<=Number(r.paid_cents))continue;
  due=true;const days=Math.max(0,Math.floor((Date.parse(now.toISOString().slice(0,10))-Date.parse(String(r.due_date instanceof Date?r.due_date.toISOString():r.due_date).slice(0,10)))/86400000));oldest=Math.max(oldest,days);
 }
 return {status:due?(oldest?'overdue':'balance_due'):review?'billing_review':'no_balance_due',ageBand:oldest>90?'over_90_days':oldest>60?'61_90_days':oldest>30?'31_60_days':oldest>0?'1_30_days':null,hasItemsUnderReview:review};
}
export async function clientCareBillingSummary(agencyId,clientId,db=pool){
 const insurance=await readClientInsurance(clientId,agencyId,db);
 const policies=['primary','secondary'].filter(slot=>insurance?.[slot]?.insurerName).map(slot=>({position:slot,insurerName:insurance[slot].insurerName}));
 const rows=[];let after=0;
 while(true){
  const [page]=await db.execute(`SELECT r.*,COALESCE((SELECT SUM(a.paid_cents) FROM family_receivable_allocations a WHERE a.receivable_id=r.id),0) AS paid_cents,
   EXISTS(SELECT 1 FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=r.id AND p.status IN ('pending','requires_action','unknown')) AS pending
   FROM family_receivables r WHERE r.agency_id=? AND r.client_id=? AND r.status IN ('open','review','disputed') AND r.id>? ORDER BY r.id LIMIT 200`,[agencyId,clientId,after]);
  for(const row of page){let collectible=false;try{await assertCollectible(row,db);collectible=true;}catch(e){if(e.status!==409)throw e;}rows.push({...row,collectible});}
  if(page.length<200)break;after=page.at(-1).id;
 }
 // Never return claim IDs, transaction details, card/member IDs, or any amounts.
 return {policies,balance:summarizeCareBalances(rows),scope:'Current app ledger; billing handles collection and reconciliation'};
}
