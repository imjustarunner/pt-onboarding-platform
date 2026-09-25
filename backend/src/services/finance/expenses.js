import pool from '../../config/database.js';
import {fail,id,cents,text,date,related,staff,audit,transaction} from './policy.js';
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export function validateSplits(lines,amount){if(!Array.isArray(lines)||!lines.length||lines.length>30)throw fail(400,'Assign 1–30 funding allocations');const seen=new Set();const out=lines.map(l=>{const allocationId=id(l.allocationId);if(seen.has(allocationId))throw fail(400,'Use each allocation once');seen.add(allocationId);return {allocationId,amountCents:cents(l.amountCents)};});if(out.reduce((n,l)=>n+l.amountCents,0)!==amount)throw fail(400,'Funding splits must equal the expense amount exactly');return out;}
export const transitions={draft:['submitted','void'],submitted:['in_review','needs_info','rejected'],in_review:['needs_info','approved','rejected'],needs_info:['submitted','void'],approved:['scheduled','needs_info','void'],scheduled:['paid','approved'],paid:[],rejected:[],void:[]};
export function checkTransition(expense,status,scope,input){
 if(!transitions[expense.status]?.includes(status))throw fail(409,'That status change is not allowed');
 if(scope.role!=='manager'&&(!['draft','needs_info'].includes(expense.status)||!['submitted','void'].includes(status)||Number(expense.requested_by_user_id)!==scope.userId))throw fail(403,'Finance manager review is required');
 if(status==='approved'&&(Number(expense.requested_by_user_id)===scope.userId||Number(expense.staff_user_id)===scope.userId))throw fail(409,'Another finance manager must approve this expense');
 if(status==='approved'&&input.restrictionsReviewed!==true)throw fail(400,'Confirm the expense complies with its fund and grant restrictions');
 if(status==='paid'&&input.paymentConfirmed!==true)throw fail(400,'Confirm this payment was completed outside the app');
}
export async function createExpense(scope,input,db=pool){
 if(scope.role==='viewer')throw fail(403,'This finance view is read-only');
 const key=text(input.requestKey,80);if(!/^[a-zA-Z0-9_-]{12,80}$/.test(key))throw fail(400,'A stable request key is required');
 return transaction(scope,async conn=>{
  const [[old]]=await conn.execute('SELECT id FROM finance_expenses WHERE agency_id=? AND request_key=?',[scope.agencyId,key]);if(old)return {id:old.id,reused:true};
  const program=await related(conn,'finance_programs',input.programId,scope.agencyId),event=await related(conn,'finance_events',input.eventId,scope.agencyId,true),partner=scope.role==='manager'?await related(conn,'finance_partners',input.partnerId,scope.agencyId,true):null;
  if(event&&event.program_id!==program.id)throw fail(400,'The event must belong to this program');
  if(!['vendor','reimbursement','scholarship'].includes(input.kind))throw fail(400,'Choose an expense type');
  const staffId=await staff(conn,input.staffUserId,scope.agencyId);
  const [r]=await conn.execute('INSERT INTO finance_expenses (agency_id,request_key,title,description,kind,program_id,event_id,partner_id,staff_user_id,amount_cents,expense_date,category,requested_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[scope.agencyId,key,text(input.title),text(input.description,5000,false),input.kind,program.id,event?.id||null,partner?.id||null,staffId,cents(input.amountCents),date(input.expenseDate),text(input.category,80),scope.userId]);
  await conn.execute("INSERT INTO finance_expense_history (agency_id,expense_id,actor_user_id,to_status,note) VALUES (?,?,?,'draft','Expense request created')",[scope.agencyId,r.insertId,scope.userId]);
  await audit(conn,scope,'created','expense',r.insertId);return {id:r.insertId};
 },db);
}
export async function assignExpense(scope,expenseId,input,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');return transaction(scope,async conn=>{
 const expense=await related(conn,'finance_expenses',expenseId,scope.agencyId);if(expense.revision!==Number(input.revision))throw fail(409,'Expense changed; refresh before coding');if(!['draft','submitted','in_review','needs_info'].includes(expense.status))throw fail(409,'Approved and paid expenses cannot be recoded');
 const splits=validateSplits(input.splits,Number(expense.amount_cents));
 for(const line of splits){const allocation=await related(conn,'finance_allocations',line.allocationId,scope.agencyId),budget=await related(conn,'finance_budgets',allocation.budget_id,scope.agencyId);if(budget.program_id!==expense.program_id)throw fail(400,'Funding allocation belongs to a different program');}
 await conn.execute('DELETE FROM finance_expense_splits WHERE agency_id=? AND expense_id=?',[scope.agencyId,expense.id]);
 for(const line of splits)await conn.execute('INSERT INTO finance_expense_splits (expense_id,agency_id,allocation_id,amount_cents) VALUES (?,?,?,?)',[expense.id,scope.agencyId,line.allocationId,line.amountCents]);
 await conn.execute('UPDATE finance_expenses SET revision=revision+1 WHERE id=? AND agency_id=?',[expense.id,scope.agencyId]);await audit(conn,scope,'funding_assigned','expense',expense.id,{splits});return {id:expense.id};
 },db);}
