import {describe,it,expect,vi} from 'vitest';
import {configureNluCompensation} from '../nluCompensationSetup.service.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../../content/nluCompensationPolicy.js';
const connection=({configured=false,category4=false}={})=>{
  const agency={id:6,slug:'nlu',new_pay_system_enabled:0,feature_flags:{unrelatedSetting:'preserved',...(configured?{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION}:{})}};
  const existing=[{agency_id:6,user_id:532,category:1,level:4,bypass:1,pay_system_enabled:0}];
  const db={beginTransaction:vi.fn(),rollback:vi.fn(),commit:vi.fn(),query:vi.fn(async(sql)=>{
    if(sql.includes("WHERE slug='nlu'"))return [[agency]];
    if(sql.includes('FROM payroll_user_compensation_levels '))return [existing];
    if(sql.includes('FROM payroll_pay_system_rates '))return [[{agency_id:6,category:category4?4:1,level:4,credit_rate:'30.00',hcode_rate:'28.00',indirect_rate:'20.00'}]];
    return [[]];
  })};
  return {db,agency,existing};
};
describe('NLU compensation setup audit and idempotence',()=>{
  it('returns a complete locked dry-run backup and leaves current assignments and activation unchanged',async()=>{
    const {db,agency,existing}=connection();const original=structuredClone({agency,existing});
    const preview=await configureNluCompensation(db);
    expect(preview).toMatchObject({dryRun:true,agencyId:6,renumbering:{1:2,2:3,3:4},assignmentCount:1,payrollEnabledBefore:0,configuration:{childcare:{category1:[17,18,19,20,20]},tutoring:{category2InPerson:[19,21,23,27,33]},preservesIndividualAgreements:true,requiresProspectiveIndividualAdoption:true}});
    expect(preview.backup.payroll_user_compensation_levels).toEqual(existing);
    expect({agency,existing}).toEqual(original);
    expect(db.query.mock.calls.some(([sql])=>/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
    expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
  });
  it('recognizes a completed policy marker and never renumbers twice',async()=>{
    const {db}=connection({configured:true});
    expect(await configureNluCompensation(db,{dryRun:false})).toEqual({alreadyConfigured:true,agencyId:6,version:NLU_COMPENSATION_POLICY_VERSION});
    expect(db.query).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
  });
  it('refuses ambiguous preexisting Category 4 data before any write',async()=>{
    const {db}=connection({category4:true});
    await expect(configureNluCompensation(db,{dryRun:false})).rejects.toThrow('Category 4 rows without the new policy marker');
    expect(db.query.mock.calls.some(([sql])=>/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
    expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
  });
});
