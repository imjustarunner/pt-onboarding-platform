import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../payerSetupCatalog.service.js',()=>({listPayerSetupRequests:vi.fn(async()=>[{claimmd_payer_id:'UNITED',directory_status:'id_match'}])}));
import pool from '../../config/database.js';
import {evaluateBillingPayerRules,evaluateClientBillingPayerRules,validateBillingPayerMutation,saveBillingPayerRule} from '../billingPayerRules.service.js';
import {filterCodesForClientPayer,clientPayerServiceEligibility} from '../clientPayerServiceEligibility.service.js';
import {isBillingRuleProvider,listBillingRuleProviders} from '../billingRules.service.js';
const rules=()=>({available:true,revision:3,payerPrograms:[{payerId:'UNITED',programs:['commercial','medicaid']}],credentialRules:[],serviceRules:[],overrides:[]});
const review=(extra={})=>evaluateBillingPayerRules({rules:rules(),policy:{payerId:'UNITED',programType:'commercial'},credentialTier:'intern_plus',serviceCodes:['H0004'],dateOfService:'2026-11-16',...extra});
const exception=(extra={})=>({payer_id:'UNITED',program:'commercial',plan_type:'',service_code:'H0004',allowed:1,effective_from:'2026-11-01',effective_through:'2026-11-30',reason:'Payer confirmed this service',policy_reference:'Policy dated 2026-11-01',...extra});
describe('client coverage drives code availability on a shared payer route',()=>{
 it('opens Medicaid services for a Medicaid-qualified provider with Commercial primary and Medicaid secondary',()=>{
  const options={codes:['H0004','T1017'],rules:rules(),policy:{payerId:'UNITED',programType:'commercial'},secondaryPolicy:{payerId:'COCHA',programType:'medicaid'},credentialTier:'bachelors',dateOfService:'2026-11-16'};
  expect(filterCodesForClientPayer(options)).toMatchObject({serviceCodes:['H0004','T1017'],coordinationCodes:['H0004','T1017'],message:expect.stringContaining('Medicaid secondary')});
  const result=evaluateClientBillingPayerRules({rules:rules(),insurance:{primary:options.policy,secondary:options.secondaryPolicy},credentialTier:'bachelors',serviceCodes:['H0004'],dateOfService:'2026-11-16'});
  expect(result).toMatchObject({ready:true,coordinationRequired:true,coverageSource:'secondary_medicaid',coordinationCodes:['H0004']});
 });
 it('does not open H codes without Medicaid secondary, with expired secondary, or with a secondary payer-specific block',()=>{
  const options={codes:['H0004'],rules:rules(),policy:{payerId:'UNITED',programType:'commercial'},credentialTier:'intern_plus',dateOfService:'2026-11-16'};
  for(const secondaryPolicy of [null,{payerId:'OTHER',programType:'commercial'},{payerId:'COCHA',programType:'medicaid',terminationDate:'2026-11-15'}])expect(filterCodesForClientPayer({...options,secondaryPolicy}).serviceCodes).toEqual([]);
  const r=rules();r.overrides=[exception({payer_id:'COCHA',program:'medicaid',allowed:0})];expect(filterCodesForClientPayer({...options,rules:r,secondaryPolicy:{payerId:'COCHA',programType:'medicaid'}}).serviceCodes).toEqual([]);
 });
 it('keeps same-route primary and secondary policies distinct and blocks copied policies',()=>{
  const insurance={primary:{payerId:'UNITED',programType:'commercial',memberId:'COMM-123'},secondary:{payerId:'UNITED',programType:'medicaid',memberId:'MED-456'}};
  const input={rules:rules(),insurance,credentialTier:'bachelors',serviceCodes:['H0004'],dateOfService:'2026-11-16'};expect(evaluateClientBillingPayerRules(input).ready).toBe(true);
  expect(evaluateClientBillingPayerRules({...input,payerSequence:2})).toMatchObject({ready:true,coverageSource:'secondary',coordinationRequired:false,program:'medicaid'});
  insurance.secondary.memberId='COMM-123';expect(evaluateClientBillingPayerRules(input).ready).toBe(false);
 });
 it('does not treat secondary coverage as a grant or bypass an explicit primary payer block',async()=>{
  const r=rules();r.overrides=[exception({allowed:0})];const insurance={primary:{payerId:'UNITED',programType:'commercial'},secondary:{payerId:'COCHA',programType:'medicaid'}};
  expect(evaluateClientBillingPayerRules({rules:r,insurance,credentialTier:'intern_plus',serviceCodes:['H0004'],dateOfService:'2026-11-16'}).ready).toBe(false);
  expect(filterCodesForClientPayer({codes:['H0004'],rules:r,policy:insurance.primary,secondaryPolicy:insurance.secondary,credentialTier:'intern_plus',dateOfService:'2026-11-16'}).serviceCodes).toEqual(['H0004']);
  const deps={care:async()=>({canProvideCare:true,credentialTier:'intern_plus'}),insurance:async()=>insurance,rules:async()=>rules(),credentialRules:async()=>new Map(),grants:async()=>[]};expect((await clientPayerServiceEligibility({agencyId:2,clientId:3,providerUserId:8,dateOfService:'2026-11-16',codes:['H0002','H0004']},deps)).serviceCodes).toEqual(['H0004']);
 });
 it('keeps Commercial and Medicaid separate on United',()=>{
  for(const [programType,expected] of [['commercial',['90837']],['medicaid',['90837','H0004','T1017']]])expect(filterCodesForClientPayer({codes:['90837','H0004','T1017'],rules:rules(),policy:{payerId:'UNITED',programType},credentialTier:'intern_plus',dateOfService:'2026-11-16'}).serviceCodes).toEqual(expected);
 });
 it('blocks an ambiguous shared payer and conflicting client category',()=>{
  expect(review({policy:{payerId:'UNITED'}})).toMatchObject({ready:false,blockers:[expect.stringContaining('multiple coverage categories')]});
  const r=rules();r.payerPrograms[0].programs=['commercial'];expect(review({rules:r,policy:{payerId:'UNITED',programType:'medicaid'}}).ready).toBe(false);
 });
 it.each(['commercial','tricare','medicare'])('defaults H codes and T1017 off for %s',program=>{
  expect(review({policy:{programType:program},serviceCodes:['H0031','T1017']}).blockers).toHaveLength(2);
 });
 it('does not let a payer exception bypass provider category permissions',()=>{
  const r=rules();r.overrides=[exception()];expect(review({rules:r,credentialTier:'bachelors'}).blockers[0]).toContain('credential category');
 });
 it('requires billing rule storage and valid service dates',()=>{
  expect(review({rules:{...rules(),available:false}}).ready).toBe(false);expect(review({dateOfService:'2026-02-30'}).ready).toBe(false);
 });
});
describe('individual payer service exceptions',()=>{
 it('uses exact payer, category, plan, and inclusive effective dates',()=>{
  const r=rules();r.overrides=[exception({plan_type:'Special plan'})];const policy={payerId:'UNITED',programType:'commercial',planType:'Special plan'};
  for(const dateOfService of ['2026-11-01','2026-11-30'])expect(review({rules:r,policy,dateOfService}).ready).toBe(true);
  for(const override of [{dateOfService:'2026-12-01'},{policy:{...policy,payerId:'OTHER'}},{policy:{...policy,planType:'Other plan'}}])expect(review({rules:r,policy,...override}).ready).toBe(false);
  r.overrides=[exception({program:'medicaid'})];expect(review({rules:r,policy}).ready).toBe(false);
 });
 it('supports explicit blocks and narrowly scoped plan exceptions',()=>{
  const r=rules();r.overrides=[exception({allowed:0}),exception({plan_type:'Special plan',allowed:1})];expect(review({rules:r}).ready).toBe(false);expect(review({rules:r,policy:{payerId:'UNITED',programType:'commercial',planType:'Special plan'}}).ready).toBe(true);
 });
 it('fails closed on overlapping effective rules',()=>{
  const r=rules();r.overrides=[exception(),exception({effective_from:'2026-11-02'})];expect(review({rules:r}).blockers[0]).toContain('conflicting');
 });
 it('changes the review fingerprint when rules change',()=>expect(review().fingerprint).not.toBe(review({rules:{...rules(),revision:4}}).fingerprint));
});
describe('provider and code permission intersection',()=>{
 it('retains personal grant requirements even for Medicaid',async()=>{
  const deps={care:async()=>({canProvideCare:true,credentialTier:'intern_plus'}),insurance:async()=>({primary:{payerId:'UNITED',programType:'medicaid'}}),rules:async()=>rules(),credentialRules:async()=>new Map(),grants:async()=>[]};
  const input={agencyId:2,clientId:3,providerUserId:8,dateOfService:'2026-11-16',codes:['H0002','H0004','90837']};
  expect((await clientPayerServiceEligibility(input,deps)).serviceCodes).toEqual(['H0004','90837']);
  expect((await clientPayerServiceEligibility(input,{...deps,grants:async()=>['H0002']})).serviceCodes).toContain('H0002');
  expect((await clientPayerServiceEligibility(input,{...deps,grants:async()=>['H0002'],insurance:async()=>({primary:{payerId:'UNITED',programType:'commercial'}})})).serviceCodes).toEqual(['90837']);
 });
 it('excludes support-only accounts and collapses duplicate provider rows',async()=>{
  expect(isBillingRuleProvider({role:'support',sees_clients:1})).toBe(false);
  expect(isBillingRuleProvider({role:'support',has_provider_access:1})).toBe(true);
  const provider={id:8,role:'provider',first_name:'Aneta',credential:'LSW'};
  pool.execute.mockImplementation(async sql=>sql.includes('FROM users u')?[[provider,{...provider},{id:12,role:'staff',sees_clients:1}]]:[[]]);
  expect((await listBillingRuleProviders(2)).map(p=>p.id)).toEqual([8]);
 });
});
describe('audited rule writes',()=>{
 const mutation=()=>({agencyId:2,actorUserId:17,revision:3,kind:'payer_service',payerId:'UNITED',program:'commercial',serviceCode:'H0004',planType:'',allowed:true,effectiveFrom:'2026-11-01',effectiveThrough:'2026-11-30',reason:'Confirmed exception for this plan',policyReference:'Payer confirmation 11/01'});
 function database(revision=3,overrides=[]){const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>sql.includes('SELECT revision')?[[{revision}]]:sql.startsWith('SELECT payer_id,program,plan_type')?[overrides]:sql.startsWith('SELECT')?[[]]:[{affectedRows:1}])};return{db,pool:{getConnection:async()=>db}};}
 it('rejects invalid dates, categories, and undocumented exceptions',()=>{
  for(const change of [{effectiveFrom:'2026-02-30'},{effectiveThrough:'2026-10-31'},{program:'other'},{reason:'ok'},{allowed:'true'},{revision:undefined}])expect(()=>validateBillingPayerMutation({...mutation(),...change})).toThrow();
 });
 it('rejects a stale revision and rolls back without writing a rule',async()=>{
  const d=database(4);await expect(saveBillingPayerRule(mutation(),d.pool)).rejects.toMatchObject({status:409});expect(d.db.rollback).toHaveBeenCalled();expect(d.db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO billing_payer_service_overrides'))).toBe(false);
 });
 it('appends the authenticated actor and prior affected value in the audit event',async()=>{
  const old=exception({allowed:0});const d=database(3,[old]);await saveBillingPayerRule(mutation(),d.pool);const audit=d.db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO billing_payer_rule_events'));
  expect(audit[1].slice(0,4)).toEqual([2,4,17,'payer_service']);expect(JSON.parse(audit[1][5])).toEqual(old);expect(d.db.commit).toHaveBeenCalled();
 });
 it('refuses an overlapping exception period',async()=>{const d=database(3,[exception({effective_from:'2026-11-02'})]);await expect(saveBillingPayerRule(mutation(),d.pool)).rejects.toMatchObject({status:409});expect(d.db.rollback).toHaveBeenCalled();});
});
