import {beforeEach,describe,expect,it,vi} from 'vitest';
const billing=vi.hoisted(()=>({requireBillingLink:vi.fn(),recordBillingConsent:vi.fn(),auditBilling:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../familyBillingPolicy.service.js',()=>({...billing,billingError:(status,message)=>Object.assign(new Error(message),{status})}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:JSON.stringify,decryptFamilyBilling:JSON.parse}));
import {qaPaymentSimulationConfig,assertQaSimulationScope,validateQaCardInput,createQaPaymentIntent,confirmQaPaymentIntent,qaCardMerchant,qaSimulationGateway,createQaTestCard,assertQaPackageRefundReady} from '../qaPaymentSimulator.service.js';

const agency=()=>({id:453,slug:'nlu-qa-demo',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',simulatedPaymentsEnabled:true}}});
const user=()=>({id:1759,role:'client_guardian',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE'});
const saved=()=>({id:'qa_pi_saved',agency_id:453,payer_user_id:1759,client_id:2545,source_kind:'package',source_id:'800',amount_cents:18000,currency:'usd',status:'requires_confirmation',metadata_json:{packageId:76}});
function database({org=agency(),payer=user(),client={id:2545,is_demo:1},intent=saved()}={}){
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),getConnection:vi.fn()};
 db.getConnection.mockResolvedValue(db);
 db.execute=vi.fn(async(sql,args)=>{
  if(sql.includes('FROM agencies'))return [[org].filter(Boolean)];
  if(sql.includes('FROM users'))return [[payer].filter(Boolean)];
  if(sql.includes('FROM clients'))return [[client].filter(Boolean)];
  if(sql.startsWith('SELECT * FROM qa_payment_simulations'))return [[intent].filter(row=>row&&(!sql.includes('payer_user_id=?')||row.payer_user_id===args[2]))];
  return [{affectedRows:1,insertId:90}];
 });return db;
}
beforeEach(()=>vi.clearAllMocks());
describe('strict QA payment scope',()=>{
 it.each([6,451,452,1,999,null])('does not read or enable ordinary organization %s',async id=>{const db=database();expect(await qaPaymentSimulationConfig(id,db)).toEqual({enabled:false});expect(db.execute).not.toHaveBeenCalled();});
 it.each(['wrong slug','missing synthetic marker','wrong program','inactive','archived','disabled','string flag'])('rejects %s',async reason=>{
  const org=agency();
  if(reason==='wrong slug')org.slug='nlu';
  if(reason==='missing synthetic marker')org.feature_flags.qaSandbox.syntheticOnly=false;
  if(reason==='wrong program')org.feature_flags.qaSandbox.program='counseling';
  if(reason==='inactive')org.is_active=0;
  if(reason==='archived')org.is_archived=1;
  if(reason==='disabled')org.feature_flags.qaSandbox.simulatedPaymentsEnabled=false;
  if(reason==='string flag')org.feature_flags.qaSandbox.simulatedPaymentsEnabled='true';
  expect((await qaPaymentSimulationConfig(453,database({org}))).enabled).toBe(false);
 });
 it.each([450,453,454])('requires exact markers even for reserved scope %s',async id=>{const org=agency();org.id=id;org.slug={450:'auricwell-qa-demo',453:'nlu-qa-demo',454:'nlu-qa-learning'}[id];expect((await qaPaymentSimulationConfig(id,database({org}))).enabled).toBe(true);});
 it.each([{is_demo:0},{is_active:0},{is_archived:1},{role:'admin'},{role:'provider'},{status:'TERMINATED'}])('rejects ineligible actor %j',async patch=>{await expect(assertQaSimulationScope({agencyId:453,userId:1759,clientId:2545},database({payer:{...user(),...patch}}))).rejects.toHaveProperty('status',403);});
 it('requires a synthetic client and current normal financial access',async()=>{
  await expect(assertQaSimulationScope({agencyId:453,userId:1759,clientId:2545},database({client:{id:2545,is_demo:0}}))).rejects.toHaveProperty('status',403);
  billing.requireBillingLink.mockRejectedValueOnce(Object.assign(new Error('Revoked'),{status:403}));
  await expect(assertQaSimulationScope({agencyId:453,userId:1759,clientId:2545},database())).rejects.toThrow('Revoked');
  expect(billing.requireBillingLink).toHaveBeenCalledWith(1759,2545,453,expect.anything());
 });
 it.each(['4242424242424242','0000','00000000000000000','000000000000000a',''])('rejects non-sentinel card input',value=>{expect(()=>validateQaCardInput(value)).toThrow('sixteen zeros');});
 it('accepts the labeled zero sentinel with or without spaces',()=>{expect(()=>validateQaCardInput('0000 0000 0000 0000')).not.toThrow();});
 it('never trusts a fake account on an ordinary card or a foreign QA card',async()=>{
  await expect(qaCardMerchant({payment_provider:'STRIPE',connected_account_id:'qa_simulator_453'},{agencyId:453,userId:1759},database())).rejects.toHaveProperty('status',409);
  await expect(qaCardMerchant({payment_provider:'QA_SIMULATOR',connected_account_id:'qa_simulator_450'},{agencyId:453,userId:1759},database())).rejects.toHaveProperty('status',409);
 });
});
describe('persistent payment identity and outcomes',()=>{
 it.each([null,{status:'ACTIVE',sessions_remaining:0,sessions_reserved:0},{status:'CANCELLED',sessions_remaining:2,sessions_reserved:0},{status:'CANCELLED',sessions_remaining:0,sessions_reserved:1}])('does not refund a package with an unreconciled entitlement %j',entitlement=>{expect(()=>assertQaPackageRefundReady(entitlement)).toThrow('Reconcile and cancel');});
 it('allows normal refund review after package cancellation has reconciled every unused/reserved visit',()=>{expect(()=>assertQaPackageRefundReady({status:'CANCELLED',sessions_remaining:0,sessions_reserved:0})).not.toThrow();});
 const input={agencyId:453,userId:1759,clientId:2545,sourceKind:'package',sourceId:800,amountCents:18000,idempotencyKey:'package:800'};
 it('reuses the saved request without storing any card number',async()=>{
  const db=database();expect(await createQaPaymentIntent(input,db)).toMatchObject({id:'qa_pi_saved',amount:18000,qa_simulated:true,livemode:false});
  expect(JSON.stringify(db.execute.mock.calls)).not.toContain('0000000000000000');
 });
 it.each([{payer_user_id:1760},{client_id:2547},{amount_cents:19800},{source_kind:'family_ledger'},{source_id:'801'},{currency:'eur'}])('rejects idempotency reuse for changed binding %j',async patch=>{await expect(createQaPaymentIntent(input,database({intent:{...saved(),...patch}}))).rejects.toHaveProperty('status',409);});
 it.each([['success','succeeded'],['decline','requires_payment_method'],['processing','processing']])('records %s without an external processor',async(scenario,status)=>{
  const db=database();expect(await confirmQaPaymentIntent({id:'qa_pi_saved',agencyId:453,userId:1759,testCard:'0000000000000000',scenario},db)).toMatchObject({status,qa_simulated:true,amount_received:status==='succeeded'?18000:0});
  expect(db.commit).toHaveBeenCalledOnce();expect(db.rollback).not.toHaveBeenCalled();
  expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO user_activity_log'))).toHaveLength(1);
 });
 it('does not downgrade or repeat audit on successful replay',async()=>{
  const db=database({intent:{...saved(),status:'succeeded'}});expect((await confirmQaPaymentIntent({id:'qa_pi_saved',agencyId:453,userId:1759,testCard:'0000000000000000',scenario:'decline'},db)).status).toBe('succeeded');
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE qa_payment_simulations'))).toBe(false);
 });
 it.each(['canceled','foreign owner','refund'])('rejects %s and preserves the transaction',async reason=>{
  const row=saved();if(reason==='canceled')row.status='canceled';if(reason==='foreign owner')row.payer_user_id=1760;if(reason==='refund')row.source_kind='refund';
  const db=database({intent:row});await expect(confirmQaPaymentIntent({id:row.id,agencyId:453,userId:1759,testCard:'0000000000000000'},db)).rejects.toBeInstanceOf(Error);expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
 });
 it('rejects a non-QA gateway before querying or constructing a processor',async()=>{const db=database();await expect(qaSimulationGateway('acct_live',db)).rejects.toHaveProperty('status',403);expect(db.execute).not.toHaveBeenCalled();});
 it('rolls back a saved card when its affirmative authorization is rejected',async()=>{
  const db=database();const prior=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.includes('FROM guardian_payment_cards')?Promise.resolve([[]]):prior(sql,args));
  // A setup intent uses its own zero-amount binding.
  const setup={...saved(),source_kind:'card_setup',source_id:'qa-card:request',client_id:null,amount_cents:0};
  db.execute.mockImplementation((sql,args)=>sql.startsWith('SELECT * FROM qa_payment_simulations')?Promise.resolve([[setup]]):sql.includes('FROM guardian_payment_cards')?Promise.resolve([[]]):prior(sql,args));
  billing.recordBillingConsent.mockRejectedValueOnce(Object.assign(new Error('Read and sign'),{status:400}));
  await expect(createQaTestCard({agencyId:453,userId:1759,testCard:'0000000000000000',requestKey:'qa-card:request',name:'Morgan QA',consent:{accepted:false}},db)).rejects.toThrow('Read and sign');expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
 });
});
