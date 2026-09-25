import test from 'node:test';import assert from 'node:assert/strict';
test('EFT identity uniqueness, concurrent review, encrypted history and tenant isolation',{skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'},async()=>{
 for(const [key,value] of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:'33316',DB_NAME:'family_billing_test',DB_USER:'family_billing_test'}))assert.equal(process.env[key],value);
 const {default:pool}=await import('../../config/database.js');const {default:clinical}=await import('../../config/clinicalDatabase.js');const {savePayerEft,listPayerEft,payerEftHistory}=await import('../payerEft.service.js');
 let tax='123456789';const deps={db:pool,offices:async()=>[{id:8},{id:9}],profile:async(agencyId,officeId)=>({officeId,billingNpi:'1306688650',practice:{tax_id:tax}})};
 const request={agencyId:1,officeId:8,actorUserId:99,payerId:'COCHA',payerName:'Synthetic CCHA',revision:0,status:'active_reported',source:'staff_report',reference:'Synthetic existing deposits reported',evidenceDate:'2026-09-25',attested:true};
 try{
  const results=await Promise.allSettled([savePayerEft(request,deps),savePayerEft({...request,officeId:9},deps)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  let list=await listPayerEft(1,deps);assert.equal(list.items.length,1);assert.equal(list.items[0].identityCurrent,true);const id=list.items[0].id;
  await assert.rejects(savePayerEft({...request,revision:1,status:'active_verified',source:'payer_portal',depositMatched:true},deps),e=>e.status===409);
  await savePayerEft({...request,revision:1,status:'active_verified',source:'bank_deposit',depositMatched:true,reference:'Synthetic trace matched to deposit'},deps);
  const history=await payerEftHistory(1,id);assert.deepEqual(history.map(e=>e.revision),[2,1]);assert.equal(history[1].status,'active_reported');assert.equal(history[0].evidence.depositMatched,true);
  const [[stored]]=await pool.execute('SELECT evidence_encrypted FROM payer_eft_enrollments WHERE id=?',[id]);assert.ok(!stored.evidence_encrypted.includes('Synthetic trace'));
  assert.equal((await payerEftHistory(2,id)).length,0);assert.equal((await listPayerEft(2,deps)).items.length,0);
  tax='987654321';list=await listPayerEft(1,deps);assert.equal(list.items[0].identityCurrent,false);
  await savePayerEft({...request,status:'pending',source:'payer_portal',reference:'New legal identity enrollment confirmation'},deps);assert.equal((await listPayerEft(1,deps)).items.length,2);
  assert.equal((await payerEftHistory(1,id)).length,2); // Old evidence remains intact.
 }finally{await pool.end();await clinical.end();}
});
