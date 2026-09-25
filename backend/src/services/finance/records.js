import pool from '../../config/database.js';
import {fail,id,cents,text,date,period,related,staff,audit,transaction,expenseStateTotals} from './policy.js';
export const tables={programs:'finance_programs',partners:'finance_partners',funds:'finance_funds',receipts:'finance_receipts',grants:'finance_grants',budgets:'finance_budgets',allocations:'finance_allocations',events:'finance_events',requests:'finance_requests'};
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const sums=async(db,sql,args)=>Number((await db.execute(sql,args))[0][0]?.total||0);
export async function createRecord(scope,kind,input,db=pool){
 if(!tables[kind])throw fail(404,'Finance area not found');
 if(scope.role!=='manager'&&!['requests'].includes(kind))throw fail(403,'Finance manager access required');
 if(scope.role==='viewer')throw fail(403,'This finance view is read-only');
 return transaction(scope,async conn=>{
  const agencyId=scope.agencyId;let fields={agency_id:agencyId};
  if(kind==='programs')fields={...fields,name:text(input.name),description:text(input.description,5000,false),staff_user_id:await staff(conn,input.staffUserId,agencyId)};
  if(kind==='partners'){if(!['grantor','vendor','donor','partner','staff','recipient'].includes(input.kind))throw fail(400,'Choose a partner type');fields={...fields,name:text(input.name),kind:input.kind,contact:text(input.contact,255,false),notes:text(input.notes,5000,false)};}
  if(kind==='funds'){if(!['restricted','unrestricted','reserve'].includes(input.kind))throw fail(400,'Choose a fund type');fields={...fields,name:text(input.name),kind:input.kind,restrictions:text(input.restrictions,5000,input.kind==='restricted')};}
  if(kind==='receipts'){const fund=await related(conn,tables.funds,input.fundId,agencyId);fields={...fields,fund_id:fund.id,amount_cents:cents(input.amountCents),received_date:date(input.receivedDate),reference:text(input.reference),actor_user_id:scope.userId};if(fields.received_date>new Date().toISOString().slice(0,10))throw fail(400,'Record money received, not a future award');}
  if(kind==='grants'){const fund=await related(conn,tables.funds,input.fundId,agencyId),partner=await related(conn,tables.partners,input.partnerId,agencyId,true),[start,end]=period(input.startDate,input.endDate);const [[existing]]=await conn.execute('SELECT COUNT(*) total FROM finance_budgets WHERE agency_id=? AND fund_id=? AND grant_id IS NULL',[agencyId,fund.id]);if(existing.total)throw fail(409,'Use a separate grant fund when unrestricted budgets already exist');fields={...fields,name:text(input.name),fund_id:fund.id,partner_id:partner?.id||null,award_cents:cents(input.amountCents),start_date:start,end_date:end,report_due:date(input.reportDue,true),restrictions:text(input.restrictions,5000,false)};}
  if(kind==='budgets'){
   const fund=await related(conn,tables.funds,input.fundId,agencyId),program=await related(conn,tables.programs,input.programId,agencyId),grant=await related(conn,tables.grants,input.grantId,agencyId,true),[start,end]=period(input.startDate,input.endDate),amount=cents(input.amountCents);
   if(!grant){const [[hasGrant]]=await conn.execute('SELECT COUNT(*) total FROM finance_grants WHERE agency_id=? AND fund_id=?',[agencyId,fund.id]);if(hasGrant.total)throw fail(400,'Select the grant associated with this fund');}
   if(grant&&(grant.fund_id!==fund.id||start<iso(grant.start_date)||end>iso(grant.end_date)))throw fail(400,'Budget must use the grant’s fund and award period');
   const allocated=await sums(conn,`SELECT SUM(amount_cents) total FROM finance_budgets WHERE agency_id=? AND ${grant?'grant_id=?':'fund_id=? AND grant_id IS NULL'}`,[agencyId,grant?.id||fund.id]);
   const ceiling=grant?Number(grant.award_cents):await sums(conn,'SELECT SUM(amount_cents) total FROM finance_receipts WHERE agency_id=? AND fund_id=?',[agencyId,fund.id]);
   if(allocated+amount>ceiling)throw fail(409,'Budgets exceed the grant award or recorded unrestricted funding');
   fields={...fields,name:text(input.name),program_id:program.id,fund_id:fund.id,grant_id:grant?.id||null,amount_cents:amount,start_date:start,end_date:end};
  }
  if(kind==='allocations'){const budget=await related(conn,tables.budgets,input.budgetId,agencyId),amount=cents(input.amountCents),used=await sums(conn,'SELECT SUM(amount_cents) total FROM finance_allocations WHERE agency_id=? AND budget_id=?',[agencyId,budget.id]);if(used+amount>Number(budget.amount_cents))throw fail(409,'Allocations exceed the approved budget');fields={...fields,budget_id:budget.id,name:text(input.name),amount_cents:amount};}
  if(kind==='events'){const program=await related(conn,tables.programs,input.programId,agencyId),[start,end]=period(input.startDate,input.endDate);if(!['event','training','mentoring','trip','scholarship'].includes(input.kind))throw fail(400,'Choose a program activity type');const count=Number(input.plannedParticipants||0);if(!Number.isSafeInteger(count)||count<0||count>100000)throw fail(400,'Enter a valid participant count');fields={...fields,program_id:program.id,name:text(input.name),kind:input.kind,start_date:start,end_date:end,location:text(input.location,255,false),description:text(input.description,5000,false),planned_participants:count};}
  if(kind==='requests'){if(!['support','budget_change','report'].includes(input.kind))throw fail(400,'Choose a request type');const program=await related(conn,tables.programs,input.programId,agencyId,true),grant=await related(conn,tables.grants,input.grantId,agencyId,true);fields={...fields,kind:input.kind,title:text(input.name),description:text(input.description,5000,false),program_id:program?.id||null,grant_id:grant?.id||null,due_date:date(input.dueDate,true),requested_by_user_id:scope.userId};}
  const keys=Object.keys(fields),[r]=await conn.execute(`INSERT INTO ${tables[kind]} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(fields));await audit(conn,scope,'created',kind,r.insertId);return {id:r.insertId};
 },db);
}
export async function workspace(scope,db=pool){
 const agencyId=scope.agencyId,result={organization:scope.org,role:scope.role};
 const [members]=await db.execute('SELECT u.id,u.first_name,u.last_name FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.agency_id=? ORDER BY u.first_name,u.last_name',[agencyId]);result.staff=members.map(u=>({id:u.id,name:[u.first_name,u.last_name].filter(Boolean).join(' ')}));
 const visible=scope.role==='manager'?Object.keys(tables):['programs','budgets','events','requests'];
 for(const kind of visible){const [rows]=await db.execute(`SELECT * FROM ${tables[kind]} WHERE agency_id=? ORDER BY id`,[agencyId]);result[kind]=rows;}
 const [expenses]=await db.execute('SELECT * FROM finance_expenses WHERE agency_id=? ORDER BY id DESC',[agencyId]);
 result.expenses=scope.role==='manager'?expenses:expenses.map(({payment_reference,quickbooks_reference,approved_by_user_id,request_key,...e})=>e);
 const [splits]=scope.role==='manager'?await db.execute('SELECT * FROM finance_expense_splits WHERE agency_id=?',[agencyId]):[[]];result.splits=splits;
 const [documents]=await db.execute(`SELECT id,name,kind,mime,size_bytes,visibility,program_id,grant_id,expense_id,request_id,created_at FROM finance_documents WHERE agency_id=? ${scope.role==='manager'?'':"AND visibility='organization'"} ORDER BY id DESC`,[agencyId]);result.documents=documents;
 const [history]=await db.execute('SELECT id,expense_id,to_status,note,created_at FROM finance_expense_history WHERE agency_id=? ORDER BY id DESC LIMIT 100',[agencyId]);result.history=history;
 result.totals=expenseStateTotals(expenses);result.totals.budget=result.budgets.reduce((n,b)=>n+Number(b.amount_cents),0);result.totals.available=result.totals.budget-result.totals.paid-result.totals.committed;
 if(scope.role==='manager'){
  result.totals.received=result.receipts.reduce((n,r)=>n+Number(r.amount_cents),0);result.totals.awarded=result.grants.reduce((n,g)=>n+Number(g.award_cents),0);
  result.totals.fundAvailable=result.totals.received-result.totals.paid-result.totals.committed;
  const [auditRows]=await db.execute("SELECT f.action,f.object_type,f.object_id,f.created_at,f.detail_json,CONCAT_WS(' ',u.first_name,u.last_name) actor_name FROM finance_audit f LEFT JOIN users u ON u.id=f.actor_user_id WHERE f.agency_id=? ORDER BY f.id DESC LIMIT 50",[agencyId]);result.audit=auditRows;
 }else{
  // Portal budgets reveal approved spending authority, not sponsor fund structures.
  result.budgets=result.budgets.map(({fund_id,grant_id,...b})=>b);
 }
 return result;
}
export async function updateRequest(scope,requestId,input,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');return transaction(scope,async conn=>{const r=await related(conn,'finance_requests',requestId,scope.agencyId);if(Number(input.revision)!==r.revision)throw fail(409,'Refresh this request before updating');if(!['open','in_review','needs_info','completed'].includes(input.status))throw fail(400,'Choose a request status');await conn.execute('UPDATE finance_requests SET status=?,response=?,revision=revision+1 WHERE id=? AND agency_id=?',[input.status,text(input.response,5000),r.id,scope.agencyId]);await audit(conn,scope,'responded','request',r.id,{status:input.status});return {id:r.id};},db);}

// Amend spending authority without erasing the original decision or paid history.
export async function amendAuthority(scope,kind,recordId,input,db=pool){
 if(scope.role!=='manager')throw fail(403,'Finance manager access required');
 if(!['budgets','allocations'].includes(kind))throw fail(404,'Spending authority not found');
 return transaction(scope,async conn=>{
  const r=await related(conn,tables[kind],recordId,scope.agencyId),amount=cents(input.amountCents,true),reason=text(input.reason,5000);
  if(Number(input.previousAmountCents)!==Number(r.amount_cents))throw fail(409,'Spending authority changed; refresh before amending');
  if(kind==='budgets'){
   if(Number(input.revision)!==r.revision)throw fail(409,'Budget changed; refresh before amending');
   const floor=await sums(conn,'SELECT SUM(amount_cents) total FROM finance_allocations WHERE agency_id=? AND budget_id=?',[scope.agencyId,r.id]);
   if(amount<floor)throw fail(409,'Reduce unused allocations before reducing this budget');
   const other=await sums(conn,`SELECT SUM(amount_cents) total FROM finance_budgets WHERE agency_id=? AND id<>? AND ${r.grant_id?'grant_id=?':'fund_id=? AND grant_id IS NULL'}`,[scope.agencyId,r.id,r.grant_id||r.fund_id]);
   const ceiling=r.grant_id?Number((await related(conn,tables.grants,r.grant_id,scope.agencyId)).award_cents):await sums(conn,'SELECT SUM(amount_cents) total FROM finance_receipts WHERE agency_id=? AND fund_id=?',[scope.agencyId,r.fund_id]);
   if(other+amount>ceiling)throw fail(409,'The amended budget exceeds its funding authority');
   await conn.execute('UPDATE finance_budgets SET amount_cents=?,revision=revision+1 WHERE agency_id=? AND id=?',[amount,scope.agencyId,r.id]);
  }else{
   const used=await sums(conn,"SELECT SUM(s.amount_cents) total FROM finance_expense_splits s JOIN finance_expenses e ON e.id=s.expense_id AND e.agency_id=s.agency_id WHERE s.agency_id=? AND s.allocation_id=? AND e.status IN ('approved','scheduled','paid')",[scope.agencyId,r.id]);
   if(amount<used)throw fail(409,'Paid and committed expenses cannot lose their allocation');
   const budget=await related(conn,tables.budgets,r.budget_id,scope.agencyId),other=await sums(conn,'SELECT SUM(amount_cents) total FROM finance_allocations WHERE agency_id=? AND budget_id=? AND id<>?',[scope.agencyId,r.budget_id,r.id]);
   if(amount+other>Number(budget.amount_cents))throw fail(409,'Allocations exceed the approved budget');
   await conn.execute('UPDATE finance_allocations SET amount_cents=? WHERE agency_id=? AND id=?',[amount,scope.agencyId,r.id]);
  }
  await audit(conn,scope,'authority_amended',kind,r.id,{beforeCents:Number(r.amount_cents),afterCents:amount,reason});return {id:r.id};
 },db);
}
