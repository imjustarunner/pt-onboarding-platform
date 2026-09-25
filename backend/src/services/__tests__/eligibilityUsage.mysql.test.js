import test from 'node:test';
import assert from 'node:assert/strict';
test('eligibility reservations serialize shared budgets and never retry an uncertain request',{skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'},async t=>{
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
 const {default:pool}=await import('../../config/database.js');const {default:clinical}=await import('../../config/clinicalDatabase.js');
 const {reserveEligibilityUsage}=await import('../eligibilityUsage.service.js');
 const now=new Date('2026-09-25T12:00:00Z'),env={CLAIM_MD_ELIGIBILITY_ACCOUNT_LIMITS_JSON:'{"account:synthetic":1,"account:other":10}'};
 const base={connectionId:'account:synthetic',agencyId:1,clientId:101,source:'automatic',actorUserId:9};
 const reserve=(patch,extra={})=>reserveEligibilityUsage({...base,...patch},{now,env,...extra});
 try {
  await pool.execute("INSERT INTO agency_eligibility_automation (agency_id,enabled,cadence,monthly_limit,reviewer_user_id,readiness_reference) VALUES (1,1,'monthly',10,9,'Synthetic confirmation'),(2,1,'monthly',10,9,'Synthetic confirmation')");
  await t.test('two agencies sharing one remaining account check cannot both spend it',async()=>{
   const results=await Promise.allSettled([reserve({requestKey:'parallel-one'}),reserve({agencyId:2,clientId:201,requestKey:'parallel-two'})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/shared Claim.MD/);
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM claimmd_eligibility_usage');assert.equal(count.n,1);
  });
  await t.test('an unknown result consumes budget and its key is never reused',async()=>{
   await pool.execute("UPDATE claimmd_eligibility_usage SET status='unknown'");
   const [[row]]=await pool.execute('SELECT * FROM claimmd_eligibility_usage LIMIT 1');
   await assert.rejects(reserve({agencyId:row.agency_id,clientId:row.client_id,requestKey:row.request_key}),/already recorded/);
   await assert.rejects(reserve({requestKey:'another-attempt'}),/shared Claim.MD/);
  });
  await t.test('local not-sent failures release budget but remain in request history',async()=>{
   await pool.execute("UPDATE claimmd_eligibility_usage SET status='not_sent'");
   const id=await reserve({requestKey:'after-local-failure'});assert.ok(id>0);
  });
  await t.test('an agency limit includes manual checks on other connections',async()=>{
   await pool.execute('UPDATE agency_eligibility_automation SET monthly_limit=1 WHERE agency_id=1');
   await assert.rejects(reserve({connectionId:'account:other',source:'manual',requestKey:'switch-account'}),/agency monthly/);
  });
  await t.test('pause and missing shared limit stop automatic reservations',async()=>{
   await pool.execute('UPDATE agency_eligibility_automation SET enabled=0 WHERE agency_id=2');
   await assert.rejects(reserve({agencyId:2,clientId:201,connectionId:'account:other',requestKey:'paused-agency'}),/paused/);
   await assert.rejects(reserve({connectionId:'account:unconfigured',requestKey:'missing-limit'}),/not configured/);
  });
  await t.test('monthly budgets reset without removing earlier evidence',async()=>{
   const id=await reserve({requestKey:'new-month'},{now:new Date('2026-10-01T12:00:00Z')});assert.ok(id>0);
   const [rows]=await pool.execute('SELECT DISTINCT usage_month FROM claimmd_eligibility_usage ORDER BY usage_month');assert.deepEqual(rows.map(r=>r.usage_month),['2026-09','2026-10']);
  });
 }finally{await pool.end();await clinical.end();}
});
