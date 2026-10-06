import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs/promises';
import {splitSqlStatements} from '../../../utils/migrationSql.js';
const stripe=vi.hoisted(()=>({checkout:vi.fn(),retrieve:vi.fn(),merchant:vi.fn(),send:vi.fn()}));
vi.mock('../../stripePayments.service.js',()=>({default:{createDonationCheckout:stripe.checkout,retrieveDonationPaymentIntent:stripe.retrieve,retrieveConnectAccount:stripe.merchant}}));
vi.mock('../../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:stripe.send}));
const enabled=process.env.DONATIONS_MYSQL_TEST==='1';
describe.skipIf(!enabled)('donation accounting on isolated MySQL',()=>{
 let db,service,policy,scope,input,paid;
 beforeAll(async()=>{
  expect(process.env.DB_NAME).toBe('mh4kidz_donations_test');expect(process.env.DB_HOST).toBe('127.0.0.1');expect(process.env.DB_PORT).toBe('33319');
  process.env.STRIPE_SECRET_KEY='sk_live_synthetic_test_only';process.env.STRIPE_CONNECT_WEBHOOK_SECRET='whsec_synthetic';
  db=(await import('../../../config/database.js')).default;
  service=await import('../donations.js');policy=await import('../donationPolicy.js');
  await db.query('CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(200),slug VARCHAR(200),is_active INT DEFAULT 1)');
  await db.query('CREATE TABLE email_sender_identities (id INT PRIMARY KEY,agency_id INT,is_active INT,display_name VARCHAR(100),from_email VARCHAR(200))');
  await db.query('CREATE TABLE agency_billing_accounts (agency_id INT PRIMARY KEY,stripe_connect_account_id VARCHAR(100),stripe_connect_status VARCHAR(30))');
  for(const file of ['1490_bank_transaction_feeds.sql','1495_finance_operations.sql','1545_mh4kidz_donations.sql']){
   const sql=await fs.readFile(new URL(`../../../../../database/migrations/${file}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(sql))await db.query(statement);
  }
  await db.query("INSERT INTO agencies VALUES (434,'MH4Kidz','mh4kidz',1),(2,'Other','other',1)");
  await db.query('INSERT INTO finance_organizations (agency_id,enabled) VALUES (434,1),(2,1)');
  await db.query("INSERT INTO finance_funds (id,agency_id,name,kind) VALUES (1,434,'General donations','unrestricted'),(2,2,'Other fund','unrestricted')");
  await db.query("INSERT INTO email_sender_identities VALUES (1,434,1,'MH4Kidz','donations@example.invalid'),(2,2,1,'Other','other@example.invalid')");
  await db.query("INSERT INTO agency_billing_accounts VALUES (434,'acct_mh4kidz','active')");
  await db.query('INSERT INTO finance_donation_settings (agency_id) VALUES (434)');
  scope={agencyId:434,userId:5,role:'manager'};
  input={amountCents:5000,name:'Synthetic Donor',email:'donor@example.invalid',city:'Denver',region:'CO',publicRecognition:true,recognitionVersion:policy.recognitionVersion,requestKey:'b2880a96-a0cd-4cdb-b3e2-de0362d1a880',receiptToken:'a'.repeat(64)};
  stripe.merchant.mockResolvedValue({charges_enabled:true,payouts_enabled:true});
  stripe.checkout.mockResolvedValue({id:'cs_gift',url:'https://checkout.stripe.com/test-only',livemode:true});
  stripe.send.mockResolvedValue({id:'gmail-synthetic',communicationId:100});
 });
 afterAll(async()=>{if(db)await db.end();});
 it('requires complete setup, manager access and tenant-owned fund and sender',async()=>{
  await expect(service.createDonationCheckout(input,db)).rejects.toThrow('not open');
  await expect(service.donationSettings({...scope,role:'viewer'},db)).rejects.toThrow('manager');
  const settings={revision:1,legalName:'MH4Kidz',ein:'00-0000000',enabled:true,taxExemptConfirmed:true,noBenefitsConfirmed:true,fundId:1,senderIdentityId:1};
  await expect(service.saveDonationSettings(scope,{...settings,fundId:2},db)).rejects.toThrow('another organization');
  await expect(service.saveDonationSettings(scope,{...settings,senderIdentityId:2},db)).rejects.toThrow('sender');
  await expect(service.saveDonationSettings(scope,{...settings,ein:''},db)).rejects.toThrow('Complete');
  await service.saveDonationSettings(scope,settings,db);
  expect((await service.publicDonations(db)).acceptingDonations).toBe(true);
 });
 it('deduplicates concurrent checkout retries and stores only a hash of the receipt token',async()=>{
  await Promise.all([service.createDonationCheckout(input,db),service.createDonationCheckout(input,db)]);
  const [rows]=await db.query('SELECT * FROM finance_donations');expect(rows).toHaveLength(1);expect(rows[0].receipt_token_hash).not.toBe(input.receiptToken);
  expect(stripe.checkout.mock.calls[0][0].connectedAccountId).toBe('acct_mh4kidz');expect(stripe.checkout.mock.calls[0][0].idempotencyKey).toBe(stripe.checkout.mock.calls[1][0].idempotencyKey);
  await expect(service.createDonationCheckout({...input,amountCents:6000},db)).rejects.toThrow('different details');
  expect((await service.donorReceipt(input.receiptToken,db)).status).toBe('processing');
  paid={id:'pi_gift',created:1791223200,status:'succeeded',amount:5000,amount_received:5000,currency:'usd',livemode:true,metadata:{source:'mh4kidz_donation',agency_id:'434',donation_id:String(rows[0].id)}};
 });
 it('rejects wrong merchant and amount then records a confirmed payment and receipt once under replay',async()=>{
  await expect(service.reconcileDonationPayment(paid,'acct_other',db)).rejects.toThrow('match');
  await expect(service.reconcileDonationPayment({...paid,amount_received:1},'acct_mh4kidz',db)).rejects.toThrow('match');
  await Promise.all([service.reconcileDonationPayment(paid,'acct_mh4kidz',db),service.reconcileDonationPayment(paid,'acct_mh4kidz',db)]);
  expect((await db.query('SELECT * FROM finance_receipts'))[0]).toHaveLength(1);expect(stripe.send).toHaveBeenCalledTimes(1);
  expect(stripe.send.mock.calls[0][0].to).toBe('donor@example.invalid');
  expect((await service.publicDonations(db)).donors).toEqual([{name:'Synthetic Donor',city:'Denver',region:'CO',amountCents:5000}]);
  expect((await service.donorReceipt(input.receiptToken,db)).receipt.text).toContain('$50.00');
  await expect(service.donorReceipt('b'.repeat(64),db)).rejects.toThrow('not found');
 });
 it('keeps accounting and adjusted acknowledgments accurate when paused and refunds replay',async()=>{
  await db.query('UPDATE finance_organizations SET enabled=0 WHERE agency_id=434');
  stripe.retrieve.mockResolvedValue(paid);
  const refund={id:'re_partial',payment_intent:paid.id,status:'succeeded',amount:1000,currency:'usd',created:1791223600};
  await Promise.all([service.reconcileDonationRefund(refund,'acct_mh4kidz',db),service.reconcileDonationRefund(refund,'acct_mh4kidz',db)]);
  expect((await db.query('SELECT SUM(amount_cents) total FROM finance_receipts'))[0][0].total).toBe('4000');
  expect(stripe.send).toHaveBeenCalledTimes(2);expect((await service.publicDonations(db)).donors[0].amountCents).toBe(4000);
  await service.reconcileDonationPayment(paid,'acct_mh4kidz',db);expect(stripe.send).toHaveBeenCalledTimes(2);
  expect((await service.donorReceipt(input.receiptToken,db)).receipt.text).toContain('Contribution remaining: $40.00');
 });
 it('removes donor details after a token-authorized anonymous request and checks manager scope',async()=>{
  await service.makeDonationAnonymous(input.receiptToken,db);expect((await service.publicDonations(db)).donors).toEqual([]);
  expect((await service.donationRecords(scope,db)).donations[0].donor_email).toBe('donor@example.invalid');
  expect((await service.donationRecords({...scope,agencyId:2},db)).donations).toEqual([]);
  await expect(service.retryDonationReceipt({...scope,agencyId:2},Number(paid.metadata.donation_id),db)).rejects.toThrow('another organization');
 });
 it('tracks held receipts as needing review and fully refunded gifts contribute zero',async()=>{
  stripe.send.mockResolvedValueOnce({id:'held',pendingApproval:true,communicationId:101});
  await service.reconcileDonationRefund({id:'re_remaining',payment_intent:paid.id,status:'succeeded',amount:4000,currency:'usd',created:1791223900},'acct_mh4kidz',db);
  const result=await service.donationRecords(scope,db);expect(result.donations[0].status).toBe('refunded');expect(result.donations[0].receipt_status).toBe('needs_review');
  expect((await db.query('SELECT SUM(amount_cents) total FROM finance_receipts'))[0][0].total).toBe('0');
  const before=stripe.send.mock.calls.length;await service.reconcileDonationPayment(paid,'acct_mh4kidz',db);expect(stripe.send).toHaveBeenCalledTimes(before);
  await service.retryDonationReceipt(scope,Number(paid.metadata.donation_id),db);expect((await service.donationRecords(scope,db)).donations[0].receipt_status).toBe('sent');
  const csv=await service.donationExport(scope,db);expect(csv).toContain('Synthetic Donor');expect(csv).toContain('"50","50","0","refunded"');
  await expect(service.donationExport({...scope,role:'viewer'},db)).rejects.toThrow('manager');
 });
 it('handles a refund arriving before the payment webhook without issuing an unadjusted receipt',async()=>{
  await db.query('UPDATE finance_organizations SET enabled=1 WHERE agency_id=434');
  const next={...input,requestKey:'a2880a96-a0cd-4cdb-b3e2-de0362d1a880',receiptToken:'c'.repeat(64),publicRecognition:false,city:'',region:''};
  await service.createDonationCheckout(next,db);
  const [[row]]=await db.execute('SELECT id FROM finance_donations WHERE request_key=?',[next.requestKey]);
  const payment={...paid,id:'pi_second',metadata:{...paid.metadata,donation_id:String(row.id)},latest_charge:{created:1791223800}};
  stripe.retrieve.mockResolvedValue(payment);
  const before=stripe.send.mock.calls.length;
  await service.reconcileDonationRefund({id:'re_early',payment_intent:payment.id,status:'succeeded',amount:1000,currency:'usd',created:1791223900},'acct_mh4kidz',db);
  await service.reconcileDonationPayment(payment,'acct_mh4kidz',db);
  expect(stripe.send).toHaveBeenCalledTimes(before+1);expect(stripe.send.mock.calls.at(-1)[0].text).toContain('Contribution remaining: $40.00');
  expect((await service.publicDonations(db)).donors).toEqual([]);
 });
});
