import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { resolveClaimBillingSupervisorId: vi.fn() } }));
import pool from '../../config/database.js';
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import UserInsuranceCredentialing from '../../models/UserInsuranceCredentialing.model.js';
import { defaultSuperviseeBillingAllowed, superviseeBillingAllowed, validateSuperviseeBillingInput } from '../../utils/superviseePayerEligibility.js';
import { evaluateCredentialPayerEligibility, credentialPayerRows } from '../credentialPayerEligibility.service.js';
import { listProviderAcceptedInsurances, listProviderAcceptedInsurancesForDisplay, mergeAgencyInsuranceAcceptance } from '../providerAcceptedInsurance.service.js';
const row=(name, flag=null, id=1)=>({id,insurance_definition_id:id,name,allow_supervisee_billing:flag,billing_payer_id:name==='Other'?'Aetna':name,billing_payer_name:name});
beforeEach(()=>vi.resetAllMocks());
describe('supervisee payer defaults and decisions',()=>{
  it.each(['TRICARE','TriWest','TRICARE West Region','Tri-West Healthcare Alliance','Tri Care East','tri west'])('defaults %s off',name=>expect(defaultSuperviseeBillingAllowed(name)).toBe(false));
  it.each(['Aetna','Cigna','Medicaid','UnitedHealthcare'])('defaults %s on',name=>expect(superviseeBillingAllowed(row(name))).toBe(true));
  it('uses parent and connected billing payer names for defaults',()=>{
    expect(superviseeBillingAllowed({name:'West',parent_name:'TRICARE'})).toBe(false);
    expect(superviseeBillingAllowed({name:'Military plan',billing_payer_name:'TriWest'})).toBe(false);
  });
  it('honors explicit decisions',()=>{
    expect(superviseeBillingAllowed(row('TRICARE',1))).toBe(true);
    expect(superviseeBillingAllowed(row('Aetna',0))).toBe(false);
  });
  it.each(['false',1,0,null,{}])('rejects malformed checkbox values: %j',value=>expect(()=>validateSuperviseeBillingInput(value)).toThrow());
  it('permits omission and real booleans',()=>{for(const value of [undefined,true,false])expect(validateSuperviseeBillingInput(value)).toBe(value);});
});
describe('website insurance inheritance',()=>{
  function fixture(own,inherited,overrides=[]){
    SupervisorAssignment.resolveClaimBillingSupervisorId.mockResolvedValue(90);
    pool.execute.mockImplementation(async(sql,args)=>{
      if(sql.includes('FROM user_insurance_credentialing uic'))return [Number(args[0])===10?own:inherited];
      if(sql.includes('SELECT first_name'))return [[{first_name:'Billing',last_name:'Supervisor'}]];
      if(sql.includes('provider_insurance_overrides'))return [overrides];
      if(sql.includes('SELECT credential'))return [[{credential:'LPC'}]];
      throw Error('Unexpected query');
    });
  }
  it('keeps direct TRICARE credentials while excluding unchecked supervisor credentials',async()=>{
    fixture([row('TRICARE',0,1)],[row('TRICARE',0,1),row('TriWest',null,2),row('Aetna',1,3),row('Cigna',0,4)]);
    const rows=await listProviderAcceptedInsurances({userId:10,agencyId:2});
    expect(rows.map(r=>r.name)).toEqual(['Aetna','TRICARE']);
    expect(rows.find(r=>r.name==='TRICARE').source).toBe('self');
  });
  it('prevents overrides from re-adding excluded credentials or alternate military labels',async()=>{
    fixture([],[row('TriWest',null,1),row('Cigna',0,2)],[{id:1,label:'TRICARE West',is_allowed:1},{id:2,label:'Cigna',is_allowed:1},{id:3,label:'TriWest',is_allowed:1}]);
    expect(await listProviderAcceptedInsurancesForDisplay({userId:10,agencyId:2})).toEqual([]);
  });
  it('does not publish contradictory inherited credentials for the same billing payer',async()=>{
    fixture([],[row('Aetna',1,1),row('Other',0,2)]);
    expect(await listProviderAcceptedInsurances({userId:10,agencyId:2})).toEqual([]);
  });
  it('allows explicitly enabled inherited military payers',async()=>{
    fixture([],[row('TRICARE',1)]);
    expect(await listProviderAcceptedInsurancesForDisplay({userId:10,agencyId:2})).toEqual([expect.objectContaining({name:'TRICARE',source:'billing_supervisor'})]);
  });
  it('uses the connected billing name without duplicate acceptance aliases',async()=>{
    fixture([{...row('Aetna',1),name:'Aetna contract'}],[],[{id:1,label:'Aetna contract',is_allowed:1}]);
    expect(await listProviderAcceptedInsurancesForDisplay({userId:10,agencyId:2})).toHaveLength(1);
  });
  it('preserves unrelated agency acceptance',()=>expect(mergeAgencyInsuranceAcceptance([],[{id:1,label:'Medicaid',is_allowed:1}])[0].source).toBe('agency_acceptance'));
});
describe('claim payer eligibility',()=>{
  it('requires an exact verified billing payer mapping',()=>{
    expect(evaluateCredentialPayerEligibility([row('Aetna')],'OTHER').allowed).toBe(false);
    expect(evaluateCredentialPayerEligibility([{...row('Aetna'),billing_payer_name:null}],'Aetna').allowed).toBe(false);
    expect(evaluateCredentialPayerEligibility([row('Aetna')],'aetna').allowed).toBe(true);
  });
  it('rejects unchecked credentials and conflicting duplicates',()=>{
    expect(evaluateCredentialPayerEligibility([row('TriWest')],'TriWest').allowed).toBe(false);
    expect(evaluateCredentialPayerEligibility([row('Aetna',0)],'Aetna').allowed).toBe(false);
    expect(evaluateCredentialPayerEligibility([row('Aetna',1),row('Other',0,2)],'Aetna').allowed).toBe(false);
  });
  it('scopes records and mappings to the same agency',async()=>{
    pool.execute.mockResolvedValue([[]]);await credentialPayerRows(10,2);
    const [sql,args]=pool.execute.mock.calls[0];expect(args).toEqual([10,2]);
    expect(sql).toContain('AND icd.agency_id=?');expect(sql).toContain('link.agency_id=icd.agency_id');expect(sql).toContain('r.agency_id=icd.agency_id');expect(sql).toContain("d.directory_status='id_match'");
  });
});
describe('credential persistence',()=>{
  it('keeps prior decisions when older forms omit the new field',async()=>{
    pool.execute.mockResolvedValueOnce([[{id:1}]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:1,allow_supervisee_billing:0}]]);
    await UserInsuranceCredentialing.upsert({userId:10,insuranceCredentialingDefinitionId:2});
    const [sql,args]=pool.execute.mock.calls[1];expect(sql).toContain('COALESCE(?, allow_supervisee_billing)');expect(args[7]).toBeNull();expect(args).toHaveLength((sql.match(/\?/g)||[]).length);
  });
  it('persists explicit decisions and new defaults',async()=>{
    for(const value of [false,true,undefined]){
      pool.execute.mockReset().mockResolvedValueOnce([[]]).mockResolvedValueOnce([{insertId:1}]).mockResolvedValueOnce([[{id:1}]]);
      await UserInsuranceCredentialing.upsert({userId:10,insuranceCredentialingDefinitionId:2,allowSuperviseeBilling:value});
      const [sql,args]=pool.execute.mock.calls[1];expect(args.at(-1)).toBe(value ?? null);expect(args).toHaveLength((sql.match(/\?/g)||[]).length);
    }
  });
});