async function fundingCheck(conn,scope,expense){
 const [lines]=await conn.execute('SELECT s.*,a.amount_cents AS allocated_cents,a.budget_id,b.program_id,b.fund_id,b.grant_id,b.start_date,b.end_date FROM finance_expense_splits s JOIN finance_allocations a ON a.id=s.allocation_id AND a.agency_id=s.agency_id JOIN finance_budgets b ON b.id=a.budget_id AND b.agency_id=a.agency_id WHERE s.agency_id=? AND s.expense_id=?',[scope.agencyId,expense.id]);
 validateSplits(lines.map(l=>({allocationId:l.allocation_id,amountCents:Number(l.amount_cents)})),Number(expense.amount_cents));
 const fundAmounts=new Map();
 for(const line of lines){
  if(line.program_id!==expense.program_id||iso(expense.expense_date)<iso(line.start_date)||iso(expense.expense_date)>iso(line.end_date))throw fail(409,'Expense program or date falls outside its approved budget');
  const [[used]]=await conn.execute("SELECT COALESCE(SUM(s.amount_cents),0) total FROM finance_expense_splits s JOIN finance_expenses e ON e.id=s.expense_id AND e.agency_id=s.agency_id WHERE s.agency_id=? AND s.allocation_id=? AND e.id<>? AND e.status IN ('approved','scheduled','paid')",[scope.agencyId,line.allocation_id,expense.id]);
  if(Number(used.total)+Number(line.amount_cents)>Number(line.allocated_cents))throw fail(409,'This expense would exceed an allocation');
  fundAmounts.set(line.fund_id,(fundAmounts.get(line.fund_id)||0)+Number(line.amount_cents));
 }
 for(const [fundId,amount] of fundAmounts){
  const [[received]]=await conn.execute('SELECT COALESCE(SUM(amount_cents),0) total FROM finance_receipts WHERE agency_id=? AND fund_id=?',[scope.agencyId,fundId]);
  const [[used]]=await conn.execute("SELECT COALESCE(SUM(s.amount_cents),0) total FROM finance_expense_splits s JOIN finance_expenses e ON e.id=s.expense_id AND e.agency_id=s.agency_id JOIN finance_allocations a ON a.id=s.allocation_id AND a.agency_id=s.agency_id JOIN finance_budgets b ON b.id=a.budget_id AND b.agency_id=a.agency_id WHERE s.agency_id=? AND b.fund_id=? AND e.id<>? AND e.status IN ('approved','scheduled','paid')",[scope.agencyId,fundId,expense.id]);
  if(Number(used.total)+amount>Number(received.total))throw fail(409,'Recorded funds are insufficient after other commitments');
 }
}
export async function transitionExpense(scope,expenseId,input,db=pool){if(scope.role==='viewer')throw fail(403,'Read-only access');return transaction(scope,async conn=>{
 const e=await related(conn,'finance_expenses',expenseId,scope.agencyId);if(Number(input.revision)!==e.revision)throw fail(409,'Expense changed; refresh before taking action');const status=text(input.status,24);checkTransition(e,status,scope,input);const note=text(input.note,5000);
 if(['approved','paid'].includes(status))await fundingCheck(conn,scope,e);
 if(status==='approved'){const [[receipt]]=await conn.execute("SELECT COUNT(*) n FROM finance_documents WHERE agency_id=? AND expense_id=? AND kind IN ('receipt','invoice','award')",[scope.agencyId,e.id]);if(!receipt.n)throw fail(409,'Attach a receipt, invoice or scholarship award document before approval');}
 let reference=null,paidDate=null,qb=null;
 if(status==='paid'){reference=text(input.paymentReference);paidDate=date(input.paymentDate);qb=text(input.quickbooksReference,200,false)||null;if(paidDate>new Date().toISOString().slice(0,10))throw fail(400,'A future scheduled payment is not paid');}
 await conn.execute('UPDATE finance_expenses SET status=?,revision=revision+1,approved_by_user_id=?,payment_reference=?,payment_date=?,quickbooks_reference=? WHERE id=? AND agency_id=?',[status,status==='approved'?scope.userId:['scheduled','paid'].includes(status)?e.approved_by_user_id:null,reference,paidDate,qb,e.id,scope.agencyId]);
 await conn.execute('INSERT INTO finance_expense_history (agency_id,expense_id,actor_user_id,from_status,to_status,note) VALUES (?,?,?,?,?,?)',[scope.agencyId,e.id,scope.userId,e.status,status,note]);await audit(conn,scope,'status_changed','expense',e.id,{from:e.status,to:status});return {id:e.id,status,moneyMoved:false};
 },db);}
export async function editExpense(scope,expenseId,input,db=pool){if(scope.role==='viewer')throw fail(403,'Read-only access');return transaction(scope,async conn=>{
 const e=await related(conn,'finance_expenses',expenseId,scope.agencyId);if(scope.role!=='manager'&&Number(e.requested_by_user_id)!==scope.userId)throw fail(403,'You may edit only your own request');if(!['draft','needs_info'].includes(e.status)||e.revision!==Number(input.revision))throw fail(409,'Only current drafts or requests needing information can be edited');
 const amount=cents(input.amountCents),when=date(input.expenseDate);await conn.execute('UPDATE finance_expenses SET title=?,description=?,amount_cents=?,expense_date=?,revision=revision+1 WHERE id=? AND agency_id=?',[text(input.title),text(input.description,5000,false),amount,when,e.id,scope.agencyId]);
 await conn.execute('DELETE FROM finance_expense_splits WHERE agency_id=? AND expense_id=?',[scope.agencyId,e.id]);await audit(conn,scope,'amended','expense',e.id,{before:{title:e.title,description:e.description,amountCents:Number(e.amount_cents),date:iso(e.expense_date)},after:{title:text(input.title),description:text(input.description,5000,false),amountCents:amount,date:when},reason:text(input.note,5000)});return {id:e.id};
 },db);}
