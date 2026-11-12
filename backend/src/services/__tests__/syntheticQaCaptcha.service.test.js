import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {skipSyntheticQaRecoveryCaptcha} from '../syntheticQaCaptcha.service.js';
const agency={id:453,slug:'nlu-qa-demo',is_active:1,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
const user={id:1496,is_demo:1,is_active:1,is_archived:0};
const input={identifier:'qa.nlu.tutor@example.com',organizationSlug:'nlu-qa-demo'};
describe('recovery verifies stored user and every active membership',()=>{
 it('binds the selected organization and synthetic identity without any secret lookup',async()=>{
  const db={execute:vi.fn().mockResolvedValueOnce([[user]]).mockResolvedValueOnce([[agency]])};
  expect(await skipSyntheticQaRecoveryCaptcha(input,db)).toBe(true);
  expect(db.execute.mock.calls[0][0]).not.toMatch(/password|token|secret/i);
  expect(db.execute.mock.calls[0][1]).toEqual([input.identifier,input.identifier]);
  expect(db.execute.mock.calls[1][1]).toEqual([1496]);
 });
 it.each([[],[user,user]])('fails closed for missing or ambiguous user',async users=>{
  const db={execute:vi.fn().mockResolvedValue([users])};expect(await skipSyntheticQaRecoveryCaptcha(input,db)).toBe(false);expect(db.execute).toHaveBeenCalledTimes(1);
 });
 it('rejects real and mixed-scope accounts even on the demo login route',async()=>{
  for(const [u,agencies] of [[{...user,is_demo:0},[agency]],[user,[agency,{id:6,slug:'nlu',is_active:1}]]]){
   const db={execute:vi.fn().mockResolvedValueOnce([[u]]).mockResolvedValueOnce([agencies])};expect(await skipSyntheticQaRecoveryCaptcha(input,db)).toBe(false);
  }
 });
 it('ignores client skip flags and fails closed on lookup failure',async()=>{
  expect(await skipSyntheticQaRecoveryCaptcha({...input,organizationSlug:'nlu',skipCaptcha:true},{execute:vi.fn().mockResolvedValueOnce([[user]]).mockResolvedValueOnce([[agency]])})).toBe(false);
  expect(await skipSyntheticQaRecoveryCaptcha(input,{execute:vi.fn().mockRejectedValue(new Error('unavailable'))})).toBe(false);
  const db={execute:vi.fn()};expect(await skipSyntheticQaRecoveryCaptcha({organizationSlug:input.organizationSlug,skipCaptcha:true},db)).toBe(false);expect(db.execute).not.toHaveBeenCalled();
 });
});
