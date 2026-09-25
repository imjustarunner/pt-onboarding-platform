import test from 'node:test';import assert from 'node:assert/strict';
test('service fee prices are immutable, tenant scoped and attached to one invoice',{skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'},async t=>{
 for(const [key,value] of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:'33316',DB_NAME:'family_billing_test'}))assert.equal(process.env[key],value);
 const {default:pool}=await import('../../config/database.js');const {quoteAgencyCardFee,reserveMedicalServiceUsage,completeMedicalServiceUsage,medicalServiceInvoiceLines,attachMedicalServiceInvoice}=await import('../medicalServiceFees.service.js');
 const env={MEDICAL_SERVICE_FEES_ENABLED:'true'},deps={db:pool,env},payment={agencyId:1,connectedAccountId:'acct_synthetic',amountCents:2500,currency:'usd',idempotencyKey:'concurrent-fee'};
 try{
  await pool.execute('CREATE TABLE agency_billing_accounts (agency_id INT PRIMARY KEY,stripe_connect_account_id VARCHAR(128))');await pool.execute("INSERT INTO agency_billing_accounts VALUES(1,'acct_synthetic'),(2,'acct_other')");
  await pool.execute("INSERT INTO medical_service_fee_agreements (agency_id,revision,enabled,claim_unit_cents,eligibility_unit_cents,card_fee_bps,contract_reference,created_by_user_id) VALUES (1,1,1,30,10,100,'Synthetic accepted agreement',9)");
  await t.test('concurrent payment attempts reuse one pinned fee',async()=>{const values=await Promise.all([quoteAgencyCardFee(payment,deps),quoteAgencyCardFee(payment,deps)]);assert.equal(values[0].quoteId,values[1].quoteId);assert.equal(values[0].feeCents,25);await assert.rejects(quoteAgencyCardFee({...payment,agencyId:2},deps),/does not belong/);});
  const [first]=await Promise.all([reserveMedicalServiceUsage({agencyId:1,kind:'claim',sourceId:800},deps),reserveMedicalServiceUsage({agencyId:1,kind:'claim',sourceId:800},deps)]);
  await t.test('usage and card retries keep their price after a new agreement',async()=>{
   await pool.execute("INSERT INTO medical_service_fee_agreements (agency_id,revision,enabled,claim_unit_cents,eligibility_unit_cents,card_fee_bps,contract_reference,created_by_user_id) VALUES (1,2,1,60,20,200,'Synthetic revised agreement',9)");
   assert.equal(await reserveMedicalServiceUsage({agencyId:1,kind:'claim',sourceId:800},deps),first);assert.equal((await quoteAgencyCardFee(payment,deps)).feeCents,25);
   const [[usage]]=await pool.execute('SELECT unit_cents FROM medical_service_usage WHERE id=?',[first]);assert.equal(usage.unit_cents,30);
  });
  const second=await reserveMedicalServiceUsage({agencyId:1,kind:'eligibility',sourceId:900},deps);
  await completeMedicalServiceUsage(first,1);await completeMedicalServiceUsage(first,1);await completeMedicalServiceUsage(second,1);
  await pool.execute("UPDATE medical_service_usage SET completed_at='2026-09-15 12:00:00' WHERE agency_id=1");
  await reserveMedicalServiceUsage({agencyId:1,kind:'claim',sourceId:801},deps); // unresolved, never invoiced
  await t.test('closed-month usage is included once and remains absent from other agencies',async()=>{
   assert.deepEqual(await medicalServiceInvoiceLines(2,new Date('2026-10-01'),deps),[]);
   const db=await pool.getConnection();try{await db.beginTransaction();const lines=await medicalServiceInvoiceLines(1,new Date('2026-10-01'),{...deps,db});assert.deepEqual(lines.map(l=>l.amountCents),[30,20]);await attachMedicalServiceInvoice(1,700,lines,db);await db.commit();await db.beginTransaction();await assert.rejects(attachMedicalServiceInvoice(1,701,lines,db),/already invoiced/);await db.rollback();}finally{db.release();}
   assert.deepEqual(await medicalServiceInvoiceLines(1,new Date('2026-10-01'),deps),[]);
   const [[pending]]=await pool.execute("SELECT COUNT(*) AS n FROM medical_service_usage WHERE status='pending' AND invoice_id IS NULL");assert.equal(pending.n,1);
  });
 }finally{await pool.end();}
});
