import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({db:vi.fn(),insurance:vi.fn(),agreement:vi.fn(),createBalance:vi.fn(),claims:[],money:{collected:0,refunded:0,received_at:'2026-11-10'},fee:null,created:0,packageId:null,history:[]}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db(...args)}}));
vi.mock('../../models/PayrollTimeClaim.model.js',()=>({default:{
  create:async input=>{const row={id:++m.created,agency_id:input.agencyId,user_id:input.userId,status:'submitted',payload_json:JSON.stringify(input.payload),claim_type:input.claimType};m.claims.push(row);return row;},
  findById:async id=>m.claims.find(c=>c.id===id)
}}));
vi.mock('../employmentAgreementPolicy.service.js',()=>({effectiveCompensationAgreement:(...args)=>m.agreement(...args)}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:(...args)=>m.insurance(...args)}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),positiveId:v=>{if(!Number.isInteger(Number(v))||Number(v)<=0)throw new Error('bad id');return Number(v);},auditBilling:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({dateOnly:v=>String(v).slice(0,10),today:()=> '2026-10-29',cents:v=>v,transaction:fn=>fn({execute:(...args)=>m.db(...args)})}));
vi.mock('../familyLedger/receivables.js',()=>({createReceivable:(...args)=>m.createBalance(...args),sourcePayload:r=>r.payload||{},findReceivable:async(a,id)=>({agency_id:a,id,client_id:12,source_type:'missed_session_fee'})}));
import { reconcileMissedFeePayroll, approveMissedFeeClaim, saveMissedFeePolicy, createMissedSessionFee } from '../missedSessionFeePayroll.service.js';
const balance={id:90,agency_id:2,source_type:'missed_session_fee'};
beforeEach(()=>{
 m.claims=[];m.created=0;m.money={collected:0,refunded:0,received_at:'2026-11-10'};
 m.fee={id:1,agency_id:2,provider_user_id:45,receivable_id:90,appointment_id:70,event_date:'2026-11-10',category_snapshot:3,share_basis_points:4000,policy_version:'missed-fee-share-v1',created_by_user_id:99};
 m.packageId=null;m.history=[];m.insurance.mockReset().mockResolvedValue({});m.agreement.mockReset().mockResolvedValue({id:22,data:{schedule:{category:3}},effectiveOn:'2026-11-01'});m.createBalance.mockReset().mockResolvedValue({id:90,status:'review'});
 m.db.mockReset();m.db.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM payroll_missed_session_fees'))return [[m.fee].filter(f=>f.agency_id===Number(args[0])&&f.receivable_id===Number(args[1]))];
  if(sql.startsWith('SELECT COALESCE(SUM(p.amount_cents)'))return [[m.money]];
  if(sql.includes('FROM payroll_missed_fee_claims f JOIN payroll_time_claims'))return [m.claims.filter(c=>c.agency_id===Number(args[1])&&c.user_id===Number(args[2]))];
  if(sql.startsWith('INSERT INTO payroll_missed_fee_claims'))return [{insertId:m.created}];
  if(sql.startsWith('UPDATE payroll_time_claims SET status=?')){const claim=m.claims.find(c=>c.id===args[3]&&c.agency_id===args[4]);Object.assign(claim,{status:args[0],payload_json:args[1],claim_date:args[2]});return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE payroll_missed_session_fees')){Object.assign(m.fee,{net_collected_cents:args[0],entitlement_cents:args[1],review_reason:args[2]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT f.receivable_id'))return [args[1]===2&&m.claims.some(c=>c.id===args[0])?[{receivable_id:90}]:[]];
  if(sql.startsWith('SELECT * FROM payroll_time_claims'))return [[m.claims.find(c=>c.id===args[0]&&c.agency_id===args[1])].filter(Boolean)];
  if(sql.startsWith('SELECT * FROM payroll_periods'))return [args[0]===77&&args[1]===2?[{id:77,status:'draft'}]:[]];
  if(sql.startsWith("UPDATE payroll_time_claims SET status='approved'")){Object.assign(m.claims.find(c=>c.id===args[3]),{status:'approved',target_payroll_period_id:args[0],applied_amount:args[1]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM payroll_missed_fee_policies'))return [[]];
  if(sql.startsWith('SELECT a.*'))return [args[0]===70&&args[1]===2&&args[2]===12?[{id:70,agency_id:2,provider_user_id:45,start_at:'2026-11-10 20:00:00',source_timezone:'America/Denver',status:'no_show',fee_package_entitlement_id:m.packageId,business_type:'tutoring'}]:[]];
  if(sql.startsWith('SELECT enabled,effective_on'))return [[{enabled:1,effectiveOn:'2026-11-01',policyVersion:'missed-fee-share-v1'}]];
  if(sql.startsWith('SELECT user_id FROM user_agencies'))return [[{user_id:45}]];
  if(sql.startsWith('SELECT id,payment_status FROM booking_package_entitlements'))return [args[0]===50&&args[1]===2&&args[2]===12?[{id:50,payment_status:'PAID'}]:[]];
  if(sql.startsWith('SELECT id,direction,reason_code FROM booking_package_ledger'))return [m.history];
  throw new Error(`Unhandled SQL ${sql}`);
 });
});
describe('collected fee to reviewed payroll projection',()=>{
 it('does not create pay for unpaid fees; duplicate payment callbacks update one claim',async()=>{
  await reconcileMissedFeePayroll(balance);expect(m.claims).toHaveLength(0);
  m.money.collected=8000;await reconcileMissedFeePayroll(balance);await reconcileMissedFeePayroll(balance);
  expect(m.claims).toHaveLength(1);expect(JSON.parse(m.claims[0].payload_json)).toMatchObject({amount:32,totalMinutes:0,category:3});
 });
 it('updates only the remaining increment after partial collections and payroll approval',async()=>{
  m.money.collected=4000;await reconcileMissedFeePayroll(balance);
  await approveMissedFeeClaim({agencyId:2,claimId:1,targetPayrollPeriodId:77,actorUserId:99,expectedAmount:16});
  m.money.collected=8000;await reconcileMissedFeePayroll(balance);await reconcileMissedFeePayroll(balance);
  expect(m.claims).toHaveLength(2);expect(m.claims[0].applied_amount).toBe(16);expect(JSON.parse(m.claims[1].payload_json).amount).toBe(16);
 });
 it('withdraws an unapproved fully refunded draft and never deducts already approved wages',async()=>{
  m.money.collected=8000;await reconcileMissedFeePayroll(balance);m.money.refunded=8000;await reconcileMissedFeePayroll(balance);
  expect(m.claims[0].status).toBe('withdrawn');expect(JSON.parse(m.claims[0].payload_json).amount).toBe(0);
  m.money.refunded=0;await reconcileMissedFeePayroll(balance);await approveMissedFeeClaim({agencyId:2,claimId:1,targetPayrollPeriodId:77,actorUserId:99,expectedAmount:32});
  m.money.refunded=8000;await reconcileMissedFeePayroll(balance);
  expect(m.claims[0].applied_amount).toBe(32);expect(m.claims).toHaveLength(1);expect(m.fee.review_reason).toContain('no automatic wage deduction');
 });
 it('rejects stale collection totals, another tenant, another tenant period and backdated activation',async()=>{
  m.money.collected=8000;await reconcileMissedFeePayroll(balance);m.money.refunded=1000;
  await expect(approveMissedFeeClaim({agencyId:2,claimId:1,targetPayrollPeriodId:77,actorUserId:99,expectedAmount:32})).rejects.toThrow('Collections changed');
  await expect(approveMissedFeeClaim({agencyId:6,claimId:1,targetPayrollPeriodId:77,actorUserId:99,expectedAmount:28})).rejects.toThrow('not found');
  await expect(approveMissedFeeClaim({agencyId:2,claimId:1,targetPayrollPeriodId:88,actorUserId:99,expectedAmount:28})).rejects.toThrow('editable payroll');
  await expect(saveMissedFeePolicy({agencyId:2,enabled:true,effectiveOn:'2026-10-01',actorUserId:99})).rejects.toThrow('future effective date');
 });
 it.each(['paid','approved'])('never edits %s compensation when refunded or when additional money arrives',async status=>{
  m.money.collected=4000;await reconcileMissedFeePayroll(balance);
  Object.assign(m.claims[0],{status,applied_amount:16,target_payroll_period_id:77});const snapshot=JSON.stringify(m.claims[0]);
  m.money.refunded=4000;await reconcileMissedFeePayroll(balance);expect(JSON.stringify(m.claims[0])).toBe(snapshot);expect(m.fee.review_reason).toContain('Refund after payroll approval');
  m.money.collected=12000;await reconcileMissedFeePayroll(balance);expect(JSON.stringify(m.claims[0])).toBe(snapshot);expect(m.claims).toHaveLength(2);expect(JSON.parse(m.claims[1].payload_json).amount).toBe(16);
 });
 it('protects a period-locked claim even if its lifecycle status is unexpected',async()=>{
  m.money.collected=4000;await reconcileMissedFeePayroll(balance);Object.assign(m.claims[0],{status:'deferred',period_status:'posted',applied_amount:16,target_payroll_period_id:77});const snapshot=JSON.stringify(m.claims[0]);
  m.money.refunded=4000;await reconcileMissedFeePayroll(balance);expect(JSON.stringify(m.claims[0])).toBe(snapshot);expect(m.claims).toHaveLength(1);expect(m.fee.review_reason).toContain('no automatic wage deduction');
 });
 it('does not touch ordinary service collections or provider assignments',async()=>{
  expect(await reconcileMissedFeePayroll({...balance,source_type:'clinical_copay'})).toBeNull();expect(m.db).not.toHaveBeenCalled();
 });
 it('requires and preserves explicit signed package fee review while never changing credits or collecting money',async()=>{
  m.packageId=50;const input={agencyId:2,appointmentId:70,clientId:12,amountCents:2000,agreementConfirmed:true,agreementReference:'Signed package amendment #100',actorUserId:99};
  await expect(createMissedSessionFee(input)).rejects.toThrow('Review the signed package agreement');expect(m.createBalance).not.toHaveBeenCalled();
  const packageFeeReview={entitlementId:50,agreementReference:input.agreementReference,signedOn:'2026-10-29',effectiveOn:'2026-11-01',permittedFeeCents:2000,separateFeePermitted:true,existingExemptionResolved:true,makeupCreditRetained:true};
  await createMissedSessionFee({...input,packageFeeReview});expect(m.createBalance).toHaveBeenCalledWith(expect.objectContaining({amountCents:2000,reviewRequired:true,payload:expect.objectContaining({creditsAreNotCollections:true,packageFeeReview:expect.objectContaining({reviewedByUserId:99,entitlementId:50,makeupCreditRetained:true})})}),expect.anything());
  expect(m.db.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE).*booking_package/.test(sql))).toBe(false);
  m.insurance.mockResolvedValue({primaryIsMedicaid:true});await expect(createMissedSessionFee({...input,packageFeeReview})).rejects.toThrow('Medicaid');
  await expect(createMissedSessionFee({...input,agencyId:6,packageFeeReview})).rejects.toThrow('assigned appointment');
 });
});
