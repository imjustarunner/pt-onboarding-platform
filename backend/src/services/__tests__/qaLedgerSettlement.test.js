import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),intent:vi.fn(),receipt:vi.fn(),audit:vi.fn(),send:vi.fn(),reconcilePay:vi.fn(),receivable:vi.fn(),allocations:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyLedger/policy.js',()=>({transaction:fn=>fn({execute:mocks.execute}),allocationDue:row=>Number(row.amount_cents)-Number(row.paid_cents)}));
vi.mock('../familyLedger/receivables.js',()=>({findReceivable:mocks.receivable,allocationsFor:mocks.allocations,sourcePayload:()=>({responsibilityType:'self_pay'})}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:JSON.stringify,decryptFamilyBilling:raw=>JSON.parse(raw)}));
vi.mock('../familyBillingPayment.service.js',async()=>{const actual=await vi.importActual('../familyBillingPayment.service.js');return {verifyPaymentResult:actual.verifyPaymentResult};});
vi.mock('../qaPaymentSimulator.service.js',()=>({QA_PAYMENT_PROCESSOR:'QA_SIMULATOR',qaSimulationAccount:id=>`qa_simulator_${id}`,isQaSimulationAccount:id=>String(id).startsWith('qa_simulator_'),getQaPaymentIntent:mocks.intent,assertQaSimulationScope:vi.fn(),qaPaymentSimulationConfig:vi.fn(),qaCardMerchant:vi.fn()}));
vi.mock('../familyLedger/copayCredits.js',()=>({queueReceiptEvent:mocks.receipt}));
vi.mock('../familyLedger/receiptEmails.js',()=>({sendPendingReceiptEmails:mocks.send}));
vi.mock('../missedSessionFeePayroll.service.js',()=>({reconcileMissedFeePayroll:mocks.reconcilePay}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:mocks.audit}));
import {finalizePayment,reconcileLedgerPayment} from '../familyLedger/payments.js';
let payment,intent,allocation;
beforeEach(()=>{
 vi.clearAllMocks();
 allocation={id:4,amount_cents:5000,paid_cents:0};
 const snapshot={accountId:'qa_simulator_453',amountCents:5000,currency:'usd',customerId:'qa_customer_453_1759',brand:'QA SIMULATION',last4:'0000'};
 payment={id:7,agency_id:453,allocation_id:4,payer_user_id:1759,processor:'QA_SIMULATOR',amount_cents:5000,currency:'usd',processor_intent_id:'qa_pi_saved',snapshot_encrypted:JSON.stringify(snapshot),status:'pending'};
 intent={id:'qa_pi_saved',qa_simulated:true,status:'succeeded',payerUserId:1759,clientId:2545,sourceKind:'family_ledger',sourceId:'7',amount:5000,amount_received:5000,currency:'usd',customer:snapshot.customerId,metadata:{agency_id:'453',family_ledger_payment_id:'7'}};
 mocks.intent.mockImplementation(async()=>({...intent}));
 mocks.receivable.mockResolvedValue({id:3,agency_id:453,client_id:2545,service_domain:'tutoring',currency:'usd'});mocks.allocations.mockImplementation(async()=>[allocation]);
 mocks.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT * FROM family_ledger_payments'))return [[{...payment}]];
  if(sql.includes('SELECT a.receivable_id'))return [[{receivable_id:3,client_id:2545}]];
  if(sql.startsWith('SELECT name FROM agencies'))return [[{name:'NLU SYNTHETIC QA'}]];
  if(sql.startsWith('SELECT first_name'))return [[{first_name:'Morgan',last_name:'QA'}]];
  if(sql.startsWith('SELECT full_name'))return [[{full_name:'Parker QA',client_type:'learning'}]];
  if(sql.startsWith('SELECT SUM'))return [[{remaining:0}]];
  if(sql.startsWith("UPDATE family_ledger_payments SET status='succeeded'"))payment.status='succeeded';
  return [{affectedRows:1}];
 });
});
it('posts a simulated family payment once and snapshots a labeled receipt',async()=>{
 await finalizePayment(7,453,intent,'qa_simulator_453');
 await finalizePayment(7,453,intent,'qa_simulator_453');
 expect(mocks.receipt).toHaveBeenCalledOnce();expect(mocks.reconcilePay).toHaveBeenCalledOnce();
 const write=mocks.execute.mock.calls.find(([sql])=>sql.includes("SET status='succeeded',received_at="));
 expect(JSON.parse(write[1][2])).toMatchObject({simulated:true,processor:'QA_SIMULATOR',learningService:true,amountCents:5000,method:'QA SIMULATION ending in 0000'});
});
it.each([{status:'processing'},{payerUserId:1760},{clientId:2547},{sourceKind:'package'},{sourceId:'8'},{amount:5001},{amount_received:4000}])('rejects altered persisted confirmation %j before crediting a ledger',async patch=>{
 intent={...intent,...patch};await expect(finalizePayment(7,453,{id:intent.id,qa_simulated:true},'qa_simulator_453')).rejects.toHaveProperty('status',409);expect(mocks.receipt).not.toHaveBeenCalled();expect(mocks.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE family_receivable_allocations'))).toBe(false);
});
it('requires both the simulated processor and matching virtual merchant',async()=>{
 await expect(finalizePayment(7,453,intent,'acct_live')).rejects.toHaveProperty('status',409);
 payment.processor='STRIPE';await expect(finalizePayment(7,453,intent,'qa_simulator_453')).rejects.toHaveProperty('status',409);expect(mocks.receipt).not.toHaveBeenCalled();
});
it('does not let the external Stripe webhook claim a simulator settlement',async()=>{expect(await reconcileLedgerPayment(intent,'qa_simulator_453')).toBe(false);expect(mocks.execute).not.toHaveBeenCalled();});
