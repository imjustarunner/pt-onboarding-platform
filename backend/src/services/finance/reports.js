import {fail,expenseStateTotals} from './policy.js';
export function operationalReport(data,kind){
 const org=data.organization.name;
 if(kind==='expenses')return [['Organization','Expense','Program','Date','Amount USD','Status','Category','Kind'],...data.expenses.map(e=>[org,e.title,data.programs.find(p=>p.id===e.program_id)?.name,e.expense_date instanceof Date?e.expense_date.toISOString().slice(0,10):e.expense_date,Number(e.amount_cents)/100,e.status,e.category,e.kind])];
 if(kind==='program-budgets')return [['Organization','Program','Approved USD','Paid USD','Committed USD','Available USD','Pending requests USD'],...data.programs.map(p=>{const budget=data.budgets.filter(b=>b.program_id===p.id).reduce((n,b)=>n+Number(b.amount_cents),0),t=expenseStateTotals(data.expenses.filter(e=>e.program_id===p.id));return [org,p.name,budget/100,t.paid/100,t.committed/100,(budget-t.paid-t.committed)/100,t.pending/100];})];
 if(kind==='grant-utilization'){
  if(data.role!=='manager')throw fail(403,'Finance manager access required');
  return [['Organization','Grant','Award USD','Budgeted USD','Paid USD','Committed USD','Award remaining USD','Report due'],...data.grants.map(g=>{
   const budgets=data.budgets.filter(b=>b.grant_id===g.id),ids=new Set(data.allocations.filter(a=>budgets.some(b=>b.id===a.budget_id)).map(a=>a.id));
   const totals=expenseStateTotals(data.splits.filter(s=>ids.has(s.allocation_id)).map(s=>({amount_cents:s.amount_cents,status:data.expenses.find(e=>e.id===s.expense_id)?.status})));
   return [org,g.name,Number(g.award_cents)/100,budgets.reduce((n,b)=>n+Number(b.amount_cents),0)/100,totals.paid/100,totals.committed/100,(Number(g.award_cents)-totals.paid-totals.committed)/100,g.report_due instanceof Date?g.report_due.toISOString().slice(0,10):g.report_due];
  })];
 }
 throw fail(404,'Report not found');
}
