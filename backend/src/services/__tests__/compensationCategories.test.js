import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import PayrollPaySystemRate from '../../models/PayrollPaySystemRate.model.js';
import PayrollCompensationLevel from '../../models/PayrollCompensationLevel.model.js';
import {assignUserCompensationLevel} from '../../controllers/payrollCompensationLevel.controller.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../../content/nluCompensationPolicy.js';
beforeEach(()=>{
  vi.restoreAllMocks();
  pool.execute.mockImplementation(async(sql,params)=>{
    if(sql.includes('FROM agencies'))return [[{slug:Number(params[0])===6?'nlu':'itsco',feature_flags:Number(params[0])===6?{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,nluCompensationEffectiveOn:'2026-11-21'}:{}}]];
    return [[]];
  });
});
it('returns all twenty NLU category/level slots with its prospective marker, and fifteen ITSCO slots',async()=>{
  const nlu=await PayrollPaySystemRate.listForAgency(6);
  expect(nlu).toHaveLength(20);expect(nlu.find(r=>r.category===4&&r.level===5)).toMatchObject({nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,nluCompensationEffectiveOn:'2026-11-21'});
  const itsco=await PayrollPaySystemRate.listForAgency(2);
  expect(itsco).toHaveLength(15);expect(itsco.some(r=>r.category===4)).toBe(false);expect(itsco[0].nluCompensationPolicyVersion).toBeNull();
  expect(await PayrollCompensationLevel.listForAgency(6)).toHaveLength(20);
});
it('accepts NLU Category 4 assignments and rejects Category 4 for ITSCO',async()=>{
  const assign=vi.spyOn(PayrollCompensationLevel,'assignToUser').mockResolvedValue();
  vi.spyOn(PayrollCompensationLevel,'getForUser').mockResolvedValue({category:4,level:2,bypass:1});
  const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
  const next=vi.fn(),nlu=response();
  await assignUserCompensationLevel({params:{userId:532},body:{agencyId:6,category:4,level:2,bypass:true},user:{id:501}},nlu,next);
  expect(assign).toHaveBeenCalledOnce();expect(nlu.json).toHaveBeenCalledWith({assignment:{category:4,level:2,bypass:1}});expect(next).not.toHaveBeenCalled();
  const itsco=response();await assignUserCompensationLevel({params:{userId:532},body:{agencyId:2,category:4,level:2,bypass:true}},itsco,next);
  expect(itsco.status).toHaveBeenCalledWith(400);expect(assign).toHaveBeenCalledOnce();
});
