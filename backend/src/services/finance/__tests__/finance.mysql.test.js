import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { splitSqlStatements } from '../../../utils/migrationSql.js';

test('Finance Operations tenant, money, approval and reconciliation controls', {skip:process.env.FINANCE_MYSQL_TEST!=='1'},async t=>{
 assert.equal(process.env.DB_NAME,'finance_operations_test');
 assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'33316');
 process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
 const {default:db}=await import('../../../config/database.js');
 const {financeScope,financeOrganizations}=await import('../policy.js');
 const {enableFinanceOrganization}=await import('../setup.js');
 const {seedFinanceDemo}=await import('../demo.js');
 const {workspace,createRecord,amendAuthority}=await import('../records.js');
 const {createExpense,assignExpense,transitionExpense}=await import('../expenses.js');
 const {uploadDocument,downloadDocument}=await import('../documents.js');
 const {financeBankCanSync,financeBankOverview,reconcileBankExpense,storeFinanceBankEntry}=await import('../bank.js');
 const {default:clinical}=await import('../../../config/clinicalDatabase.js');
 const {bankFeedOverview,syncBankFeed}=await import('../../bankFeed.service.js');
 let scope,demo,portal;
 const actor={id:11,role:'super_admin'};
 try{
  await db.query('CREATE TABLE agencies (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(200),slug VARCHAR(200) UNIQUE,organization_type VARCHAR(40),is_active INT DEFAULT 1,color_palette JSON,logo_url TEXT,feature_flags JSON)');
  await db.query('CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80))');
  await db.query('CREATE TABLE user_agencies (user_id INT,agency_id INT,PRIMARY KEY(user_id,agency_id))');
  await db.query("INSERT INTO agencies (id,name,slug,organization_type) VALUES (1,'Managing Organization','manager','agency'),(2,'Sponsored','sponsored','agency'),(3,'Other','other','agency')");
  await db.query("INSERT INTO users VALUES (11,'Finance','One'),(12,'Requester','Two'),(13,'Provider','Three'),(14,'Finance','Four')");
  await db.query('INSERT INTO user_agencies VALUES (11,1),(12,2),(13,2),(14,1)');
  for(const file of ['1490_bank_transaction_feeds.sql','1495_finance_operations.sql']){
   const sql=await fs.readFile(new URL(`../../../../../database/migrations/${file}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(sql))await db.query(statement);
  }
  await t.test('opt-in enables empty workspaces; sponsor access does not grant providers access',async()=>{
   await enableFinanceOrganization({agencyId:1},db);await enableFinanceOrganization({agencyId:2,managerAgencyId:1},db);
   scope=await financeScope(actor,2,{},db);
   assert.equal((await workspace(scope,db)).totals.budget,0);
   assert.equal((await financeScope({id:11,role:'admin'},2,{},db)).role,'manager');
   assert.equal((await financeScope({id:12,role:'admin'},2,{},db)).role,'requester');
   await assert.rejects(financeScope({id:13,role:'provider'},2,{},db),/Finance permission/);
   await assert.rejects(financeScope({id:12,role:'admin'},1,{},db),/Finance permission/);
   assert.equal(await financeBankCanSync(db,2),false);
  });
  await t.test('demo is deterministic, isolated, and does not create live bank consent',async()=>{
   demo=await seedFinanceDemo({actorUserId:11},db);const again=await seedFinanceDemo({actorUserId:11},db);assert.equal(again.agencyId,demo.agencyId);
   const ds=await financeScope(actor,demo.agencyId,{},db),w=await workspace(ds,db);
   assert.equal(w.grants.length,3);assert.equal(w.totals.awarded,27500000);assert.equal(w.totals.received,22000000);assert.equal(w.events.length,12);assert.equal(w.expenses.length,40);
   assert.equal(await financeBankCanSync(db,demo.agencyId),false);
   assert.equal((await workspace(scope,db)).expenses.length,0);
   assert.equal((await bankFeedOverview(demo.agencyId)).accounts.length,0);
   await db.execute('INSERT INTO user_agencies VALUES (?,?)',[12,demo.agencyId]);
   portal=await financeScope({id:12,role:'admin'},demo.agencyId,{},db);
   const pw=await workspace(portal,db);assert.equal(pw.funds,undefined);assert.equal(pw.splits.length,0);assert.equal(pw.budgets[0].fund_id,undefined);assert.equal(pw.expenses[0].payment_reference,undefined);
   const internal=w.documents.find(d=>d.visibility==='internal');assert.ok(internal);assert.ok(!pw.documents.some(d=>d.id===internal.id));await assert.rejects(downloadDocument(portal,internal.id,db),/not available/);await assert.rejects(financeBankOverview(portal,0,db),/manager/);
   const exported=await downloadDocument(ds,w.documents[0].id,db);assert.match(exported.buffer.toString(),/FICTIONAL DEMO/);
   await assert.rejects(createRecord(scope,'budgets',{name:'Bad',programId:w.programs[0].id,fundId:w.funds[0].id,amountCents:100,startDate:'2026-01-01',endDate:'2026-12-31'},db),/another organization/);
  });
  let program,fund,budget,allocation;
  await t.test('funding authority cannot exceed awards or receipts; changes retain audit history',async()=>{
   program=await createRecord(scope,'programs',{name:'Test program'},db);fund=await createRecord(scope,'funds',{name:'Test fund',kind:'unrestricted'},db);
   await createRecord(scope,'receipts',{fundId:fund.id,amountCents:10000,receivedDate:'2026-01-01',reference:'Funding-1'},db);
   const input={name:'Test budget',programId:program.id,fundId:fund.id,amountCents:11000,startDate:'2026-01-01',endDate:'2026-12-31'};
   await assert.rejects(createRecord(scope,'budgets',input,db),/exceed/);budget=await createRecord(scope,'budgets',{...input,amountCents:10000},db);
   allocation=await createRecord(scope,'allocations',{budgetId:budget.id,name:'Delivery',amountCents:10000},db);
   await assert.rejects(amendAuthority(scope,'budgets',budget.id,{amountCents:9000,previousAmountCents:10000,revision:1,reason:'Reduce'},db),/allocations/);
   await amendAuthority(scope,'allocations',allocation.id,{amountCents:9000,previousAmountCents:10000,reason:'Reserve'},db);
   await amendAuthority(scope,'budgets',budget.id,{amountCents:9000,previousAmountCents:10000,revision:1,reason:'Reserve'},db);
   await assert.rejects(amendAuthority(scope,'budgets',budget.id,{amountCents:11000,previousAmountCents:9000,revision:2,reason:'Increase'},db),/exceeds/);
  });
  const owner={...scope,userId:12,role:'requester'},approver={...scope,userId:14};let expenses=[];
  async function row(id){return (await db.execute('SELECT * FROM finance_expenses WHERE id=?',[id]))[0][0];}
  const change=async(s,id,status,extra={})=>transitionExpense(s,id,{revision:(await row(id)).revision,status,note:'Test review evidence',...extra},db);
  await t.test('idempotent requests, exact funding, evidence and separation of duties',async()=>{
   for(let i=0;i<2;i++){
    const input={requestKey:`finance-expense-test-${i}`,title:'Mentor event',kind:'vendor',programId:program.id,amountCents:6000,expenseDate:'2026-03-10',category:'Training'};
    const e=await createExpense(owner,input,db);expenses.push(e.id);assert.equal((await createExpense(owner,input,db)).id,e.id);
    await assert.rejects(assignExpense(approver,e.id,{revision:1,splits:[{allocationId:allocation.id,amountCents:5000}]},db),/exactly/);
    await assignExpense(approver,e.id,{revision:1,splits:[{allocationId:allocation.id,amountCents:6000}]},db);
    await change(owner,e.id,'submitted');await change(approver,e.id,'in_review');
    await assert.rejects(change({...owner,role:'manager'},e.id,'approved',{restrictionsReviewed:true}),/Another finance manager/);
    await assert.rejects(change(approver,e.id,'approved',{restrictionsReviewed:true}),/Attach/);
    await uploadDocument(owner,{expenseId:e.id,kind:'receipt'},{originalname:'receipt.txt',mimetype:'text/plain',buffer:Buffer.from('Synthetic receipt')},db);
   }
  });
  let paidId;
  await t.test('concurrent approvals cannot spend the same remaining allocation twice',async()=>{
   const results=await Promise.allSettled(expenses.map(id=>change(approver,id,'approved',{restrictionsReviewed:true})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/exceed/);
   paidId=expenses[results.findIndex(r=>r.status==='fulfilled')];
   await assert.rejects(amendAuthority(approver,'allocations',allocation.id,{amountCents:1000,previousAmountCents:9000,reason:'Unsafe reduction'},db),/cannot lose/);
   await change(approver,paidId,'scheduled');await change(approver,paidId,'paid',{paymentConfirmed:true,paymentReference:'ACH-TEST-1',paymentDate:'2026-03-15'});
   await assert.rejects(change(approver,paidId,'paid',{paymentConfirmed:true}),/not allowed/);
   const totals=(await workspace(scope,db)).totals;assert.equal(totals.paid,6000);assert.equal(totals.committed,0);assert.equal(totals.available,3000);
  });
  await t.test('bank evidence matches existing payments without counting spending again; changes require review',async()=>{
   const {encryptFamilyBilling}=await import('../../familyBillingEncryption.service.js');
   const [a]=await db.execute("INSERT INTO bank_feed_accounts (agency_id,external_id,stripe_customer_id,livemode,status,sync_enabled,purpose,details_encrypted,connected_by_user_id) VALUES (2,'fca_test_finance','cus_test',0,'active',1,'finance_operations',?,14)",[encryptFamilyBilling({institution:'Test Bank',name:'Test',last4:'0000'},'bank-account:2:fca_test_finance')]);
   const account={id:a.insertId,agency_id:2,external_id:'fca_test_finance',livemode:0};
   const value={id:'fctxn_finance_test',account:account.external_id,livemode:false,amount:-6000,currency:'usd',status:'posted',updated:100,transacted_at:100,description:'Synthetic bank evidence'};
   await storeFinanceBankEntry(db,account,value);await storeFinanceBankEntry(db,account,value);
   const [[entry]]=await db.execute('SELECT * FROM finance_bank_entries WHERE agency_id=2');
   const [[count]]=await db.execute('SELECT COUNT(*) n FROM finance_bank_entries WHERE agency_id=2');assert.equal(count.n,1);
   await reconcileBankExpense(scope,entry.id,{expenseId:paidId,confirmed:true},db);
   assert.equal((await workspace(scope,db)).totals.paid,6000);
   await storeFinanceBankEntry(db,account,{...value,status:'void',updated:101});await storeFinanceBankEntry(db,account,value);
   const bank=await financeBankOverview(scope,0,db);assert.equal(bank.entries[0].reviewStatus,'needs_review');assert.equal(bank.entries[0].status,'void');assert.equal((await row(paidId)).status,'paid');
   await assert.rejects(reconcileBankExpense(scope,entry.id,{expenseId:paidId,confirmed:true},db),/posted debit/);
   process.env.BANK_FEEDS_ENABLED='true';
   await assert.rejects(syncBankFeed(2,account.id,{db,stripe:{},purpose:'payer_deposit'}),/not found/);
   assert.equal((await bankFeedOverview(2)).accounts.length,0);
   assert.equal((await financeOrganizations({id:13,role:'provider'},db)).length,0);
  });
 }finally{await db.end();await clinical.end();}
});
